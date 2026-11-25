import path from "node:path";
import { ensureDir, UPLOAD_ROOT } from "../storage/paths";

/**
 * Page-aware PDF text extraction with a best-effort OCR fallback.
 *
 * - Selectable text is extracted per page with `pdfjs-dist` (pure JS/WASM, no
 *   native build step).
 * - Pages with no usable text are rasterised with `@napi-rs/canvas` and passed
 *   to `tesseract.js`.
 * - Every dependency is loaded lazily so a missing/unsupported native module
 *   degrades to "text not extractable" instead of crashing the API process.
 */

export type PageExtractionMethod = "pdf_text" | "ocr" | "empty";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  method: PageExtractionMethod;
}

export type PdfExtractionStatus = "completed" | "partial" | "failed";

export interface PdfExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
  status: PdfExtractionStatus;
  usedOcr: boolean;
  error?: string;
}

export interface PdfExtractionOptions {
  /** Hard cap on pages read from the document. */
  maxPages?: number;
  /** Hard cap on pages sent through OCR (the expensive path). */
  maxOcrPages?: number;
  /** A page with fewer characters than this is treated as scanned. */
  minTextCharsForOcr?: number;
  /** Per-page OCR timeout. */
  ocrTimeoutMs?: number;
  /** Injectable for tests. Receives a PNG buffer and the 1-based page number. */
  ocrPage?: (png: Buffer, pageNumber: number) => Promise<string>;
  /** Injectable for tests. */
  loadPdf?: (data: Uint8Array) => Promise<any>;
  /** Injectable for tests. */
  rasterizePage?: (page: any) => Promise<Buffer>;
}

const DEFAULTS = {
  maxPages: 40,
  maxOcrPages: 6,
  minTextCharsForOcr: 40,
  ocrTimeoutMs: 45_000,
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function defaultLoadPdf(data: Uint8Array): Promise<any> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
}

async function defaultRasterizePage(page: any): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toBuffer("image/png");
}

let ocrWorkerPromise: Promise<any> | null = null;
let ocrQueue: Promise<unknown> = Promise.resolve();

async function getOcrWorker(): Promise<any> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const Tesseract: any = await import("tesseract.js");
      const cachePath = path.join(UPLOAD_ROOT, ".tesseract-cache");
      ensureDir(cachePath);
      return Tesseract.createWorker("eng", 1, {
        cachePath,
        ...(process.env.TESSERACT_LANG_PATH
          ? { langPath: process.env.TESSERACT_LANG_PATH }
          : {}),
        logger: () => undefined,
      });
    })().catch((err) => {
      ocrWorkerPromise = null;
      throw err;
    });
  }
  return ocrWorkerPromise;
}

/**
 * OCR a PNG/JPEG buffer. Serialised because a single Tesseract worker handles
 * one recognition at a time.
 */
export async function ocrImage(image: Buffer): Promise<string> {
  const run = ocrQueue.then(async () => {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(image);
    return (data?.text ?? "").trim();
  });
  // Keep the queue alive even when this recognition fails.
  ocrQueue = run.catch(() => undefined);
  return run;
}

async function defaultOcrPage(png: Buffer): Promise<string> {
  return ocrImage(png);
}

function joinTextItems(items: any[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (typeof item?.str !== "string") continue;
    parts.push(item.str);
    if (item.hasEOL) parts.push("\n");
    else parts.push(" ");
  }
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function readPageText(page: any): Promise<string> {
  const content = await page.getTextContent();
  return joinTextItems(Array.isArray(content?.items) ? content.items : []);
}

/**
 * Extract text from a PDF buffer, page by page. Never throws for malformed
 * input: callers receive `status: "failed"` and can render a safe message.
 */
export async function extractPdfPages(
  buffer: Buffer | Uint8Array,
  options: PdfExtractionOptions = {},
): Promise<PdfExtractionResult> {
  const maxPages = options.maxPages ?? DEFAULTS.maxPages;
  const maxOcrPages = options.maxOcrPages ?? DEFAULTS.maxOcrPages;
  const minTextChars = options.minTextCharsForOcr ?? DEFAULTS.minTextCharsForOcr;
  const ocrTimeoutMs = options.ocrTimeoutMs ?? DEFAULTS.ocrTimeoutMs;
  const loadPdf = options.loadPdf ?? defaultLoadPdf;
  const rasterizePage = options.rasterizePage ?? defaultRasterizePage;
  const ocrPage = options.ocrPage ?? defaultOcrPage;

  const bytes = buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
  if (bytes.byteLength === 0) {
    return { pageCount: 0, pages: [], status: "failed", usedOcr: false, error: "empty_file" };
  }

  let pdf: any;
  try {
    pdf = await loadPdf(bytes);
  } catch {
    return {
      pageCount: 0,
      pages: [],
      status: "failed",
      usedOcr: false,
      error: "pdf_unreadable",
    };
  }

  const pageCount = Number.isFinite(pdf?.numPages) ? pdf.numPages : 0;
  if (pageCount <= 0) {
    return {
      pageCount: 0,
      pages: [],
      status: "failed",
      usedOcr: false,
      error: "pdf_unreadable",
    };
  }

  const pages: ExtractedPage[] = [];
  let ocrPages = 0;
  let usedOcr = false;

  for (let pageNumber = 1; pageNumber <= Math.min(pageCount, maxPages); pageNumber++) {
    let text = "";
    try {
      const page = await pdf.getPage(pageNumber);
      text = await readPageText(page);

      if (text.length < minTextChars && ocrPages < maxOcrPages) {
        try {
          const png = await rasterizePage(page);
          const ocrText = await withTimeout(
            ocrPage(png, pageNumber),
            ocrTimeoutMs,
            `ocr_page_${pageNumber}`,
          );
          ocrPages++;
          if (ocrText.trim().length > 0) {
            text = ocrText.trim();
            usedOcr = true;
            pages.push({ pageNumber, text, method: "ocr" });
            continue;
          }
        } catch {
          // OCR is best-effort; keep whatever text extraction produced.
        }
      }
    } catch {
      // A single unreadable page must not fail the whole document.
    }

    pages.push({
      pageNumber,
      text: text.trim(),
      method: text.trim().length > 0 ? "pdf_text" : "empty",
    });
  }

  const readable = pages.filter((page) => page.text.length > 0).length;
  const status: PdfExtractionStatus =
    readable === 0 ? "failed" : readable === pages.length ? "completed" : "partial";

  return {
    pageCount,
    pages,
    status,
    usedOcr,
    ...(status === "failed" ? { error: "no_extractable_text" } : {}),
  };
}
