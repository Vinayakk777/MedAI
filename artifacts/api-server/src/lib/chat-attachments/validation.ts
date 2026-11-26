/**
 * Content-based validation for chat attachments.
 *
 * The client-declared MIME type is never trusted on its own: the file signature
 * decides whether the upload is an image or a PDF. Anything else is rejected.
 */

export type AttachmentKind = "image" | "pdf";

export interface DetectedAttachment {
  kind: AttachmentKind;
  mimeType: string;
  extension: string;
}

export type DetectionResult =
  | { ok: true; value: DetectedAttachment }
  | { ok: false; reason: "empty_file" | "unsupported_type" | "too_large" };

export const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_CHAT_ATTACHMENTS = 6;

// The PDF specification allows the `%PDF-` header to appear anywhere in the
// first 1024 bytes. Some scanners and generators prepend a UTF-8 BOM or binary
// junk, so checking only offset 0 rejects valid documents.
const PDF_HEADER = Buffer.from("%PDF-", "ascii");
const PDF_HEADER_SEARCH_BYTES = 1024;

function isPdf(buffer: Buffer): boolean {
  const index = buffer.subarray(0, PDF_HEADER_SEARCH_BYTES).indexOf(PDF_HEADER);
  return index >= 0;
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

export function detectAttachment(
  buffer: Buffer,
  declaredMime?: string,
): DetectionResult {
  if (!buffer || buffer.length === 0) {
    return { ok: false, reason: "empty_file" };
  }
  if (buffer.length > MAX_CHAT_ATTACHMENT_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  if (isPdf(buffer)) {
    return { ok: true, value: { kind: "pdf", mimeType: "application/pdf", extension: ".pdf" } };
  }
  if (isJpeg(buffer)) {
    return { ok: true, value: { kind: "image", mimeType: "image/jpeg", extension: ".jpg" } };
  }
  if (isPng(buffer)) {
    return { ok: true, value: { kind: "image", mimeType: "image/png", extension: ".png" } };
  }
  if (isWebp(buffer)) {
    return { ok: true, value: { kind: "image", mimeType: "image/webp", extension: ".webp" } };
  }

  // A declared PDF/image MIME with unrecognised bytes is still an unsupported
  // file: signature verification is the gate, not the header.
  void declaredMime;
  return { ok: false, reason: "unsupported_type" };
}

export const ALLOWED_CHAT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function isAllowedDeclaredMime(mime: string | undefined): boolean {
  if (!mime) return false;
  return (ALLOWED_CHAT_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}
