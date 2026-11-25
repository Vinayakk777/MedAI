import { describe, expect, it } from "vitest";
import {
  MAX_TOTAL_EVIDENCE_CHARS,
  buildAttachmentEvidence,
  buildAttachmentQuestionFallback,
  buildUnreadableAttachmentsNotice,
} from "../../src/lib/chat-attachments/evidence";
import { buildCitationFooter } from "../../src/lib/rag/citationFooter";

const descriptor = (overrides: Record<string, any> = {}) => ({
  id: "att-1",
  name: "blood_test.pdf",
  kind: "pdf",
  extractionStatus: "completed",
  ...overrides,
});

const page = (overrides: Record<string, any> = {}) => ({
  attachmentId: "att-1",
  pageNumber: 1,
  text: "Hemoglobin 13.5 g/dL, within the reference range for an adult.",
  extractionMethod: "pdf_text",
  ...overrides,
});

describe("buildAttachmentEvidence", () => {
  it("preserves document name and page number for citations", () => {
    const evidence = buildAttachmentEvidence(
      [descriptor()],
      [
        page({ pageNumber: 2, text: "Glucose 92 mg/dL, which is within range." }),
        page({ pageNumber: 1 }),
      ],
    );

    expect(evidence.readableDocuments).toEqual(["blood_test.pdf"]);
    expect(evidence.unreadableDocuments).toEqual([]);
    expect(evidence.citations.map((c) => c.pageNumber)).toEqual([1, 2]);
    expect(evidence.citations[0]).toMatchObject({
      documentId: "att-1",
      sourceName: "blood_test.pdf",
      guidelineName: "blood_test.pdf",
      confidence: "moderate",
    });
    expect(evidence.evidenceBlock).toContain("Document: blood_test.pdf — page 1");
    expect(evidence.evidenceBlock).toContain("[ATTACHED DOCUMENT EVIDENCE]");
  });

  it("marks OCR-derived pages as low confidence", () => {
    const evidence = buildAttachmentEvidence(
      [descriptor()],
      [page({ extractionMethod: "ocr" })],
    );

    expect(evidence.citations[0].confidence).toBe("low");
  });

  it("reports attachments with no usable text as unreadable", () => {
    const evidence = buildAttachmentEvidence([descriptor()], []);

    expect(evidence.readableDocuments).toEqual([]);
    expect(evidence.unreadableDocuments).toEqual(["blood_test.pdf"]);
    expect(evidence.citations).toEqual([]);
    expect(evidence.evidenceBlock).toBe("");
  });

  it("ignores pages whose text is too short to be evidence", () => {
    const evidence = buildAttachmentEvidence(
      [descriptor()],
      [page({ text: "  n/a  " })],
    );

    expect(evidence.unreadableDocuments).toEqual(["blood_test.pdf"]);
  });

  it("never treats image attachments as document evidence", () => {
    const evidence = buildAttachmentEvidence(
      [descriptor({ id: "img-1", name: "rash.png", kind: "image" })],
      [page({ attachmentId: "img-1" })],
    );

    expect(evidence.citations).toEqual([]);
    expect(evidence.unreadableDocuments).toEqual([]);
    expect(evidence.readableDocuments).toEqual([]);
  });

  it("caps total evidence size", () => {
    const pages = Array.from({ length: 20 }, (_, i) =>
      page({ pageNumber: i + 1, text: "x".repeat(1800) }),
    );
    const evidence = buildAttachmentEvidence([descriptor()], pages);
    const total = evidence.citations.reduce((sum, c) => sum + c.evidenceText.length, 0);

    expect(total).toBeLessThanOrEqual(MAX_TOTAL_EVIDENCE_CHARS);
    expect(evidence.citations.length).toBeGreaterThan(0);
  });

  it("renders a footer with the source name and page", () => {
    const evidence = buildAttachmentEvidence([descriptor()], [page({ pageNumber: 3 })]);
    const footer = buildCitationFooter(evidence.citations);

    expect(footer).toContain("blood_test.pdf");
    expect(footer).toContain("page 3");
    expect(footer).toContain("Sources used");
  });

  it("describes attachment-only grounding without claiming literature", () => {
    const evidence = buildAttachmentEvidence([descriptor()], [page()]);
    const footer = buildCitationFooter(evidence.citations);

    expect(footer).toContain("grounded in the attached document(s)");
    expect(footer).not.toContain("retrieved medical literature");
  });
});

describe("attachment prompt helpers", () => {
  it("builds a safe unreadable notice naming the file", () => {
    const notice = buildUnreadableAttachmentsNotice(["scan.pdf"]);
    expect(notice).toContain("scan.pdf");
    expect(notice).toContain("could not be read");
    expect(buildUnreadableAttachmentsNotice([])).toBe("");
  });

  it("builds a question when the user sent only a document", () => {
    const question = buildAttachmentQuestionFallback(["report.pdf"]);
    expect(question).toContain("report.pdf");
    expect(question).toContain("Summarise");
  });
});
