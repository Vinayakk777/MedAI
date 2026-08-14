import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import {
  getUserMedicalMemory,
  getMedicalMemoryById,
  searchMedicalMemory,
  filterMemoryByDateRange,
  filterMemoryBySymptom,
  filterMemoryByDiagnosis,
  getMedicalHistorySummary,
  archiveMedicalMemory,
  deleteMedicalMemory,
  updateMedicalMemory,
} from "../lib/memoryEngine";

const router: IRouter = Router();

// ─── Timeline ───

router.get("/memory/timeline", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const memories = await getUserMedicalMemory(userId, { includeArchived: false });
    res.json(memories);
  } catch (err) {
    (req as any).log.error({ err }, "fetch timeline failed");
    res.status(500).json({ error: "Failed to fetch health timeline" });
  }
});

// ─── Medical History Summary ───

router.get("/memory/history-summary", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const summary = await getMedicalHistorySummary(userId);
    res.json(summary);
  } catch (err) {
    (req as any).log.error({ err }, "fetch history summary failed");
    res.status(500).json({ error: "Failed to fetch medical history summary" });
  }
});

// ─── Search ───

router.get("/memory/search", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const q = String(req.query.q || "");
  if (!q.trim()) {
    res.status(400).json({ error: "Search query is required" });
    return;
  }
  try {
    const results = await searchMedicalMemory(userId, q.trim());
    res.json(results);
  } catch (err) {
    (req as any).log.error({ err }, "search memory failed");
    res.status(500).json({ error: "Failed to search memory" });
  }
});

// ─── Filter ───

router.get("/memory/filter", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const symptom = req.query.symptom ? String(req.query.symptom) : undefined;
  const diagnosis = req.query.diagnosis ? String(req.query.diagnosis) : undefined;
  const from = req.query.from ? String(req.query.from) : undefined;
  const to = req.query.to ? String(req.query.to) : undefined;

  try {
    let results;
    if (symptom) {
      results = await filterMemoryBySymptom(userId, symptom);
    } else if (diagnosis) {
      results = await filterMemoryByDiagnosis(userId, diagnosis);
    } else if (from && to) {
      results = await filterMemoryByDateRange(userId, new Date(from), new Date(to));
    } else {
      results = await getUserMedicalMemory(userId);
    }
    res.json(results);
  } catch (err) {
    (req as any).log.error({ err }, "filter memory failed");
    res.status(500).json({ error: "Failed to filter memory" });
  }
});

// ─── Single memory ───

router.get("/memory/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    const memory = await getMedicalMemoryById(id, userId);
    if (!memory) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }
    res.json(memory);
  } catch (err) {
    (req as any).log.error({ err }, "fetch memory failed");
    res.status(500).json({ error: "Failed to fetch memory" });
  }
});

// ─── Archive ───

router.patch("/memory/:id/archive", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    await archiveMedicalMemory(id, userId);
    res.json({ success: true });
  } catch (err) {
    (req as any).log.error({ err }, "archive memory failed");
    res.status(500).json({ error: "Failed to archive memory" });
  }
});

// ─── Delete ───

router.delete("/memory/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  try {
    await deleteMedicalMemory(id, userId);
    res.status(204).send();
  } catch (err) {
    (req as any).log.error({ err }, "delete memory failed");
    res.status(500).json({ error: "Failed to delete memory" });
  }
});

// ─── Update ───

router.patch("/memory/:id", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  const id = String(req.params.id);
  const updates = req.body;
  try {
    await updateMedicalMemory(id, userId, updates);
    const memory = await getMedicalMemoryById(id, userId);
    res.json(memory);
  } catch (err) {
    (req as any).log.error({ err }, "update memory failed");
    res.status(500).json({ error: "Failed to update memory" });
  }
});

// ─── Export ───

router.get("/memory/export/all", requireAuth, async (req, res) => {
  const { userId } = req as AuthRequest;
  try {
    const memories = await getUserMedicalMemory(userId, {
      includeArchived: true,
      includeDeleted: false,
    });
    const exportData = {
      exportedAt: new Date().toISOString(),
      recordCount: memories.length,
      records: memories.map((m) => ({
        consultationDate: m.consultationDate,
        chiefComplaint: m.chiefComplaint,
        riskLevel: m.riskLevel,
        riskScore: m.riskScore,
        outcome: m.outcome,
        symptoms: m.symptoms,
        diagnoses: m.diagnoses,
        redFlags: m.redFlags,
        labRecommendations: m.labRecommendations,
        imagingRecommendations: m.imagingRecommendations,
        medicationRecommendations: m.medicationRecommendations,
        drugInteractions: m.drugInteractions,
        allergies: m.allergies,
        chronicConditions: m.chronicConditions,
        lifestyleFactors: m.lifestyleFactors,
        followUpAdvice: m.followUpAdvice,
        recoveryStatus: m.recoveryStatus,
      })),
      disclaimer: "This health data export is for personal reference only. Consult a licensed healthcare professional for medical advice.",
    };

    res.setHeader("Content-Disposition", `attachment; filename="health-history-${new Date().toISOString().split("T")[0]}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(exportData);
  } catch (err) {
    (req as any).log.error({ err }, "export memory failed");
    res.status(500).json({ error: "Failed to export health history" });
  }
});

export default router;
