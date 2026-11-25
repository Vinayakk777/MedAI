import { db, docOcrResultsTable, docUploadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import path from "node:path";
import type { OcrResult, OcrField } from "./types";
import { extractPdfPages, ocrImage } from "../pdf/extractPdf";
import { resolveStoredPath } from "../storage/paths";

const COMMON_PATTERNS = {
  patientName: /(?:patient\s*(?:name|id|detail)|name\s*:)\s*([A-Za-z\s]+)/i,
  reportDate: /(?:report\s*(?:date|issued|generated)|date\s*:)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  physicianName: /(?:referring|consultant|attending|doctor|physician)\s*(?:name|doctor|physician|:)\s*([A-Za-z\s]+)/i,
  hospitalName: /(?:hospital|clinic|center|institute)\s*:?\s*([A-Za-z\s]+(?:hospital|clinic|center|institute|medical\s*center))/i,
  labValue: /([A-Za-z\s]+)\s*:\s*([0-9.]+)\s*([A-Za-z/%]+)?\s*(?:\(?\s*([0-9.]+\s*[-–]\s*[0-9.]+)\s*\)?)?/g,
  medication: /([A-Za-z]+)\s*(\d+\s*m?g|[0-9.]+\s*ml|[0-9.]+\s*unit)?[,\s]*(?:(\d+\s*(?:tab|capsule|ml|drop|puff|injection)s?)\s*)?(?:(\d+\s*(?:times|x)\s*(?:per|a|daily|day|weekly)))?/gi,
  dosage: /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|IU|unit|tablet|capsule|drop|puff)/gi,
  referenceRange: /\(?\s*([0-9.]+\s*[-–]\s*[0-9.]+)\s*\)?/,
};

export class OcrPipeline {
  async processDocument(documentId: string, filePath: string): Promise<OcrResult> {
    const startTime = Date.now();
    try {
      const rawText = await this.extractText(filePath);
      const processedText = this.cleanText(rawText);
      const extractedFields = this.extractFields(processedText);
      const confidence = this.calculateConfidence(extractedFields);

      const result: OcrResult = {
        documentId,
        rawText,
        processedText,
        confidence,
        engine: "tesseract",
        processingTimeMs: Date.now() - startTime,
        extractedFields,
        patientName: extractedFields["patientName"],
        reportDate: extractedFields["reportDate"],
        physicianName: extractedFields["physicianName"],
        hospitalName: extractedFields["hospitalName"],
      };

      await db.insert(docOcrResultsTable).values({
        documentId,
        rawText,
        processedText,
        confidence,
        engine: "tesseract",
        processingTimeMs: result.processingTimeMs,
        extractedFields,
        patientName: result.patientName,
        reportDate: result.reportDate ? new Date(result.reportDate) : undefined,
        physicianName: result.physicianName,
        hospitalName: result.hospitalName,
      });

      await db.update(docUploadsTable)
        .set({ ocrStatus: "completed", ocrConfidence: confidence, updatedAt: new Date() })
        .where(eq(docUploadsTable.id, documentId));

      return result;
    } catch (err) {
      await db.update(docUploadsTable)
        .set({ ocrStatus: "failed", updatedAt: new Date() })
        .where(eq(docUploadsTable.id, documentId));
      throw err;
    }
  }

  private async extractText(filePath: string): Promise<string> {
    const fs = await import("fs/promises");
    // Stored paths are relative to `uploads/`; resolve them consistently and
    // reject anything that escapes the upload root.
    const resolved = resolveStoredPath(filePath) ?? filePath;
    const ext = path.extname(resolved).slice(1).toLowerCase();

    if (ext === "txt" || ext === "csv") {
      return await fs.readFile(resolved, "utf-8");
    }

    if (ext === "pdf") {
      const buffer = await fs.readFile(resolved);
      const result = await extractPdfPages(buffer);
      if (result.status === "failed") {
        return "[OCR: PDF text could not be extracted]";
      }
      return result.pages
        .filter((page) => page.text.length > 0)
        .map((page) => `[Page ${page.pageNumber}]\n${page.text}`)
        .join("\n\n");
    }

    if (["jpg", "jpeg", "png", "webp", "tiff", "bmp"].includes(ext)) {
      try {
        const buffer = await fs.readFile(resolved);
        const text = await ocrImage(buffer);
        return text || "[OCR: Image text extraction unavailable]";
      } catch {
        return "[OCR: Image text extraction unavailable]";
      }
    }

    return "[OCR: Unsupported file format]";
  }

  private cleanText(raw: string): string {
    return raw
      .replace(/\r\n/g, "\n")
      .replace(/\s+/g, " ")
      .replace(/[|•·]/g, ":")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private extractFields(text: string): Record<string, string> {
    const fields: Record<string, string> = {};

    const nameMatch = text.match(COMMON_PATTERNS.patientName);
    if (nameMatch) fields["patientName"] = nameMatch[1].trim();

    const dateMatch = text.match(COMMON_PATTERNS.reportDate);
    if (dateMatch) fields["reportDate"] = dateMatch[1].trim();

    const docMatch = text.match(COMMON_PATTERNS.physicianName);
    if (docMatch) fields["physicianName"] = docMatch[1].trim();

    const hospMatch = text.match(COMMON_PATTERNS.hospitalName);
    if (hospMatch) fields["hospitalName"] = hospMatch[1].trim();

    return fields;
  }

  private calculateConfidence(fields: Record<string, string>): number {
    if (Object.keys(fields).length === 0) return 0.3;
    const baseConfidence = 0.6;
    const fieldBonus = Object.keys(fields).length * 0.08;
    return Math.min(baseConfidence + fieldBonus, 0.98);
  }

  async getOcrResult(documentId: string): Promise<OcrResult | null> {
    const results = await db.select().from(docOcrResultsTable)
      .where(eq(docOcrResultsTable.documentId, documentId))
      .limit(1);
    if (results.length === 0) return null;
    const r = results[0];
    return {
      documentId: r.documentId,
      rawText: r.rawText || "",
      processedText: r.processedText || "",
      confidence: r.confidence || 0,
      engine: r.engine || "tesseract",
      processingTimeMs: r.processingTimeMs || 0,
      extractedFields: (r.extractedFields as Record<string, string>) || {},
      patientName: r.patientName || undefined,
      reportDate: r.reportDate?.toISOString(),
      physicianName: r.physicianName || undefined,
      hospitalName: r.hospitalName || undefined,
    };
  }
}
