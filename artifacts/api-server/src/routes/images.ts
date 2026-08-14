import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { db, chatAttachmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const ALLOWED_TYPES: Record<string, { ext: string; magic: (buf: Buffer) => boolean }> = {
  "image/jpeg": {
    ext: ".jpg",
    magic: (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  "image/png": {
    ext: ".png",
    magic: (buf) =>
      buf.length > 8 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a,
  },
  "image/webp": {
    ext: ".webp",
    magic: (buf) =>
      buf.length > 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP",
  },
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB raw upload cap (client compresses to ~1.5 MB)
const uploadDir = path.join(process.cwd(), "uploads", "chat-images");

function ensureUploadDir(): void {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
}

ensureUploadDir();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error("Unsupported image type"));
  },
});

function sanitizeName(name: string): string {
  const base = path.basename(name || "image").replace(/[^\w.\- ]+/g, "").slice(0, 120).trim();
  return base || "image";
}

function streamFile(
  filePath: string,
  mimeType: string,
  res: import("express").Response,
): void {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=3600");
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) res.status(404).json({ error: "Image not found" });
    else res.end();
  });
  stream.pipe(res);
}

const router: IRouter = Router();

// ─── Upload ───
router.post("/images/upload", requireAuth, upload.array("images", 6), async (req: AuthRequest, res) => {
  try {
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No image files provided" });
      return;
    }

    const results: {
      id: string;
      url: string;
      mimeType: string;
      name: string;
      size: number;
    }[] = [];

    for (const file of files) {
      if (!file.buffer || file.buffer.length === 0) {
        res.status(400).json({ error: "Empty image file" });
        return;
      }

      const mimeType = file.mimetype;
      const rule = ALLOWED_TYPES[mimeType];
      if (!rule || !rule.magic(file.buffer)) {
        res.status(400).json({ error: "Invalid or corrupted image file" });
        return;
      }

      // Embed actual content type from magic bytes (never trust client MIME alone).
      const actualMime = mimeType === "image/jpeg" ? "image/jpeg" : mimeType;
      const id = randomUUID();
      const storagePath = path.join(uploadDir, `${id}${rule.ext}`);
      fs.writeFileSync(storagePath, file.buffer);

      const name = sanitizeName(file.originalname);

      await db.insert(chatAttachmentsTable).values({
        id,
        userId: req.userId,
        storageKey: `${id}${rule.ext}`,
        mimeType: actualMime,
        name,
        size: file.buffer.length,
      });

      results.push({
        id,
        url: `/api/images/${id}`,
        mimeType: actualMime,
        name,
        size: file.buffer.length,
      });
    }

    res.status(201).json({ attachments: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    (req as any).log?.error({ err }, "image upload failed");
    res.status(400).json({ error: "Image upload failed" });
  }
});

// ─── Serve (ownership-checked) ───
router.get("/images/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const [att] = await db
      .select()
      .from(chatAttachmentsTable)
      .where(and(eq(chatAttachmentsTable.id, id), eq(chatAttachmentsTable.userId, req.userId)));

    if (!att) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    const filePath = path.join(uploadDir, att.storageKey);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    streamFile(filePath, att.mimeType, res);
  } catch (err) {
    (req as any).log?.error({ err }, "image fetch failed");
    res.status(404).json({ error: "Image not found" });
  }
});

export default router;