export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
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

/**
 * Classifies a candidate attachment. The declared MIME type and the extension
 * must agree; the server independently re-checks the file signature.
 */
export function detectAttachmentKind(file: File): AttachmentKind | null {
  const ext = extensionOf(file.name);
  const declared = (file.type || "").toLowerCase();

  if (
    ACCEPTED_PDF_EXTENSIONS.includes(ext as (typeof ACCEPTED_PDF_EXTENSIONS)[number]) &&
    (declared === "application/pdf" || declared === "" || declared === "application/octet-stream")
  ) {
    return "pdf";
  }

  if (
    ACCEPTED_IMAGE_TYPES.includes(declared as (typeof ACCEPTED_IMAGE_TYPES)[number]) &&
    ACCEPTED_IMAGE_EXTENSIONS.includes(ext as (typeof ACCEPTED_IMAGE_EXTENSIONS)[number])
  ) {
    return "image";
  }

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

/**
 * Validates and compresses an image for upload while keeping enough detail
 * for useful medical analysis. Already-small images are passed through as-is.
 */
export async function prepareImage(file: File): Promise<CompressedImage> {
  const validation = validateImage(file);
  if (!validation.ok) throw new Error(validation.reason);

  const img = await loadImage(file);

  // Pass through small images unchanged to preserve fidelity.
  if (
    file.size <= TARGET_MAX_BYTES &&
    img.naturalWidth <= MAX_DIMENSION &&
    img.naturalHeight <= MAX_DIMENSION
  ) {
    return {
      blob: file,
      mimeType: file.type,
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

  const ext = file.name.slice(file.name.lastIndexOf("."));
  const base = file.name.replace(/\.[^/.]+$/, "") || "image";

  return {
    blob: result.blob,
    mimeType: "image/jpeg",
    name: `${base}${ext}`,
    width: result.width,
    height: result.height,
  };
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
 */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  const validation = validateAttachment(file);
  if (!validation.ok) throw new Error(validation.reason);

  if (validation.kind === "pdf") {
    return {
      blob: file,
      mimeType: "application/pdf",
      name: file.name,
      kind: "pdf",
    };
  }

  const prepared = await prepareImage(file);
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

/** Uploads images/PDFs to the authenticated backend endpoint with progress. */
export function uploadAttachments(
  attachments: { blob: Blob; name: string; mimeType: string }[],
  onProgress?: UploadProgress,
  signal?: AbortSignal,
): Promise<UploadedAttachment[]> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const attachment of attachments) {
      form.append("images", attachment.blob, attachment.name);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/images/upload");

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
        reject(new Error(json?.error ?? "Attachment upload failed. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading the attachment."));
    xhr.ontimeout = () => reject(new Error("Attachment upload timed out."));
    xhr.send(form);
  });
}

/** @deprecated Use `uploadAttachments`; kept for existing imports. */
export const uploadImages = uploadAttachments;