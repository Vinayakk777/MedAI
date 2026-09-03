import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { healthReportsTable, conversationsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { generateReport, generateReportSummary } from "../lib/reportEngine";
import { generateConsultationPDF } from "../lib/pdfGenerator";
import {
  createInitialState,
  buildSystemPrompt,
  getEffectiveDDx,
  type ConsultationState,
} from "../lib/orchestrator";

const router: IRouter = Router();

router.get("/reports", requireAuth, async (req, res) => {
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

router.get("/reports/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;
  try {
    const [row] = await db
      .select()
      .from(healthReportsTable)
      .where(and(eq(healthReportsTable.id, id), eq(healthReportsTable.userId, userId)));
    if (!row) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    (req as any).log.error({ err }, "get report failed");
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

router.post("/reports/generate/:conversationId", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const conversationId = req.params.conversationId as string;

  try {
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.userId, userId)));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const summary = conv.clinicalSummary as Record<string, any> | null;
    const state: ConsultationState = createInitialState(
      conv.lastMessage ?? "",
      [],
    );

    if (summary) {
      if (summary.symptoms) state.symptomAnalysis = { clinicalProfile: {}, allSymptoms: [], secondarySymptoms: [], primarySymptom: undefined, missingInformation: [], emergencyFlags: [], isEmergency: false, followUpQuestions: [], confidence: "moderate", confidenceReason: "", assessmentReady: false } as any;
      if (summary.conditions) state.differentialDiagnosis = { conditions: summary.conditions.map((c: any) => ({ name: c.name || c.condition, confidence: c.confidence || 50, supportingSymptoms: c.supportingFindings || [], warningSigns: [], missingSymptoms: [] })), summary: "", reasoning: summary.reasoning || "", confidenceStatement: "" } as any;
      if (summary.riskScore) state.healthRiskScore = { overallScore: summary.riskScore, riskCategory: "moderate", riskDrivers: { primary: [], secondary: [] }, protectiveFactors: [], confidence: 50, riskExplanation: "", missingInformation: [] };
      state.clinicalSummary = summary as any;
    }

    const report = generateReport(state, conv.createdAt.toISOString());
    report.reportId = conversationId;

    const prevReports = await db
      .select()
      .from(healthReportsTable)
      .where(eq(healthReportsTable.conversationId, conversationId))
      .orderBy(desc(healthReportsTable.version))
      .limit(1);

    const version = (prevReports[0]?.version ?? 0) + 1;
    report.version = version;

    const genSummary = generateReportSummary(report);

    const [saved] = await db
      .insert(healthReportsTable)
      .values({
        userId,
        conversationId,
        title: `Consultation Report - ${new Date(conv.createdAt).toLocaleDateString()}`,
        summary: genSummary,
        score: report.riskAssessment.overallScore,
        prevScore: prevReports[0]?.score ?? null,
        highlights: report.differentialDiagnoses.slice(0, 3).map(d => `${d.condition} (${d.confidence}%)`),
        trend: prevReports[0]?.score != null
          ? (report.riskAssessment.overallScore < prevReports[0].score ? "improving" : report.riskAssessment.overallScore > prevReports[0].score ? "worsening" : "stable")
          : "stable",
        reportData: report as any,
        version,
      })
      .returning();

    res.status(201).json(saved);
  } catch (err) {
    (req as any).log.error({ err }, "generate report failed");
    res.status(500).json({ error: "Failed to generate report" });
  }
});

router.get("/reports/:id/pdf", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = req.params.id as string;

  try {
    const [row] = await db
      .select()
      .from(healthReportsTable)
      .where(and(eq(healthReportsTable.id, id), eq(healthReportsTable.userId, userId)));

    if (!row || !row.reportData) {
      res.status(404).json({ error: "Report not found or no data available" });
      return;
    }

    const report = row.reportData as any;
    const pdfBuffer = await generateConsultationPDF(report);

    await db
      .update(healthReportsTable)
      .set({ pdfGenerated: 1 } as any)
      .where(eq(healthReportsTable.id, id));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="medai-report-${id.slice(0, 8)}.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    (req as any).log.error({ err }, "generate PDF failed");
    res.status(500).json({ error: "Failed to generate PDF. Please try again." });
  }
});

router.delete("/reports/:id", requireAuth, async (req, res) => {
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

export default router;
