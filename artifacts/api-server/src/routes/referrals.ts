import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { referralsTable, conversationsTable, type Referral, type HandoffSummaryData } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import {
  classifyCareLevel,
  generateHandoffSummary,
} from "../lib/referralEngine";
import { getUserMedicalMemory } from "../lib/memoryEngine";
import { createInitialState, type ConsultationState } from "../lib/orchestrator";

const router: IRouter = Router();

// ─── List referrals ───

router.get("/referrals", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const rows = await db
      .select()
      .from(referralsTable)
      .where(and(eq(referralsTable.userId, userId), eq(referralsTable.isArchived, false)))
      .orderBy(desc(referralsTable.createdAt));
    res.json(rows);
  } catch (err) {
    (req as any).log.error({ err }, "list referrals failed");
    res.status(500).json({ error: "Failed to fetch referrals" });
  }
});

// ─── Get single referral ───

router.get("/referrals/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    const [row] = await db
      .select()
      .from(referralsTable)
      .where(and(eq(referralsTable.id, id), eq(referralsTable.userId, userId)));
    if (!row) {
      res.status(404).json({ error: "Referral not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    (req as any).log.error({ err }, "get referral failed");
    res.status(500).json({ error: "Failed to fetch referral" });
  }
});

// ─── Generate referral from conversation ───

router.post("/referrals/generate/:conversationId", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const conversationId = String(req.params.conversationId);

  try {
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.userId, userId)));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const clinicalSummary = conv.clinicalSummary as any;
    if (!clinicalSummary) {
      res.status(400).json({ error: "No clinical data available for this conversation. Complete a consultation first." });
      return;
    }

    // Build minimal state from stored data
    const state: ConsultationState = {
      ...createInitialState(conv.lastMessage ?? "", []),
      symptomAnalysis: clinicalSummary.symptomAnalysis ?? null,
      escalation: clinicalSummary.escalation ?? null,
      differentialDiagnosis: clinicalSummary.differentialDiagnosis ?? null,
      validation: clinicalSummary.validation ?? null,
      confidence: clinicalSummary.confidence ?? null,
      clinicalSummary: clinicalSummary,
      healthRiskScore: clinicalSummary.healthRiskScore ?? null,
      careRecommendation: clinicalSummary.careRecommendation ?? null,
      laboratoryTests: (conv as any).laboratoryTests ?? null,
      selfCare: clinicalSummary.selfCare ?? null,
      otcGuidance: clinicalSummary.otcGuidance ?? null,
      remedyPlan: clinicalSummary.remedyPlan ?? null,
      recoveryPlan: clinicalSummary.recoveryPlan ?? null,
      preventionPlan: clinicalSummary.preventionPlan ?? null,
      followUp: clinicalSummary.followUp ?? null,
    };

    const priorMemories = await getUserMedicalMemory(userId, { includeArchived: false });

    const referral = classifyCareLevel(state);
    const handoff = generateHandoffSummary(state, referral, priorMemories);

    const [row] = await db
      .insert(referralsTable)
      .values({
        userId,
        conversationId,
        careLevel: referral.careLevel,
        urgencyLabel: referral.urgencyLabel,
        urgencyReason: referral.reason,
        estimatedSeekTime: referral.estimatedSeekTime,
        preparationInstructions: referral.preparationInstructions,
        whatToBring: referral.whatToBring,
        whatToTellDoctor: referral.whatToTellDoctor,
        handoffSummary: handoff as HandoffSummaryData,
      })
      .returning();

    res.status(201).json({ referral: row, decision: referral, handoff });
  } catch (err) {
    (req as any).log.error({ err }, "generate referral failed");
    res.status(500).json({ error: "Failed to generate referral" });
  }
});

// ─── Update referral status ───

router.patch("/referrals/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  const { status, followUpOutcome, followUpNotes } = req.body as {
    status?: string;
    followUpOutcome?: string;
    followUpNotes?: string;
  };

  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (followUpOutcome !== undefined) updates.followUpOutcome = followUpOutcome;
    if (followUpNotes !== undefined) updates.followUpNotes = followUpNotes;

    const [row] = await db
      .update(referralsTable)
      .set(updates)
      .where(and(eq(referralsTable.id, id), eq(referralsTable.userId, userId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Referral not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    (req as any).log.error({ err }, "update referral failed");
    res.status(500).json({ error: "Failed to update referral" });
  }
});

// ─── Archive referral ───

router.patch("/referrals/:id/archive", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    await db
      .update(referralsTable)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(referralsTable.id, id), eq(referralsTable.userId, userId)));
    res.json({ success: true });
  } catch (err) {
    (req as any).log.error({ err }, "archive referral failed");
    res.status(500).json({ error: "Failed to archive referral" });
  }
});

// ─── Delete referral ───

router.delete("/referrals/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    await db
      .delete(referralsTable)
      .where(and(eq(referralsTable.id, id), eq(referralsTable.userId, userId)));
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "delete referral failed");
    res.status(500).json({ error: "Failed to delete referral" });
  }
});

export default router;
