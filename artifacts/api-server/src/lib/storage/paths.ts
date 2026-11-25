import path from "node:path";
import fs from "node:fs";

/**
 * Single source of truth for on-disk upload locations.
 *
 * The database stores paths *relative to `uploads/`* using forward slashes so
 * a row stays valid when the project directory changes between deployments.
 * Every reader must go through `resolveStoredPath`, which also rejects path
 * traversal.
 */

export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Restrict user ids to a filesystem-safe token before using them in a path. */
export function safeUserSegment(userId: string): string {
  const cleaned = (userId || "unknown").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
  return cleaned || "unknown";
}

export function userDocumentsDir(userId: string): string {
  return path.join(UPLOAD_ROOT, "user-documents", safeUserSegment(userId));
}

export function chatAttachmentsDir(userId: string): string {
  return path.join(UPLOAD_ROOT, "chat-attachments", safeUserSegment(userId));
}

/** Convert an absolute path under `uploads/` into the stored representation. */
export function toStoredPath(absolutePath: string): string {
  const relative = path.relative(UPLOAD_ROOT, path.resolve(absolutePath));
  return relative.split(path.sep).join("/");
}

/**
 * Resolve a stored path to an absolute path, or `null` when it escapes the
 * upload root. Callers must treat `null` as "not found".
 *
 * Legacy document rows stored paths like `uploads/<user>/<file>`; the
 * redundant `uploads/` prefix is stripped so those rows keep working.
 */
export function resolveStoredPath(storedPath: string): string | null {
  if (!storedPath || typeof storedPath !== "string") return null;
  const normalized = storedPath.replace(/\\/g, "/").replace(/^\.?\//, "");
  const relativeInput = normalized.startsWith("uploads/")
    ? normalized.slice("uploads/".length)
    : normalized;
  const candidate = path.resolve(UPLOAD_ROOT, relativeInput);
  const relative = path.relative(UPLOAD_ROOT, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return candidate;
}

/** Strip directories and unsafe characters from an uploaded file name. */
export function sanitizeFileName(name: string, fallback = "file"): string {
  const base = path
    .basename(name || fallback)
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return base || fallback;
}

/** A conservative extension derived from the file name (".pdf", ".jpg", ...). */
export function safeExtension(name: string, fallback = ""): string {
  const ext = path.extname(name || "").toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}
