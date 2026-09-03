import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  vitalsTable,
  healthMetricsTable,
  medicationsTable,
  healthReportsTable,
  riskAssessmentsTable,
  symptomLogsTable,
  wellnessGoalsTable,
  preventiveRemindersTable,
} from "@workspace/db";
import { eq, and, desc, sql, isNotNull, gte, lte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import {
  insertVitalSchema,
  insertHealthMetricSchema,
  insertMedicationSchema,
  updateMedicationSchema,
  insertHealthReportSchema,
  insertRiskAssessmentSchema,
  insertSymptomLogSchema,
} from "@workspace/db";
import {
  analyzeCurrentVitals,
  calculateTrends,
  generateAlerts,
  calculateHealthScore,
  findMissingMeasurements,
  generateAIInsights,
  type VitalsAssessment,
  type TrendAnalysis,
  type VitalsAlert,
  type VitalsAnalysis,
} from "../lib/vitalsEngine";
import {
  getProvider,
  getAllProviders,
  isGoogleHealthConfigured,
  createDemoHealthConfig,
  isDemoToken,
  type HealthProviderConfig,
} from "../lib/healthProviders";
import { searchMedicationGuide } from "../lib/medicationGuide";

const router: IRouter = Router();

// ---------- Overview ----------

router.get("/dashboard/overview", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const [vitalCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(vitalsTable)
      .where(eq(vitalsTable.userId, userId));

    const [metricCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(healthMetricsTable)
      .where(eq(healthMetricsTable.userId, userId));

    const [medActive] = await db
      .select({ count: sql<number>`count(*)` })
      .from(medicationsTable)
      .where(and(eq(medicationsTable.userId, userId), eq(medicationsTable.status, "active")));

    const [alertCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(riskAssessmentsTable)
      .where(and(eq(riskAssessmentsTable.userId, userId), eq(riskAssessmentsTable.level, "high")));

    const [reportCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(healthReportsTable)
      .where(eq(healthReportsTable.userId, userId));

    const [symptomCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(symptomLogsTable)
      .where(eq(symptomLogsTable.userId, userId));

    const [avgScore] = await db
      .select({ avg: sql<number | null>`avg(${healthReportsTable.score})` })
      .from(healthReportsTable)
      .where(and(eq(healthReportsTable.userId, userId), isNotNull(healthReportsTable.score)));

    const healthScore = avgScore?.avg != null ? Math.round(avgScore.avg) : null;

    res.json({
      healthScore: healthScore ?? 0,
      activeAlerts: alertCount?.count ?? 0,
      activeMedications: medActive?.count ?? 0,
      checkIns: (vitalCount?.count ?? 0) + (metricCount?.count ?? 0) + (symptomCount?.count ?? 0),
      reportCount: reportCount?.count ?? 0,
    });
  } catch (err) {
    (req as any).log.error({ err }, "get overview failed");
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

// ---------- Vitals Analysis & Insights ----------

router.get("/dashboard/vitals/analysis", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const [latest] = await db
      .select()
      .from(vitalsTable)
      .where(eq(vitalsTable.userId, userId))
      .orderBy(desc(vitalsTable.recordedAt))
      .limit(1);

    if (!latest) {
      res.json({ assessments: null, trendAnalyses: [], alerts: [], healthScore: 0, healthScoreExplanation: "", missingMeasurements: [], summary: "No vitals recorded yet.", disclaimer: "These measurements are for informational purposes only." });
      return;
    }

    const history = await db
      .select()
      .from(vitalsTable)
      .where(eq(vitalsTable.userId, userId))
      .orderBy(desc(vitalsTable.recordedAt))
      .limit(10);

    const assessment: VitalsAssessment = {
      heartRate: latest.heartRate,
      systolic: latest.systolic,
      diastolic: latest.diastolic,
      respiratoryRate: latest.respiratoryRate,
      temperature: latest.temperature ? Number(latest.temperature) : null,
      oxygenSaturation: latest.oxygenSaturation,
      bloodGlucose: latest.bloodGlucose ? Number(latest.bloodGlucose) : null,
      weight: latest.weight ? Number(latest.weight) : null,
      height: latest.height ? Number(latest.height) : null,
      bmi: latest.bmi ? Number(latest.bmi) : null,
      waistCircumference: latest.waistCircumference ? Number(latest.waistCircumference) : null,
      painScore: latest.painScore,
      source: latest.source,
      recordedAt: latest.recordedAt.toISOString(),
    };

    const histAssessments: VitalsAssessment[] = history.slice(1).map((v) => ({
      heartRate: v.heartRate, systolic: v.systolic, diastolic: v.diastolic,
      respiratoryRate: v.respiratoryRate, temperature: v.temperature ? Number(v.temperature) : null,
      oxygenSaturation: v.oxygenSaturation, bloodGlucose: v.bloodGlucose ? Number(v.bloodGlucose) : null,
      weight: v.weight ? Number(v.weight) : null, height: v.height ? Number(v.height) : null,
      bmi: v.bmi ? Number(v.bmi) : null, waistCircumference: v.waistCircumference ? Number(v.waistCircumference) : null,
      painScore: v.painScore, source: v.source, recordedAt: v.recordedAt.toISOString(),
    }));

    const analysis = analyzeCurrentVitals(assessment);
    const trends = calculateTrends(assessment, histAssessments);
    const alerts = generateAlerts(analysis);
    const healthScore = calculateHealthScore(analysis, trends);
    const missing = findMissingMeasurements(assessment);
    const result = await generateAIInsights(assessment, [], history.slice(1).map((v) => ({
      heartRate: v.heartRate, systolic: v.systolic, diastolic: v.diastolic,
      respiratoryRate: v.respiratoryRate, temperature: v.temperature ? Number(v.temperature) : null,
      oxygenSaturation: v.oxygenSaturation, bloodGlucose: v.bloodGlucose ? Number(v.bloodGlucose) : null,
      weight: v.weight ? Number(v.weight) : null, height: v.height ? Number(v.height) : null,
      bmi: v.bmi ? Number(v.bmi) : null, waistCircumference: v.waistCircumference ? Number(v.waistCircumference) : null,
      painScore: v.painScore, source: v.source, recordedAt: v.recordedAt.toISOString(),
    })));

    res.json(result ?? {
      assessments: analysis, trendAnalyses: trends, alerts,
      healthScore: healthScore.healthScore, healthScoreExplanation: healthScore.explanation,
      missingMeasurements: missing,
      summary: "Vital signs have been assessed.",
      disclaimer: "These measurements are for informational purposes only.",
    });
  } catch (err) {
    (req as any).log.error({ err }, "analyze vitals failed");
    res.status(500).json({ error: "Failed to analyze vitals" });
  }
});

router.get("/dashboard/vitals/history", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const range = (req.query.range as string) || "month";
  const now = new Date();
  let from: Date;

  switch (range) {
    case "24h": from = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
    case "week": from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case "month": from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    case "3months": from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
    case "year": from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
    default: from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  try {
    const rows = await db
      .select()
      .from(vitalsTable)
      .where(and(eq(vitalsTable.userId, userId), gte(vitalsTable.recordedAt, from)))
      .orderBy(desc(vitalsTable.recordedAt));
    res.json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "list vitals history failed");
    res.status(500).json({ error: "Failed to fetch vitals history" });
  }
});

router.get("/dashboard/vitals/trends", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const metric = req.query.metric as string;
  const range = (req.query.range as string) || "month";
  const now = new Date();
  let from: Date;

  switch (range) {
    case "24h": from = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
    case "week": from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case "month": from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    case "3months": from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
    case "year": from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
    default: from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  try {
    const rows = await db
      .select()
      .from(vitalsTable)
      .where(and(eq(vitalsTable.userId, userId), gte(vitalsTable.recordedAt, from)))
      .orderBy(vitalsTable.recordedAt);

    const fieldMap: Record<string, string> = {
      heartRate: "heartRate",
      systolic: "systolic",
      diastolic: "diastolic",
      temperature: "temperature",
      oxygenSaturation: "oxygenSaturation",
      bloodGlucose: "bloodGlucose",
      weight: "weight",
      bmi: "bmi",
      respiratoryRate: "respiratoryRate",
      painScore: "painScore",
    };

    const data = rows.map((r) => ({
      date: r.recordedAt.toISOString(),
      value: metric && fieldMap[metric] ? (r as any)[fieldMap[metric]] : r.heartRate,
    })).filter((d) => d.value != null);

    res.json(data);
  } catch (err) {
    (req as any).log.error({ err }, "fetch vitals trends failed");
    res.status(500).json({ error: "Failed to fetch vitals trends" });
  }
});

// ---------- Health Providers ----------

router.get("/dashboard/providers", requireAuth, (_req, res) => {
  const providers = getAllProviders().map((p) => ({
    name: p.name,
    displayName: p.displayName,
    connected: false,
  }));
  res.json(providers);
});

router.post("/dashboard/providers/:name/connect", requireAuth, (req, res) => {
  const name = String(req.params.name);
  const provider = getProvider(name);
  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  const { redirectUri } = req.body as { redirectUri?: string };
  try {
    if (name === "google_health" && !isGoogleHealthConfigured()) {
      res.json({
        url: null,
        demo: true,
        provider: provider.name,
        config: createDemoHealthConfig(provider.name),
        message:
          "Google Health is running in demo mode because GOOGLE_HEALTH_CLIENT_ID and " +
          "GOOGLE_HEALTH_CLIENT_SECRET are not configured. Sync will use simulated vitals. " +
          "Set these env vars to connect your real Google account.",
      });
      return;
    }
    res.json({ url: provider.connectUrl(redirectUri ?? "http://localhost:3000/callback") });
  } catch (err) {
    (req as any).log.error({ err }, "provider connect failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to build connect URL" });
  }
});

router.post("/dashboard/providers/:name/callback", requireAuth, async (req, res) => {
  const name = String(req.params.name);
  const provider = getProvider(name);
  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  const { code, redirectUri } = req.body as { code: string; redirectUri?: string };
  try {
    const config = await provider.exchangeCode(code, redirectUri ?? "http://localhost:3000/callback");
    res.json({ success: true, provider: provider.name, config });
  } catch (err) {
    (req as any).log.error({ err }, "provider callback failed");
    res.status(500).json({ error: "Failed to exchange code" });
  }
});

router.post("/dashboard/providers/:name/sync", requireAuth, async (req, res) => {
  const name = String(req.params.name);
  const provider = getProvider(name);
  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  const { userId } = req as AuthRequest;
  const config = (req.body?.config ?? {}) as HealthProviderConfig;

  try {
    if (!provider.isConnected(config)) {
      res.json({ synced: 0, message: "Provider not connected. Please authenticate first." });
      return;
    }

    const vitals = await provider.fetchLatestVitals(config);
    const now = new Date();
    const isDemo = isDemoToken(config.accessToken) || isDemoToken(config.refreshToken);
    const source = isDemo ? "demo" : provider.name;

    // Split provider fields into vitals columns and health-metric columns
    const vitalsFields: Record<string, keyof typeof vitals> = {
      heartRate: "heartRate", systolic: "systolic", diastolic: "diastolic",
      respiratoryRate: "respiratoryRate", temperature: "temperature",
      oxygenSaturation: "oxygenSaturation", bloodGlucose: "bloodGlucose",
      weight: "weight", height: "height",
    };
    const metricFields: Record<string, keyof typeof vitals> = {
      steps: "steps", sleepHours: "sleepHours", caloriesBurned: "caloriesBurned",
      activityLevel: "activityLevel", stressLevel: "stressLevel",
    };

    const vitalData: Record<string, any> = { userId, source, recordedAt: now };
    for (const [col, key] of Object.entries(vitalsFields)) {
      const val = vitals[key];
      if (val != null) vitalData[col] = val;
    }

    const metricData: Record<string, any> = { userId, source, metricDate: now };
    for (const [col, key] of Object.entries(metricFields)) {
      const val = vitals[key];
      if (val != null) metricData[col] = val;
    }
    for (const [col, key] of Object.entries(vitalsFields)) {
      const val = vitals[key];
      if (val != null) metricData[col] = val;
    }

    const [vitalRow] = await db.insert(vitalsTable).values(vitalData as any).returning();
    const [metricRow] = await db.insert(healthMetricsTable).values(metricData as any).returning();

    // Auto-create wellness goals from provider activity data (steps, sleep).
    // Skipped for demo syncs so simulated data never gets stored as real goals.
    let wellnessGoalsCreated = 0;
    let remindersCreated = 0;

    if (!isDemo) {
      const existingGoals = await db
        .select()
        .from(wellnessGoalsTable)
        .where(eq(wellnessGoalsTable.userId, userId));
      const existingGoalCategories = new Set(existingGoals.map((g) => g.category));

      if (vitals.steps != null && !existingGoalCategories.has("activity")) {
        await db.insert(wellnessGoalsTable).values({
          userId,
          title: "Daily Steps Target",
          description: "Automatically created from your connected health device.",
          category: "activity",
          targetValue: Math.max(vitals.steps, 10000),
          targetUnit: "steps",
          currentValue: vitals.steps,
          frequency: "daily",
        });
        existingGoalCategories.add("activity");
        wellnessGoalsCreated++;
      }
      if (vitals.sleepHours != null && !existingGoalCategories.has("sleep")) {
        await db.insert(wellnessGoalsTable).values({
          userId,
          title: "Sleep Goal",
          description: "Aim for 7-9 hours of sleep per night.",
          category: "sleep",
          targetValue: 8,
          targetUnit: "hours",
          currentValue: vitals.sleepHours,
          frequency: "daily",
        });
        existingGoalCategories.add("sleep");
        wellnessGoalsCreated++;
      }

      // Auto-create preventive care reminders from abnormal vitals.
      // Skipped for demo syncs so simulated data never gets stored as real reminders.
      const existingReminders = await db
        .select()
        .from(preventiveRemindersTable)
        .where(eq(preventiveRemindersTable.userId, userId));
      const existingReminderTitles = new Set(existingReminders.map((r) => r.title.toLowerCase()));

      if (vitals.heartRate != null && (vitals.heartRate > 100 || vitals.heartRate < 50) && !existingReminderTitles.has("heart rate monitoring")) {
        await db.insert(preventiveRemindersTable).values({
          userId,
          category: "screening",
          title: "Heart Rate Monitoring",
          description: `Your synced heart rate (${vitals.heartRate} bpm) is outside the typical resting range. Consider discussing it with your physician.`,
          frequency: "annual",
        });
        remindersCreated++;
      }
      if (vitals.systolic != null && (vitals.systolic > 130 || vitals.systolic < 90) && !existingReminderTitles.has("blood pressure check")) {
        await db.insert(preventiveRemindersTable).values({
          userId,
          category: "screening",
          title: "Blood Pressure Check",
          description: `Your synced blood pressure (${vitals.systolic}/${vitals.diastolic ?? "?"}) is elevated. Regular monitoring is recommended.`,
          frequency: "annual",
        });
        remindersCreated++;
      }
      if (vitals.oxygenSaturation != null && vitals.oxygenSaturation < 94 && !existingReminderTitles.has("oxygen saturation review")) {
        await db.insert(preventiveRemindersTable).values({
          userId,
          category: "checkup",
          title: "Oxygen Saturation Review",
          description: `Your synced oxygen saturation (${vitals.oxygenSaturation}%) is low. This may warrant medical review.`,
          frequency: "as-needed",
        });
        remindersCreated++;
      }
      if (vitals.bloodGlucose != null && vitals.bloodGlucose > 126 && !existingReminderTitles.has("blood sugar screening")) {
        await db.insert(preventiveRemindersTable).values({
          userId,
          category: "screening",
          title: "Blood Sugar Screening",
          description: `Your synced blood glucose (${vitals.bloodGlucose} mg/dL) is elevated. Consider diabetes screening.`,
          frequency: "annual",
        });
        remindersCreated++;
      }
    }

    res.status(201).json({
      synced: 1,
      vital: vitalRow,
      metric: metricRow,
      wellnessGoalsCreated,
      remindersCreated,
      demo: isDemo,
    });
  } catch (err) {
    (req as any).log.error({ err }, "provider sync failed");
    res.status(500).json({ error: "Failed to sync from provider" });
  }
});

// ---------- Vitals ----------

router.get("/dashboard/vitals", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select()
      .from(vitalsTable)
      .where(eq(vitalsTable.userId, userId))
      .orderBy(desc(vitalsTable.recordedAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(vitalsTable)
      .where(eq(vitalsTable.userId, userId));

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    (req as any).log.error({ err }, "list vitals failed");
    res.status(500).json({ error: "Failed to fetch vitals" });
  }
});

router.post("/dashboard/vitals", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = insertVitalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const [row] = await db
      .insert(vitalsTable)
      .values({ ...parsed.data, userId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create vital failed");
    res.status(500).json({ error: "Failed to create vital" });
  }
});

router.delete("/dashboard/vitals/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  try {
    await db
      .delete(vitalsTable)
      .where(and(eq(vitalsTable.id, id), eq(vitalsTable.userId, userId)));
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "delete vital failed");
    res.status(500).json({ error: "Failed to delete vital" });
  }
});

// ---------- Health Metrics ----------

router.get("/dashboard/metrics", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select()
      .from(healthMetricsTable)
      .where(eq(healthMetricsTable.userId, userId))
      .orderBy(desc(healthMetricsTable.metricDate))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(healthMetricsTable)
      .where(eq(healthMetricsTable.userId, userId));

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    (req as any).log.error({ err }, "list metrics failed");
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

router.post("/dashboard/metrics", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = insertHealthMetricSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const [row] = await db
      .insert(healthMetricsTable)
      .values({ ...parsed.data, userId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create metric failed");
    res.status(500).json({ error: "Failed to create metric" });
  }
});

router.delete("/dashboard/metrics/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  try {
    await db
      .delete(healthMetricsTable)
      .where(and(eq(healthMetricsTable.id, id), eq(healthMetricsTable.userId, userId)));
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "delete metric failed");
    res.status(500).json({ error: "Failed to delete metric" });
  }
});

// ---------- Medications ----------

router.get("/dashboard/medications", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select()
      .from(medicationsTable)
      .where(eq(medicationsTable.userId, userId))
      .orderBy(desc(medicationsTable.updatedAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(medicationsTable)
      .where(eq(medicationsTable.userId, userId));

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    (req as any).log.error({ err }, "list medications failed");
    res.status(500).json({ error: "Failed to fetch medications" });
  }
});

router.post("/dashboard/medications", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = insertMedicationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const [row] = await db
      .insert(medicationsTable)
      .values({ ...parsed.data, userId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create medication failed");
    res.status(500).json({ error: "Failed to create medication" });
  }
});

router.patch("/dashboard/medications/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  const parsed = updateMedicationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const [updated] = await db
      .update(medicationsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(medicationsTable.id, id), eq(medicationsTable.userId, userId)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Medication not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    (req as any).log.error({ err }, "update medication failed");
    res.status(500).json({ error: "Failed to update medication" });
  }
});

router.delete("/dashboard/medications/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  try {
    await db
      .delete(medicationsTable)
      .where(and(eq(medicationsTable.id, id), eq(medicationsTable.userId, userId)));
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "delete medication failed");
    res.status(500).json({ error: "Failed to delete medication" });
  }
});

// ---------- Medication Guide ----------

router.get("/dashboard/medication-guide", requireAuth, (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  try {
    const results = searchMedicationGuide(q);
    res.json(results);
  } catch (err) {
    (req as any).log.error({ err }, "medication guide search failed");
    res.status(500).json({ error: "Failed to search medication guide" });
  }
});

// ---------- Health Reports ----------

router.get("/dashboard/reports", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select()
      .from(healthReportsTable)
      .where(eq(healthReportsTable.userId, userId))
      .orderBy(desc(healthReportsTable.reportDate))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(healthReportsTable)
      .where(eq(healthReportsTable.userId, userId));

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    (req as any).log.error({ err }, "list reports failed");
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

router.post("/dashboard/reports", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = insertHealthReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const [row] = await db
      .insert(healthReportsTable)
      .values({ ...parsed.data, userId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create report failed");
    res.status(500).json({ error: "Failed to create report" });
  }
});

router.delete("/dashboard/reports/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  try {
    await db
      .delete(healthReportsTable)
      .where(and(eq(healthReportsTable.id, id), eq(healthReportsTable.userId, userId)));
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "delete report failed");
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// ---------- Risk Assessments ----------

router.get("/dashboard/risk-assessments", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select()
      .from(riskAssessmentsTable)
      .where(eq(riskAssessmentsTable.userId, userId))
      .orderBy(desc(riskAssessmentsTable.assessedAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(riskAssessmentsTable)
      .where(eq(riskAssessmentsTable.userId, userId));

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    (req as any).log.error({ err }, "list risk assessments failed");
    res.status(500).json({ error: "Failed to fetch risk assessments" });
  }
});

router.post("/dashboard/risk-assessments", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = insertRiskAssessmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const [row] = await db
      .insert(riskAssessmentsTable)
      .values({ ...parsed.data, userId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create risk assessment failed");
    res.status(500).json({ error: "Failed to create risk assessment" });
  }
});

router.delete("/dashboard/risk-assessments/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  try {
    await db
      .delete(riskAssessmentsTable)
      .where(and(eq(riskAssessmentsTable.id, id), eq(riskAssessmentsTable.userId, userId)));
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "delete risk assessment failed");
    res.status(500).json({ error: "Failed to delete risk assessment" });
  }
});

// ---------- Symptom Logs ----------

router.get("/dashboard/symptom-logs", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = await db
      .select()
      .from(symptomLogsTable)
      .where(eq(symptomLogsTable.userId, userId))
      .orderBy(desc(symptomLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(symptomLogsTable)
      .where(eq(symptomLogsTable.userId, userId));

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    (req as any).log.error({ err }, "list symptom logs failed");
    res.status(500).json({ error: "Failed to fetch symptom logs" });
  }
});

router.post("/dashboard/symptom-check", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const parsed = insertSymptomLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const [row] = await db
      .insert(symptomLogsTable)
      .values({ ...parsed.data, userId })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create symptom log failed");
    res.status(500).json({ error: "Failed to log symptom check" });
  }
});

export default router;
