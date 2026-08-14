import { Router, type IRouter, type Request } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { DocumentManager } from "../lib/medical-documents/documentManager";
import { db, docUploadsTable, docLabValuesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

const router: IRouter = Router();
const docManager = new DocumentManager();

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadDir),
  filename: (_req: any, file: any, cb: any) => cb(null, `${Date.now()}_${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowedMimes = [
      "application/pdf", "image/jpeg", "image/png", "image/webp",
      "image/tiff", "image/bmp", "text/plain", "text/csv",
    ];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

router.post("/medical-documents/upload", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  try {
    const file = (req as any).file;
    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const { documentType, title, description, tags, conversationId } = req.body;
    const result = await docManager.upload(req.userId, file, {
      documentType: documentType || docManager.detectDocumentType(file.originalname, file.mimetype),
      title,
      description,
      tags: tags ? JSON.parse(tags) : [],
      conversationId,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents", requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await docManager.list(req.userId, {
      query: req.query.q as string,
      documentType: req.query.type as any,
      status: req.query.status as any,
      tags: req.query.tags ? (req.query.tags as string).split(",") : undefined,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      isArchived: req.query.archived === "true" ? true : req.query.archived === "false" ? false : undefined,
      sortBy: req.query.sortBy as any,
      sortOrder: req.query.sortOrder as any,
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const doc = await docManager.getById(id);
    if (!doc || doc.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/medical-documents/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const doc = await docManager.getById(id);
    if (!doc || doc.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
    await docManager.softDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/medical-documents/:id/archive", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const doc = await docManager.getById(id);
    if (!doc || doc.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
    await docManager.archive(id, req.body.archived !== false);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/medical-documents/:id/tags", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const doc = await docManager.getById(id);
    if (!doc || doc.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
    await docManager.updateTags(id, req.body.tags || []);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/medical-documents/:id/process", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const doc = await docManager.getById(id);
    if (!doc || doc.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }

    await docManager.updateStatus(id, "ocr_processing");

    const ocrResult = await docManager.ocr.processDocument(id, doc.storagePath);
    const combinedText = `${ocrResult.processedText} ${ocrResult.rawText}`;
    const imageTypes = ["chest_xray", "dental_xray", "skin_photograph", "eye_photograph", "wound_image"];

    const labValues = imageTypes.includes(doc.documentType)
      ? [] : await docManager.labAnalyzer.analyze(id, combinedText);

    const medResult = doc.documentType === "prescription"
      ? await docManager.prescriptionParser.parse(id, combinedText)
      : { medications: [], issues: [] };

    let imageAnalysis = null;
    if (imageTypes.includes(doc.documentType)) {
      imageAnalysis = await docManager.imageAnalyzer.analyze(id, combinedText, doc.documentType);
    }

    const trendComparisons = labValues.length > 0
      ? await docManager.trendComparator.compare(id, req.userId, labValues.map((l: any) => l.testName))
      : null;

    const summary = await docManager.clinicalSummarizer.generateSummary(
      req.userId, [id], req.body.conversationHistory,
    );

    await docManager.updateStatus(id, "analyzed", { aiSummary: summary.physicianSummary });

    res.json({
      ocr: ocrResult,
      labValues,
      medications: medResult,
      imageAnalysis,
      trends: trendComparisons,
      summary,
    });
  } catch (err) {
    const id = req.params.id as string;
    await docManager.updateStatus(id, "failed");
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/:id/ocr", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const result = await docManager.ocr.getOcrResult(id);
    if (!result) { res.status(404).json({ error: "OCR result not found" }); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/:id/lab-values", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const values = await docManager.labAnalyzer.getLabValues(id);
    res.json(values);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/:id/medications", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const medications = await docManager.prescriptionParser.getMedications(id);
    res.json(medications);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/:id/image-analysis", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const analysis = await docManager.imageAnalyzer.getAnalysis(id);
    if (!analysis) { res.status(404).json({ error: "Image analysis not found" }); return; }
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/:id/trends", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const trends = await docManager.trendComparator.getTrends(id);
    res.json(trends);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/:id/summary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const summary = await docManager.clinicalSummarizer.getSummary(id);
    if (!summary) {
      const doc = await docManager.getById(id);
      if (!doc || doc.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
      const generated = await docManager.clinicalSummarizer.generateSummary(req.userId, [id]);
      res.json(generated);
      return;
    }
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/timeline/events", requireAuth, async (req: AuthRequest, res) => {
  try {
    const events = await docManager.getTimelineEvents(req.userId, parseInt(req.query.limit as string) || 50);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/medical-documents/stats/summary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const all = await db.select().from(docUploadsTable)
      .where(and(eq(docUploadsTable.userId, req.userId), eq(docUploadsTable.isArchived, false)));

    const typeCount: Record<string, number> = {};
    const statusCount: Record<string, number> = {};
    let totalSize = 0;

    for (const d of all) {
      typeCount[d.documentType] = (typeCount[d.documentType] || 0) + 1;
      statusCount[d.status] = (statusCount[d.status] || 0) + 1;
      totalSize += d.fileSize || 0;
    }

    const [abnormalResult] = await db.select({ count: sql<number>`count(*)` })
      .from(docLabValuesTable)
      .where(eq(docLabValuesTable.isAbnormal, true));

    const [totalResult] = await db.select({ count: sql<number>`count(*)` })
      .from(docLabValuesTable);

    res.json({
      totalDocuments: all.length,
      totalSize,
      byType: typeCount,
      byStatus: statusCount,
      abnormalLabCount: Number(abnormalResult?.count || 0),
      totalLabCount: Number(totalResult?.count || 0),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
