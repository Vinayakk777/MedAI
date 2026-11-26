export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".webp"] as const;
export const ACCEPTED_PDF_TYPES = ["application/pdf"] as const;
export const ACCEPTED_PDF_EXTENSIONS = [".pdf"] as const;
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB (matches the server)
export const MAX_IMAGE_SIZE_BYTES = MAX_ATTACHMENT_SIZE_BYTES;
export const MAX_ATTACHMENTS = 6;

export type AttachmentKind = "image" | "pdf";

export type ValidationResult =
  | { ok: true; kind: AttachmentKind }
  | { ok: false; reason: string };

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

/** Strip MIME parameters (`image/jpeg; charset=binary`) and normalise case. */
function normalizeMime(type: string | undefined): string {
  return (type || "").split(";")[0].trim().toLowerCase();
}

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PDF_HEADER_SEARCH_BYTES = 1024;

function matchesAt(bytes: Uint8Array, offset: number, expected: number[] | string): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    const value = typeof expected === "string" ? expected.charCodeAt(i) : expected[i];
    if (bytes[offset + i] !== value) return false;
  }
  return true;
}

function containsBytes(bytes: Uint8Array, needle: number[], limit: number): boolean {
  const last = Math.min(bytes.length - needle.length, limit - needle.length);
  for (let i = 0; i <= last; i++) {
    if (matchesAt(bytes, i, needle)) return true;
  }
  return false;
}

/**
 * Reads the leading bytes of a file and identifies it by signature.
 *
 * Browsers do not always report a useful `File.type` (drag-and-drop, Android
 * document providers, Windows shell copies) and some sources omit the file
 * extension entirely. Signatures are the same gate the server uses, so this is
 * the most reliable way to decide whether a selection can be uploaded.
 */
export async function sniffAttachmentKind(file: Blob): Promise<AttachmentKind | null> {
  try {
    const head = new Uint8Array(await file.slice(0, PDF_HEADER_SEARCH_BYTES).arrayBuffer());

    if (containsBytes(head, PDF_HEADER, PDF_HEADER_SEARCH_BYTES)) return "pdf";
    if (matchesAt(head, 0, [0xff, 0xd8, 0xff])) return "image";
    if (matchesAt(head, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      return "image";
    }
    if (matchesAt(head, 0, "RIFF") && matchesAt(head, 8, "WEBP")) return "image";

    return null;
  } catch {
    return null;
  }
}

/**
 * Classifies a candidate attachment from its name/type. This is intentionally
 * tolerant of missing or generic MIME types because the server re-checks the
 * file signature; `sniffAttachmentKind` is preferred when the bytes are
 * available.
 */
export function detectAttachmentKind(file: File): AttachmentKind | null {
  const ext = extensionOf(file.name);
  const declared = normalizeMime(file.type);

  // A recognised extension wins: it is what the user sees and what the OS
  // reports most consistently.
  if (ACCEPTED_PDF_EXTENSIONS.includes(ext as (typeof ACCEPTED_PDF_EXTENSIONS)[number])) {
    return "pdf";
  }
  if (ACCEPTED_IMAGE_EXTENSIONS.includes(ext as (typeof ACCEPTED_IMAGE_EXTENSIONS)[number])) {
    return "image";
  }

  // Fall back to the declared MIME for extensionless files. The server still
  // verifies the signature before accepting anything.
  if (declared === "application/pdf") return "pdf";
  if (declared.startsWith("image/")) return "image";

  return null;
}

export function validateAttachment(file: File): ValidationResult {
  const kind = detectAttachmentKind(file);
  if (!kind) {
    return {
      ok: false,
      reason: "Unsupported file type. Please upload a PDF, JPG, PNG, or WebP file.",
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: "This file is empty." };
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { ok: false, reason: "This file is too large (max 25 MB). Please choose a smaller file." };
  }
  return { ok: true, kind };
}

export function validateImage(file: File): ValidationResult {
  if (detectAttachmentKind(file) !== "image") {
    return { ok: false, reason: "Unsupported file type. Please upload a JPG, PNG, or WebP image." };
  }
  return validateAttachment(file);
}

export type CompressedImage = {
  blob: Blob;
  mimeType: string;
  name: string;
  width: number;
  height: number;
};

const MAX_DIMENSION = 1600;
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. The file may be corrupted."));
    };
    img.src = url;
  });
}

async function drawScaled(
  img: HTMLImageElement,
  maxDim: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Image processing failed.");
  return { blob, width, height };
}

async function compressImage(file: File): Promise<CompressedImage> {
  const img = await loadImage(file);

  // Pass through small images unchanged to preserve fidelity.
  if (
    file.size <= TARGET_MAX_BYTES &&
    img.naturalWidth <= MAX_DIMENSION &&
    img.naturalHeight <= MAX_DIMENSION
  ) {
    return {
      blob: file,
      // Keep the browser's value (possibly empty); the server detects the
      // actual format from the file signature.
      mimeType: normalizeMime(file.type),
      name: file.name,
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }

  // Otherwise compress, stepping quality/dimension down until it fits.
  const attempts: { maxDim: number; quality: number }[] = [
    { maxDim: 1600, quality: 0.85 },
    { maxDim: 1600, quality: 0.72 },
    { maxDim: 1280, quality: 0.72 },
    { maxDim: 1024, quality: 0.68 },
    { maxDim: 768, quality: 0.6 },
  ];

  let result: { blob: Blob; width: number; height: number } | null = null;
  for (const attempt of attempts) {
    const candidate = await drawScaled(img, attempt.maxDim, attempt.quality);
    if (candidate.blob.size <= TARGET_MAX_BYTES) {
      result = candidate;
      break;
    }
  }
  if (!result) result = await drawScaled(img, 640, 0.55);

  // The compressed payload is always JPEG, so the file name must not keep a
  // `.png`/`.webp` extension that no longer matches the bytes.
  const base = file.name.replace(/\.[^/.]+$/, "") || "image";

  return {
    blob: result.blob,
    mimeType: "image/jpeg",
    name: `${base}.jpg`,
    width: result.width,
    height: result.height,
  };
}

/**
 * Validates and compresses an image for upload while keeping enough detail
 * for useful medical analysis. Already-small images are passed through as-is.
 */
export async function prepareImage(file: File): Promise<CompressedImage> {
  const validation = validateImage(file);
  if (!validation.ok) throw new Error(validation.reason);
  return compressImage(file);
}

/** Replace any existing extension so the name matches the uploaded bytes. */
function withExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^/.]+$/, "").trim() || "attachment";
  return `${base}${extension}`;
}

export type PreparedAttachment = {
  blob: Blob;
  mimeType: string;
  name: string;
  kind: AttachmentKind;
  width?: number;
  height?: number;
};

/**
 * Validates a chat attachment and prepares it for upload. Images are
 * compressed; PDFs are sent unchanged so the server can extract their text.
 *
 * The file signature is checked first. Extension/MIME metadata is only a
 * fallback, because browsers frequently report an empty `File.type` (or omit
 * the extension) for files picked from the OS, Android document providers, or
 * drag-and-drop.
 */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  if (file.size === 0) throw new Error("This file is empty.");
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error("This file is too large (max 25 MB). Please choose a smaller file.");
  }

  const kind = (await sniffAttachmentKind(file)) ?? detectAttachmentKind(file);
  if (!kind) {
    throw new Error("Unsupported file type. Please upload a PDF, JPG, PNG, or WebP file.");
  }

  if (kind === "pdf") {
    return {
      blob: file,
      mimeType: "application/pdf",
      name: withExtension(file.name, ".pdf"),
      kind: "pdf",
    };
  }

  const prepared = await compressImage(file);
  return { ...prepared, kind: "image" };
}

export type UploadProgress = (percent: number) => void;

export type UploadedAttachment = {
  id: string;
  url: string;
  mimeType: string;
  name: string;
  size: number;
  type?: "image" | "document";
  kind?: "image" | "pdf";
  pageCount?: number;
  extractionStatus?: string;
};

function uploadFailureMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Your session expired before the file finished uploading. Sign in again and retry.";
  }
  if (status === 413) {
    return "This file is too large for the server (max 25 MB). Please choose a smaller file.";
  }
  if (status === 429) {
    return "Too many uploads right now. Wait a moment and try again.";
  }
  if (status >= 500) {
    return "The server could not store this file. Please try again in a moment.";
  }
  return `Attachment upload failed (HTTP ${status}). Please try again.`;
}

/** Uploads images/PDFs to the authenticated backend endpoint with progress. */
export function uploadAttachments(
  attachments: { blob: Blob; name: string; mimeType: string }[],
  onProgress?: UploadProgress,
  signal?: AbortSignal,
): Promise<UploadedAttachment[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const attachment of attachments) {
      // Ensure the multipart part carries a usable content type even when the
      // browser reported none (the server still verifies the signature).
      const declared = (attachment.blob.type || "").split(";")[0].trim().toLowerCase();
      const payload =
        attachment.mimeType && declared !== attachment.mimeType
          ? new Blob([attachment.blob], { type: attachment.mimeType })
          : attachment.blob;
      form.append("images", payload, attachment.name);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/images/upload");
    // Same-origin cookies are sent by default, but this also keeps the request
    // authenticated when the app is hosted on a sibling origin.
    xhr.withCredentials = true;

    if (signal) {
      if (signal.aborted) {
        reject(new Error("Upload cancelled"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          xhr.abort();
          reject(new Error("Upload cancelled"));
        },
        { once: true },
      );
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let json: any = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.attachments) {
        onProgress?.(100);
        resolve(json.attachments as UploadedAttachment[]);
      } else {
        reject(new Error(json?.error ?? uploadFailureMessage(xhr.status)));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading the attachment."));
    xhr.ontimeout = () => reject(new Error("Attachment upload timed out."));
    xhr.send(form);
  });
}

/** @deprecated Use `uploadAttachments`; kept for existing imports. */
export const uploadImages = uploadAttachments;