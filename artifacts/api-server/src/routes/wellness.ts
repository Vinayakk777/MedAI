import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  healthInsightsTable,
  wellnessGoalsTable,
  goalLogsTable,
  preventiveRemindersTable,
  notificationProvidersTable,
  type HealthInsight,
  type WellnessGoal,
  type GoalLog,
  type PreventiveReminder,
} from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { generateAIInsights, computeSymptomTrends, calculateOverallHealthScore, type AIInsight } from "../lib/insightsEngine";
import { getUserMedicalMemory } from "../lib/memoryEngine";

const router: IRouter = Router();

// ─── Health Overview ───

router.get("/wellness/overview", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const memories = await getUserMedicalMemory(userId);
    const overview = calculateOverallHealthScore(memories);
    res.json(overview);
  } catch (err) {
    (req as any).log.error({ err }, "wellness overview failed");
    res.status(500).json({ error: "Failed to fetch health overview" });
  }
});

// ─── AI Insights ───

router.get("/wellness/insights", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const memories = await getUserMedicalMemory(userId);
    const result = await generateAIInsights(memories);

    if (result?.insights) {
      // Persist insights
      for (const insight of result.insights) {
        await db
          .insert(healthInsightsTable)
          .values({
            userId,
            category: insight.category,
            title: insight.title,
            description: insight.description,
            confidence: insight.confidence,
            relevanceScore: insight.relevanceScore,
            isActionable: insight.isActionable,
            suggestedAction: insight.suggestedAction ?? null,
            relatedSymptoms: insight.relatedSymptoms ?? [],
            relatedMetrics: insight.relatedMetrics ?? [],
          })
          .onConflictDoNothing();
      }
    }

    // Return latest 20 insights
    const rows = await db
      .select()
      .from(healthInsightsTable)
      .where(and(eq(healthInsightsTable.userId, userId), eq(healthInsightsTable.isDismissed, false)))
      .orderBy(desc(healthInsightsTable.createdAt))
      .limit(20);

    res.json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "wellness insights failed");
    res.status(500).json({ error: "Failed to generate insights" });
  }
});

// ─── Dismiss insight ───

router.patch("/wellness/insights/:id/dismiss", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    await db
      .update(healthInsightsTable)
      .set({ isDismissed: true })
      .where(and(eq(healthInsightsTable.id, id), eq(healthInsightsTable.userId, userId)));
    res.json({ success: true });
  } catch (err) {
    (req as any).log.error({ err }, "dismiss insight failed");
    res.status(500).json({ error: "Failed to dismiss insight" });
  }
});

// ─── Symptom Trends ───

router.get("/wellness/symptom-trends", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const memories = await getUserMedicalMemory(userId);
    const trends = computeSymptomTrends(memories);
    res.json(trends);
  } catch (err) {
    (req as any).log.error({ err }, "symptom trends failed");
    res.status(500).json({ error: "Failed to compute symptom trends" });
  }
});

// ─── Vital Trends ───

router.get("/wellness/vital-trends", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const memories = await getUserMedicalMemory(userId);
    const trends = computeVitalTrendsForAPI(memories);
    res.json(trends);
  } catch (err) {
    (req as any).log.error({ err }, "vital trends failed");
    res.status(500).json({ error: "Failed to compute vital trends" });
  }
});

// ─── Goals ───

router.get("/wellness/goals", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const rows = await db
      .select()
      .from(wellnessGoalsTable)
      .where(and(eq(wellnessGoalsTable.userId, userId), eq(wellnessGoalsTable.isArchived, false)))
      .orderBy(desc(wellnessGoalsTable.createdAt));
    res.json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "list goals failed");
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

router.post("/wellness/goals", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const { title, description, category, targetValue, targetUnit, frequency } = req.body as {
    title: string; description?: string; category: string;
    targetValue?: number; targetUnit?: string; frequency?: string;
  };
  try {
    const [row] = await db
      .insert(wellnessGoalsTable)
      .values({ userId, title, description, category, targetValue, targetUnit, frequency })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create goal failed");
    res.status(500).json({ error: "Failed to create goal" });
  }
});

router.post("/wellness/goals/:id/log", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const goalId = String(req.params.id);
  const { value, note } = req.body as { value?: number; note?: string };
  try {
    const [log] = await db
      .insert(goalLogsTable)
      .values({ userId, goalId, value, note })
      .returning();

    // Update goal progress
    const logs = await db
      .select()
      .from(goalLogsTable)
      .where(and(eq(goalLogsTable.goalId, goalId), eq(goalLogsTable.userId, userId)))
      .orderBy(desc(goalLogsTable.loggedAt));

    const streak = computeStreak(logs);
    const totalCompletions = logs.length;

    // Update target value if provided
    const updates: Record<string, any> = { streak, totalCompletions, updatedAt: new Date() };
    if (value != null) updates.currentValue = value;

    const [goal] = await db
      .update(wellnessGoalsTable)
      .set(updates)
      .where(and(eq(wellnessGoalsTable.id, goalId), eq(wellnessGoalsTable.userId, userId)))
      .returning();

    res.status(201).json({ log, goal, streak });
  } catch (err) {
    (req as any).log.error({ err }, "log goal failed");
    res.status(500).json({ error: "Failed to log goal progress" });
  }
});

router.get("/wellness/goals/:id/logs", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const goalId = String(req.params.id);
  try {
    const rows = await db
      .select()
      .from(goalLogsTable)
      .where(and(eq(goalLogsTable.goalId, goalId), eq(goalLogsTable.userId, userId)))
      .orderBy(desc(goalLogsTable.loggedAt));
    res.json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "list goal logs failed");
    res.status(500).json({ error: "Failed to fetch goal logs" });
  }
});

router.delete("/wellness/goals/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    await db
      .update(wellnessGoalsTable)
      .set({ isArchived: true })
      .where(and(eq(wellnessGoalsTable.id, id), eq(wellnessGoalsTable.userId, userId)));
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "archive goal failed");
    res.status(500).json({ error: "Failed to archive goal" });
  }
});

// ─── Preventive Reminders ───

router.get("/wellness/reminders", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const rows = await db
      .select()
      .from(preventiveRemindersTable)
      .where(and(eq(preventiveRemindersTable.userId, userId), eq(preventiveRemindersTable.isDismissed, false)))
      .orderBy(asc(preventiveRemindersTable.dueDate));
    res.json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "list reminders failed");
    res.status(500).json({ error: "Failed to fetch reminders" });
  }
});

router.post("/wellness/reminders", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const { category, title, description, frequency } = req.body as {
    category: string; title: string; description?: string; frequency?: string;
  };
  try {
    const [row] = await db
      .insert(preventiveRemindersTable)
      .values({ userId, category, title, description, frequency })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    (req as any).log.error({ err }, "create reminder failed");
    res.status(500).json({ error: "Failed to create reminder" });
  }
});

router.patch("/wellness/reminders/:id/complete", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    await db
      .update(preventiveRemindersTable)
      .set({ isCompleted: true, completedAt: new Date() })
      .where(and(eq(preventiveRemindersTable.id, id), eq(preventiveRemindersTable.userId, userId)));
    res.json({ success: true });
  } catch (err) {
    (req as any).log.error({ err }, "complete reminder failed");
    res.status(500).json({ error: "Failed to complete reminder" });
  }
});

router.patch("/wellness/reminders/:id/dismiss", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    await db
      .update(preventiveRemindersTable)
      .set({ isDismissed: true })
      .where(and(eq(preventiveRemindersTable.id, id), eq(preventiveRemindersTable.userId, userId)));
    res.json({ success: true });
  } catch (err) {
    (req as any).log.error({ err }, "dismiss reminder failed");
    res.status(500).json({ error: "Failed to dismiss reminder" });
  }
});

// ─── Initialize default preventive reminders ───

router.post("/wellness/reminders/init-defaults", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const existing = await db
      .select()
      .from(preventiveRemindersTable)
      .where(eq(preventiveRemindersTable.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      res.json({ message: "Defaults already initialized" });
      return;
    }

    const defaults = [
      { category: "checkup", title: "Annual Health Checkup", description: "Schedule your comprehensive annual physical examination.", frequency: "annual" },
      { category: "screening", title: "Blood Pressure Check", description: "Regular blood pressure monitoring is recommended at least once a year for most adults.", frequency: "annual" },
      { category: "screening", title: "Blood Sugar Screening", description: "Consider diabetes screening, especially if you have risk factors.", frequency: "annual" },
      { category: "dental", title: "Dental Checkup", description: "Regular dental examinations every 6 months help maintain oral health.", frequency: "biannual" },
      { category: "eye", title: "Eye Examination", description: "Comprehensive eye exams are recommended every 1-2 years.", frequency: "annual" },
      { category: "vaccination", title: "Annual Flu Vaccine", description: "Seasonal influenza vaccination is recommended annually.", frequency: "annual" },
    ];

    for (const d of defaults) {
      await db.insert(preventiveRemindersTable).values({ userId, ...d });
    }

    const rows = await db
      .select()
      .from(preventiveRemindersTable)
      .where(eq(preventiveRemindersTable.userId, userId));
    res.status(201).json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "init defaults failed");
    res.status(500).json({ error: "Failed to initialize reminders" });
  }
});

// ─── Notification Providers ───

router.get("/wellness/notification-providers", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const rows = await db
      .select()
      .from(notificationProvidersTable)
      .where(eq(notificationProvidersTable.userId, userId));
    res.json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "list notification providers failed");
    res.status(500).json({ error: "Failed to fetch notification providers" });
  }
});

router.patch("/wellness/notification-providers/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  const { enabled, config } = req.body as { enabled?: boolean; config?: Record<string, any> };
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (enabled !== undefined) updates.enabled = enabled;
    if (config) updates.config = config;
    const [row] = await db
      .update(notificationProvidersTable)
      .set(updates)
      .where(and(eq(notificationProvidersTable.id, id), eq(notificationProvidersTable.userId, userId)))
      .returning();
    res.json(row);
  } catch (err) {
    (req as any).log.error({ err }, "update provider failed");
    res.status(500).json({ error: "Failed to update notification provider" });
  }
});

// ─── Helper: compute streak from logs ───

function computeStreak(logs: GoalLog[]): number {
  if (logs.length === 0) return 0;
  const sorted = logs
    .map((l) => new Date(l.loggedAt).toISOString().split("T")[0])
    .sort((a, b) => b.localeCompare(a));
  let streak = 1;
  const today = new Date().toISOString().split("T")[0];
  // Only count if latest log is today or yesterday
  const latest = sorted[0];
  const latestDate = new Date(latest);
  const diff = Math.round((new Date(today).getTime() - latestDate.getTime()) / 86400000);
  if (diff > 1) return 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const dayDiff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
    if (dayDiff === 1) streak++;
    else break;
  }
  return streak;
}

// ─── Helper for vital trends ───

interface VitalTrendItem {
  metric: string;
  label: string;
  values: { date: string; value: number }[];
  average: number | null;
  min: number | null;
  max: number | null;
  trend: string;
  changePercent: number | null;
  significance?: string;
}

function computeVitalTrendsForAPI(memories: any[]): VitalTrendItem[] {
  const metricConfig = [
    { key: "heartRate", label: "Heart Rate", normalRange: [60, 100], unit: "bpm" },
    { key: "systolic", label: "Systolic BP", normalRange: [90, 120], unit: "mmHg" },
    { key: "oxygenSaturation", label: "Oxygen Saturation", normalRange: [95, 100], unit: "%" },
    { key: "bloodGlucose", label: "Blood Glucose", normalRange: [70, 140], unit: "mg/dL" },
    { key: "weight", label: "Weight", normalRange: [], unit: "kg" },
    { key: "painScore", label: "Pain Score", normalRange: [0, 3], unit: "/10" },
  ];

  return metricConfig.map(({ key, label, normalRange }) => {
    const values: { date: string; value: number }[] = [];
    for (const m of memories) {
      const vitals = m.vitalSigns ?? m;
      const raw = vitals[key];
      if (raw != null) {
        values.push({ date: new Date(m.consultationDate).toISOString().split("T")[0], value: Number(raw) });
      }
    }
    values.sort((a, b) => a.date.localeCompare(b.date));

    const nums = values.map((v) => v.value);
    const avg = nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10 : null;
    const min = nums.length > 0 ? Math.min(...nums) : null;
    const max = nums.length > 0 ? Math.max(...nums) : null;

    let trend = "insufficient_data";
    let changePercent: number | null = null;
    if (nums.length >= 3) {
      const mid = Math.floor(nums.length / 2);
      const firstAvg = nums.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondAvg = nums.slice(mid).reduce((a, b) => a + b, 0) / (nums.length - mid);
      changePercent = firstAvg > 0 ? Math.round((secondAvg - firstAvg) / firstAvg * 100) : 0;
      trend = changePercent < -5 ? "decreasing" : changePercent > 5 ? "increasing" : "stable";
    }

    let significance: string | undefined;
    if (avg != null && normalRange.length === 2) {
      if (avg < normalRange[0]) significance = `Below normal range (${normalRange[0]}-${normalRange[1]})`;
      else if (avg > normalRange[1]) significance = `Above normal range (${normalRange[0]}-${normalRange[1]})`;
    }

    return { metric: key, label, values, average: avg, min, max, trend, changePercent, significance };
  });
}

export default router;
