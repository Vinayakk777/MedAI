import { Router, type IRouter } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
  db,
  chatAttachmentsTable,
  chatAttachmentPagesTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import {
  detectAttachment,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS,
  type DetectedAttachment,
} from "../lib/chat-attachments/validation";
import { extractPdfPages } from "../lib/pdf/extractPdf";
import {
  chatAttachmentsDir,
  ensureDir,
  resolveStoredPath,
  sanitizeFileName,
  toStoredPath,
} from "../lib/storage/paths";

/**
 * Chat attachment upload/serve.
 *
 * Accepts images (JPEG/PNG/WebP) and PDFs. The declared MIME type is never
 * trusted: the file signature decides. Everything is written to a private,
 * per-user directory and served only through this authenticated route, so one
 * user's medical document can never be fetched with another user's session.
 */

// Files written before the PDF rollout live in a flat directory with a bare
// filename as the storage key. New rows are stored relative to `uploads/`.
function resolveFile(storageKey: string): string | null {
  const direct = resolveStoredPath(storageKey);
  if (direct && fs.existsSync(direct)) return direct;
  if (!storageKey.includes("/") && !storageKey.includes("\\")) {
    const legacy = resolveStoredPath(`chat-images/${storageKey}`);
    if (legacy && fs.existsSync(legacy)) return legacy;
  }
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CHAT_ATTACHMENT_BYTES,
    files: MAX_CHAT_ATTACHMENTS,
  },
});

/**
 * Multer reports limits by calling `next(err)`, which the generic error handler
 * would turn into a 500. Convert the limit cases into actionable 4xx responses.
 */
function acceptAttachments(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  upload.array("images", MAX_CHAT_ATTACHMENTS)(req, res, (err: any) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: `File is larger than ${Math.floor(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024))} MB`,
        });
        return;
      }
      if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        res.status(400).json({
          error: `You can attach up to ${MAX_CHAT_ATTACHMENTS} files per message`,
        });
        return;
      }
      res.status(400).json({ error: "Upload failed" });
      return;
    }
    next(err);
  });
}

interface UploadedAttachment {
  id: string;
  url: string;
  type: "image" | "document";
  kind: "image" | "pdf";
  mimeType: string;
  name: string;
  size: number;
  pageCount?: number;
  extractionStatus?: string;
}

function streamFile(
  filePath: string,
  mimeType: string,
  name: string,
  res: import("express").Response,
): void {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${name.replace(/["\\\r\n]/g, "")}"`,
  );
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(404).json({ error: "Attachment not found" });
    else res.end();
  });
  stream.pipe(res);
}

const router: IRouter = Router();

// ─── Upload ───
router.post(
  "/images/upload",
  requireAuth,
  acceptAttachments,
  async (req: AuthRequest, res) => {
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files provided" });
      return;
    }

    // Validate every file before writing anything, so a rejected batch leaves
    // no orphaned rows or partial uploads.
    const detected: { file: Express.Multer.File; value: DetectedAttachment }[] = [];
    for (const file of files) {
      const detection = detectAttachment(file.buffer, file.mimetype);
      if (!detection.ok) {
        const error =
          detection.reason === "too_large"
            ? `File is larger than ${Math.floor(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024))} MB`
            : detection.reason === "empty_file"
              ? "Empty file"
              : "Unsupported file type. Upload a PDF, JPEG, PNG, or WebP file.";
        res.status(400).json({ error });
        return;
      }
      detected.push({ file, value: detection.value });
    }

    const dir = chatAttachmentsDir(req.userId);
    const results: UploadedAttachment[] = [];
    const createdFiles: string[] = [];
    const createdIds: string[] = [];

    try {
      for (const { file, value } of detected) {
        const id = randomUUID();
        const absolutePath = path.join(dir, `${id}${value.extension}`);
        ensureDir(dir);
        fs.writeFileSync(absolutePath, file.buffer);
        createdFiles.push(absolutePath);
        createdIds.push(id);

        const name = sanitizeFileName(file.originalname, `attachment${value.extension}`);
        const sha256 = createHash("sha256").update(file.buffer).digest("hex");

        let pageCount: number | undefined;
        let extractionStatus = "completed";
        let extractionError: string | null = null;
        let pageRows: {
          attachmentId: string;
          pageNumber: number;
          text: string;
          charCount: number;
          extractionMethod: string;
        }[] = [];

        if (value.kind === "pdf") {
          extractionStatus = "pending";
          try {
            const extraction = await extractPdfPages(file.buffer);
            pageCount = extraction.pageCount;
            extractionStatus = extraction.status;
            extractionError = extraction.error ?? null;

            pageRows = extraction.pages
              .filter((page) => page.text.length > 0)
              .map((page) => ({
                attachmentId: id,
                pageNumber: page.pageNumber,
                text: page.text,
                charCount: page.text.length,
                extractionMethod: page.method,
              }));
          } catch (err) {
            extractionStatus = "failed";
            extractionError = err instanceof Error ? err.name : "extraction_error";
          }
        }

        // The attachment row must exist before its page rows: page rows carry a
        // foreign key to `chat_attachments(id)`.
        await db.insert(chatAttachmentsTable).values({
          id,
          userId: req.userId,
          kind: value.kind,
          storageKey: toStoredPath(absolutePath),
          mimeType: value.mimeType,
          name,
          size: file.buffer.length,
          ...(pageCount !== undefined ? { pageCount } : {}),
          extractionStatus: value.kind === "pdf" ? extractionStatus : "completed",
          extractionError: value.kind === "pdf" ? extractionError : null,
          sha256,
        });

        if (pageRows.length > 0) {
          try {
            await db.insert(chatAttachmentPagesTable).values(pageRows);
          } catch (err) {
            // The file was stored but its text was not: never report a
            // completed extraction, and keep the row so the user can see that
            // the document is unusable rather than silently missing.
            extractionStatus = "failed";
            extractionError = "page_persist_failed";
            await db
              .update(chatAttachmentsTable)
              .set({ extractionStatus, extractionError })
              .where(eq(chatAttachmentsTable.id, id));
            (req as any).log?.error({ err, attachmentId: id }, "attachment page persist failed");
          }
        }

        results.push({
          id,
          url: `/api/images/${id}`,
          type: value.kind === "pdf" ? "document" : "image",
          kind: value.kind,
          mimeType: value.mimeType,
          name,
          size: file.buffer.length,
          ...(pageCount !== undefined ? { pageCount } : {}),
          ...(value.kind === "pdf" ? { extractionStatus } : {}),
        });
      }

      res.status(201).json({ attachments: results });
    } catch (err) {
      // A failed batch must not leave orphaned rows or files behind.
      for (const absolutePath of createdFiles) {
        try {
          fs.unlinkSync(absolutePath);
        } catch {
          // best-effort cleanup
        }
      }
      if (createdIds.length > 0) {
        try {
          await db
            .delete(chatAttachmentsTable)
            .where(inArray(chatAttachmentsTable.id, createdIds));
        } catch {
          // best-effort cleanup
        }
      }
      (req as any).log?.error({ err }, "attachment upload failed");
      res.status(500).json({ error: "Attachment upload failed" });
    }
  },
);

// ─── Serve (ownership-checked) ───
router.get("/images/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const [att] = await db
      .select()
      .from(chatAttachmentsTable)
      .where(
        and(
          eq(chatAttachmentsTable.id, id),
          eq(chatAttachmentsTable.userId, req.userId),
        ),
      );

    if (!att) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const filePath = resolveFile(att.storageKey);
    if (!filePath) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    streamFile(filePath, att.mimeType, att.name, res);
  } catch (err) {
    (req as any).log?.error({ err }, "attachment fetch failed");
    res.status(404).json({ error: "Attachment not found" });
  }
});

export default router;
