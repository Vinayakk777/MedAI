import { describe, expect, it, vi } from "vitest";
import { extractPdfPages } from "../../src/lib/pdf/extractPdf";

type FakePage = { text?: string; throwOnGetPage?: boolean };

function fakePdfLoad(pages: FakePage[]) {
  return async () => ({
    numPages: pages.length,
    getPage: async (pageNumber: number) => {
      const page = pages[pageNumber - 1];
      if (!page || page.throwOnGetPage) throw new Error("page unreadable");
      return {
        getTextContent: async () => ({
          items: page.text ? [{ str: page.text, hasEOL: false }] : [],
        }),
      };
    },
  });
}

const noopRasterize = async () => Buffer.from("png");

describe("extractPdfPages", () => {
  it("extracts selectable text page by page", async () => {
    const result = await extractPdfPages(Buffer.from("%PDF-1.7"), {
      loadPdf: fakePdfLoad([
        { text: "Hemoglobin 13.5 g/dL. This is a long enough selectable line." },
        { text: "Glucose 92 mg/dL. This is another long enough selectable line." },
      ]),
      rasterizePage: noopRasterize,
      ocrPage: vi.fn(),
    });

    expect(result.status).toBe("completed");
    expect(result.usedOcr).toBe(false);
    expect(result.pageCount).toBe(2);
    expect(result.pages).toEqual([
      {
        pageNumber: 1,
        text: "Hemoglobin 13.5 g/dL. This is a long enough selectable line.",
        method: "pdf_text",
      },
      {
        pageNumber: 2,
        text: "Glucose 92 mg/dL. This is another long enough selectable line.",
        method: "pdf_text",
      },
    ]);
  });

  it("runs OCR for a scanned page and records the OCR method", async () => {
    const ocrPage = vi.fn(async () => "SCANNED LAB VALUE 42");

    const result = await extractPdfPages(Buffer.from("%PDF-1.7"), {
      loadPdf: fakePdfLoad([{ text: "" }]),
      rasterizePage: noopRasterize,
      ocrPage,
    });

    expect(ocrPage).toHaveBeenCalledOnce();
    expect(ocrPage.mock.calls[0][1]).toBe(1);
    expect(result.usedOcr).toBe(true);
    expect(result.pages[0]).toEqual({
      pageNumber: 1,
      text: "SCANNED LAB VALUE 42",
      method: "ocr",
    });
  });

  it("keeps selectable text when OCR fails", async () => {
    const result = await extractPdfPages(Buffer.from("%PDF-1.7"), {
      loadPdf: fakePdfLoad([{ text: "short" }]),
      rasterizePage: noopRasterize,
      ocrPage: async () => {
        throw new Error("ocr unavailable");
      },
    });

    expect(result.status).toBe("completed");
    expect(result.pages[0]).toEqual({ pageNumber: 1, text: "short", method: "pdf_text" });
  });

  it("times out a hanging OCR call and falls back safely", async () => {
    const result = await extractPdfPages(Buffer.from("%PDF-1.7"), {
      loadPdf: fakePdfLoad([{ text: "" }]),
      rasterizePage: noopRasterize,
      ocrPage: () => new Promise<string>(() => {}),
      ocrTimeoutMs: 20,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("no_extractable_text");
    expect(result.pages[0].method).toBe("empty");
  });

  it("reports an unreadable PDF without throwing", async () => {
    const result = await extractPdfPages(Buffer.from("%PDF-1.7"), {
      loadPdf: async () => {
        throw new Error("corrupt xref");
      },
    });

    expect(result).toMatchObject({
      status: "failed",
      pageCount: 0,
      pages: [],
      error: "pdf_unreadable",
    });
  });

  it("reports an empty buffer without invoking the parser", async () => {
    const loadPdf = vi.fn();
    const result = await extractPdfPages(Buffer.alloc(0), { loadPdf });

    expect(loadPdf).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "failed", error: "empty_file" });
  });

  it("does not fail the document when one page is unreadable", async () => {
    const result = await extractPdfPages(Buffer.from("%PDF-1.7"), {
      loadPdf: fakePdfLoad([
        { text: "First page has a long enough selectable body of text." },
        { throwOnGetPage: true },
      ]),
      rasterizePage: noopRasterize,
      ocrPage: vi.fn(),
    });

    expect(result.status).toBe("partial");
    expect(result.pages.map((page) => page.method)).toEqual(["pdf_text", "empty"]);
  });

  it("honours the page cap", async () => {
    const result = await extractPdfPages(Buffer.from("%PDF-1.7"), {
      loadPdf: fakePdfLoad([
        { text: "Page one has a long enough selectable body of text." },
        { text: "Page two has a long enough selectable body of text." },
        { text: "Page three has a long enough selectable body of text." },
      ]),
      rasterizePage: noopRasterize,
      ocrPage: vi.fn(),
      maxPages: 2,
    });

    expect(result.pageCount).toBe(3);
    expect(result.pages).toHaveLength(2);
  });

  it("honours the OCR page budget", async () => {
    const ocrPage = vi.fn(async () => "ocr text");
    const result = await extractPdfPages(Buffer.from("%PDF-1.7"), {
      loadPdf: fakePdfLoad([{}, {}]),
      rasterizePage: noopRasterize,
      ocrPage,
      maxOcrPages: 1,
    });

    expect(ocrPage).toHaveBeenCalledOnce();
    expect(result.pages[1].method).toBe("empty");
    expect(result.status).toBe("partial");
  });
});
