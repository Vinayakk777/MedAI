import { db, docUploadsTable } from "@workspace/db";
import { eq, and, desc, like, or, sql, inArray } from "drizzle-orm";
import { OcrPipeline } from "./ocrPipeline";
import { LabAnalyzer } from "./labAnalyzer";
import { PrescriptionParser } from "./prescriptionParser";
import { ImageAnalyzer } from "./imageAnalyzer";
import { TrendComparator } from "./trendComparator";
import { ClinicalSummarizer } from "./clinicalSummarizer";
import type { UploadRequest, UploadResult, DocumentSearchParams, DocumentSearchResult, DocumentType } from "./types";

export class DocumentManager {
  readonly ocr: OcrPipeline;
  readonly labAnalyzer: LabAnalyzer;
  readonly prescriptionParser: PrescriptionParser;
  readonly imageAnalyzer: ImageAnalyzer;
  readonly trendComparator: TrendComparator;
  readonly clinicalSummarizer: ClinicalSummarizer;

  constructor() {
    this.ocr = new OcrPipeline();
    this.labAnalyzer = new LabAnalyzer();
    this.prescriptionParser = new PrescriptionParser();
    this.imageAnalyzer = new ImageAnalyzer();
    this.trendComparator = new TrendComparator();
    this.clinicalSummarizer = new ClinicalSummarizer();
  }

  async upload(
    userId: string, file: { originalname: string; size: number; mimetype: string; filename?: string; path?: string; buffer?: Buffer; }, request: UploadRequest
  ): Promise<UploadResult> {
    const storagePath = `uploads/${userId}/${Date.now()}_${file.originalname}`;

    const [saved] = await db.insert(docUploadsTable).values({
      userId,
      documentType: request.documentType,
      status: "uploaded",
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      storagePath,
      title: request.title,
      description: request.description,
      tags: request.tags || [],
      conversationId: request.conversationId,
    }).returning();

    return {
      documentId: saved.id,
      fileName: saved.fileName,
      status: "uploaded",
      storagePath: storagePath,
    };
  }

  async list(userId: string, params: DocumentSearchParams): Promise<DocumentSearchResult> {
    const conditions = [eq(docUploadsTable.userId, userId)];
    if (params.isArchived !== undefined) {
      conditions.push(eq(docUploadsTable.isArchived, params.isArchived));
    } else {
      conditions.push(eq(docUploadsTable.isArchived, false));
    }
    if (params.documentType) conditions.push(eq(docUploadsTable.documentType, params.documentType));
    if (params.status) conditions.push(eq(docUploadsTable.status, params.status));
    if (params.query) {
      const q = `%${params.query}%`;
      conditions.push(
        like(docUploadsTable.fileName, q),
        sql`COALESCE(${docUploadsTable.title}, '') LIKE ${q}`,
        sql`COALESCE(${docUploadsTable.description}, '') LIKE ${q}`,
      );
    }
    if (params.tags && params.tags.length > 0) {
      conditions.push(sql`${docUploadsTable.tags} && ${params.tags}`);
    }
    if (params.dateFrom) conditions.push(sql`${docUploadsTable.createdAt} >= ${new Date(params.dateFrom)}`);
    if (params.dateTo) conditions.push(sql`${docUploadsTable.createdAt} <= ${new Date(params.dateTo)}`);

    const limit = Math.min(params.limit || 20, 100);
    const offset = params.offset || 0;
    const orderByCol = params.sortBy === "type" ? docUploadsTable.documentType
      : params.sortBy === "name" ? docUploadsTable.fileName
      : params.sortBy === "status" ? docUploadsTable.status
      : docUploadsTable.createdAt;
    const orderDir = params.sortOrder === "asc" ? orderByCol : desc(orderByCol);

    const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(docUploadsTable).where(and(...conditions));
    const rows = await db.select().from(docUploadsTable)
      .where(and(...conditions))
      .orderBy(orderDir)
      .limit(limit)
      .offset(offset);

    return {
      documents: rows,
      total: Number(totalResult.count),
      limit,
      offset,
    };
  }

  async getById(documentId: string): Promise<any> {
    const rows = await db.select().from(docUploadsTable).where(eq(docUploadsTable.id, documentId)).limit(1);
    return rows[0] || null;
  }

  async softDelete(documentId: string): Promise<void> {
    await db.update(docUploadsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(docUploadsTable.id, documentId));
  }

  async archive(documentId: string, archived: boolean): Promise<void> {
    await db.update(docUploadsTable)
      .set({ isArchived: archived, updatedAt: new Date() })
      .where(eq(docUploadsTable.id, documentId));
  }

  async updateTags(documentId: string, tags: string[]): Promise<void> {
    await db.update(docUploadsTable)
      .set({ tags, updatedAt: new Date() })
      .where(eq(docUploadsTable.id, documentId));
  }

  async processDocument(documentId: string): Promise<void> {
    const doc = await this.getById(documentId);
    if (!doc) throw new Error("Document not found");

    await db.update(docUploadsTable)
      .set({ status: "ocr_pending", updatedAt: new Date() })
      .where(eq(docUploadsTable.id, documentId));
  }

  async updateStatus(documentId: string, status: string, updates?: Record<string, any>): Promise<void> {
    await db.update(docUploadsTable)
      .set({ status, ...updates, updatedAt: new Date() } as any)
      .where(eq(docUploadsTable.id, documentId));
  }

  async getTimelineEvents(userId: string, limit = 50): Promise<any[]> {
    const docs = await db.select().from(docUploadsTable)
      .where(and(
        eq(docUploadsTable.userId, userId),
        eq(docUploadsTable.isArchived, false),
      ))
      .orderBy(desc(docUploadsTable.createdAt))
      .limit(limit);

    return docs.map((d) => ({
      id: d.id,
      type: "document_upload",
      title: d.title || d.fileName,
      description: `${d.documentType?.replace(/_/g, " ") || "Document"} uploaded`,
      timestamp: d.createdAt.toISOString(),
      metadata: {
        documentType: d.documentType,
        status: d.status,
        fileSize: d.fileSize,
      },
    }));
  }

  detectDocumentType(fileName: string, mimeType: string): DocumentType {
    const name = fileName.toLowerCase();
    const mime = mimeType.toLowerCase();

    if (mime.includes("pdf")) {
      if (/xray|x-ray|radiograph/i.test(name)) return "chest_xray";
      if (/ecg|ekg|electrocardiogram/i.test(name)) return "ecg_printout";
      if (/ultrasound|sonogram/i.test(name)) return "ultrasound_report";
      if (/discharge/i.test(name)) return "discharge_summary";
      if (/prescription|rx/i.test(name)) return "prescription";
      if (/vaccination|immunization|vaccine/i.test(name)) return "vaccination_record";
      if (/referral/i.test(name)) return "referral_letter";
      if (/certificate|fit/i.test(name)) return "medical_certificate";
      if (/operation|surgery|operative/i.test(name)) return "operation_note";
      if (/progress|follow.up|clinical.*note/i.test(name)) return "clinical_progress_note";
      if (/lab|blood|test|panel/i.test(name)) return "lab_report";
      if (/ct|cat.?scan/i.test(name)) return "ct_report";
      if (/mri|magnetic/i.test(name)) return "mri_report";
      return "lab_report";
    }

    if (mime.includes("image")) {
      if (/xray|x-ray|chest|radiograph/i.test(name)) return "chest_xray";
      if (/dental|tooth|teeth/i.test(name)) return "dental_xray";
      if (/skin|lesion|rash|mole|dermatology/i.test(name)) return "skin_photograph";
      if (/eye|retina|fundus|cornea/i.test(name)) return "eye_photograph";
      if (/wound|ulcer|burn|cut|laceration|incision|surgical.*site/i.test(name)) return "wound_image";
      return "other";
    }

    return "other";
  }
}
