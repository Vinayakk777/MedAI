import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCitationFooter } from "../../api-server/src/lib/rag/citationFooter";
import type { CitationEvidence } from "../../api-server/src/lib/rag/types";
import {
  formatPageLabel,
  parseCitationFooter,
  safeSourceHref,
  sourceTypeLabel,
} from "../src/lib/citations";
import { classifyAnswer } from "../src/lib/answerState";
import { getAttachmentStateView } from "../src/lib/attachmentState";
import { SourceReferencesPanel } from "../src/components/rag/SourceReferencesPanel";
import { AnswerStatusNotice } from "../src/components/chat/AnswerStatusNotice";

function sharedCitation(
  overrides: Partial<CitationEvidence> = {},
): CitationEvidence {
  return {
    chunkId: "chunk-1",
    documentId: "doc-1",
    organization: "WHO",
    guidelineName: "Hypertension guideline",
    publicationDate: new Date("2024-01-15T00:00:00Z"),
    evidenceText: "Blood pressure should be measured with a validated cuff.",
    confidence: "high",
    relevanceScore: 0.92,
    section: "Measurement",
    journal: "Example Journal",
    pmcid: "PMC123456",
    sourceUrl: "https://example.org/guideline",
    pageNumber: 2,
    ...overrides,
  };
}

function attachmentCitation(
  overrides: Partial<CitationEvidence> = {},
): CitationEvidence {
  return {
    chunkId: "att-1:p3",
    documentId: "att-1",
    organization: "Uploaded document",
    guidelineName: "blood_test.pdf",
    sourceName: "blood_test.pdf",
    evidenceText: "Hemoglobin 13.5 g/dL, within the reference range.",
    confidence: "moderate",
    relevanceScore: 1,
    pageNumber: 3,
    sourceType: "attachment",
    ...overrides,
  };
}

const attachmentIndex = [{ name: "blood_test.pdf", url: "/api/images/att-1" }];

describe("parseCitationFooter", () => {
  it("separates the answer body and preserves shared source metadata", () => {
    const footer = buildCitationFooter([sharedCitation()]);
    const parsed = parseCitationFooter(`Answer text${footer}`);

    expect(parsed.hadFooter).toBe(true);
    expect(parsed.body).toBe("Answer text");
    expect(parsed.body).not.toContain("Sources used");
    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0]).toMatchObject({
      kind: "shared",
      title: "Hypertension guideline",
      journal: "Example Journal",
      publicationYear: 2024,
      pages: [2],
      pmcid: "PMC123456",
      url: "https://example.org/guideline",
    });
    expect(parsed.basis).toContain("This response was grounded in");
  });

  it("classifies the user's own attachment and resolves only its own URL", () => {
    const footer = buildCitationFooter([attachmentCitation()]);
    const parsed = parseCitationFooter(`Answer text${footer}`, attachmentIndex);

    expect(parsed.sources).toHaveLength(1);
    expect(parsed.sources[0]).toMatchObject({
      kind: "attachment",
      title: "blood_test.pdf",
      pages: [3],
      url: "/api/images/att-1",
    });
    expect(parsed.sources[0].publicationYear).toBeUndefined();
    expect(parsed.sources[0].journal).toBeUndefined();
    expect(parsed.sources[0].pmcid).toBeUndefined();
  });

  it("keeps shared and attachment sources distinct in one footer", () => {
    const footer = buildCitationFooter([
      sharedCitation(),
      attachmentCitation(),
    ]);
    const parsed = parseCitationFooter(`Answer text${footer}`, attachmentIndex);

    expect(parsed.sources.map((source) => source.kind)).toEqual([
      "shared",
      "attachment",
    ]);
    expect(parsed.sources.map((source) => source.title)).toEqual([
      "Hypertension guideline",
      "blood_test.pdf",
    ]);
  });

  it("does not invent missing dates, pages, links, or journals", () => {
    const footer = buildCitationFooter([
      sharedCitation({
        guidelineName: "Fever guidance",
        publicationDate: undefined,
        pageNumber: undefined,
        journal: undefined,
        pmcid: undefined,
        sourceUrl: undefined,
      }),
    ]);
    const parsed = parseCitationFooter(`Answer text${footer}`);

    expect(parsed.sources[0]).toMatchObject({
      kind: "shared",
      title: "Fever guidance",
      pages: [],
    });
    expect(parsed.sources[0].publicationYear).toBeUndefined();
    expect(parsed.sources[0].journal).toBeUndefined();
    expect(parsed.sources[0].pmcid).toBeUndefined();
    expect(parsed.sources[0].url).toBeUndefined();
    expect(formatPageLabel(parsed.sources[0].pages)).toBeUndefined();
  });

  it("leaves content unchanged when there is no citation footer", () => {
    const parsed = parseCitationFooter("Just a plain answer.");

    expect(parsed.hadFooter).toBe(false);
    expect(parsed.body).toBe("Just a plain answer.");
    expect(parsed.sources).toEqual([]);
  });
});

describe("citation presentation helpers", () => {
  it("labels shared sources and private attachments differently", () => {
    expect(sourceTypeLabel("shared")).toBe("Shared medical source");
    expect(sourceTypeLabel("attachment")).toBe("Your attachment");
  });

  it("allows only public web links and same-origin paths", () => {
    expect(safeSourceHref("https://example.org/guideline")).toBe(
      "https://example.org/guideline",
    );
    expect(safeSourceHref("/api/images/att-1")).toBe("/api/images/att-1");
    expect(safeSourceHref("javascript:alert(1)")).toBeUndefined();
    expect(safeSourceHref("//evil.example/file")).toBeUndefined();
  });

  it("formats one or many page numbers without adding pages", () => {
    expect(formatPageLabel([3])).toBe("Page 3");
    expect(formatPageLabel([3, 1, 3])).toBe("Pages 1, 3");
    expect(formatPageLabel([])).toBeUndefined();
  });
});

describe("getAttachmentStateView", () => {
  const state = (input: Parameters<typeof getAttachmentStateView>[0]) =>
    getAttachmentStateView(input);

  it("maps upload and extraction states to clear labels", () => {
    expect(state({ isUploading: true })).toMatchObject({
      state: "uploading",
      label: "Uploading…",
    });
    expect(state({ type: "document", extractionStatus: "pending" })).toMatchObject({
      state: "processing",
      label: "Processing…",
    });
    expect(state({ type: "document", extractionStatus: "completed" })).toMatchObject({
      state: "ready",
      label: "Ready",
    });
    expect(state({ type: "document", extractionStatus: "partial" })).toMatchObject({
      state: "partial",
      label: "Partially readable",
    });
    expect(state({ type: "document", extractionStatus: "failed" })).toMatchObject({
      state: "failed",
      label: "Failed",
    });
    expect(state({ type: "document", extractionStatus: "unsupported" })).toMatchObject({
      state: "unreadable",
      label: "Unreadable",
    });
  });

  it("treats images as ready and legacy PDFs as attached", () => {
    expect(state({ type: "image", mimeType: "image/png" }).state).toBe("ready");
    expect(state({ type: "document" })).toMatchObject({
      state: "unknown",
      label: "Attached",
    });
  });
});

describe("classifyAnswer", () => {
  it("recognises emergency guidance", () => {
    expect(
      classifyAnswer(
        "This sounds like it could be a medical emergency. Please call your local emergency number (911 in the US, 108 in India) or go to the nearest emergency room immediately.",
        { citationCount: 0 },
      ),
    ).toBe("emergency");
  });

  it("recognises safety fallbacks and requests for more information", () => {
    expect(
      classifyAnswer(
        "I'm unable to provide a validated response right now. Please consult a qualified healthcare professional for medical advice.",
        { citationCount: 0 },
      ),
    ).toBe("safety_fallback");
    expect(
      classifyAnswer(
        "I appreciate you reaching out, but I need a bit more information to provide helpful guidance. Could you please describe: your main symptoms?",
        { citationCount: 0 },
      ),
    ).toBe("insufficient");
  });

  it("marks substantive answers without citations as lacking evidence", () => {
    expect(classifyAnswer("x".repeat(120), { citationCount: 0 })).toBe(
      "no_evidence",
    );
    expect(classifyAnswer("x".repeat(120), { citationCount: 2 })).toBe(
      "answered",
    );
    expect(classifyAnswer("Hello! How can I help?", { citationCount: 0 })).toBe(
      "answered",
    );
    expect(classifyAnswer("anything", { isError: true })).toBe("error");
  });
});

describe("source and safety rendering", () => {
  it("renders source-type labels, links, pages, dates, and journal metadata", () => {
    const footer = buildCitationFooter([
      sharedCitation(),
      attachmentCitation(),
    ]);
    const parsed = parseCitationFooter(`Answer text${footer}`, attachmentIndex);
    const html = renderToStaticMarkup(
      <SourceReferencesPanel sources={parsed.sources} basis={parsed.basis} />,
    );

    expect(html).toContain("Shared medical source");
    expect(html).toContain("Your attachment");
    expect(html).toContain("Hypertension guideline");
    expect(html).toContain('href="https://example.org/guideline"');
    expect(html).toContain("blood_test.pdf");
    expect(html).toContain('href="/api/images/att-1"');
    expect(html).toContain("Page 3");
    expect(html).toContain("2024");
    expect(html).toContain("PMCID PMC123456");
    expect(html).toContain("Example Journal");
  });

  it("does not render links or page labels when metadata is missing", () => {
    const footer = buildCitationFooter([
      sharedCitation({
        guidelineName: "Fever guidance",
        publicationDate: undefined,
        pageNumber: undefined,
        journal: undefined,
        pmcid: undefined,
        sourceUrl: undefined,
      }),
    ]);
    const parsed = parseCitationFooter(`Answer text${footer}`);
    const html = renderToStaticMarkup(
      <SourceReferencesPanel sources={parsed.sources} />,
    );

    expect(html).toContain("Fever guidance");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("Page ");
    expect(html).not.toContain("PMCID");
  });

  it("renders the insufficient-evidence notice when no sources exist", () => {
    const html = renderToStaticMarkup(<SourceReferencesPanel sources={[]} />);

    expect(html).toContain("No evidence was found");
    expect(html).toContain("not a diagnosis");
  });

  it("renders emergency, safety fallback, and insufficient banners", () => {
    const emergency = renderToStaticMarkup(
      <AnswerStatusNotice kind="emergency" />,
    );
    expect(emergency).toContain("Emergency guidance");
    expect(emergency).toContain("not a diagnosis");

    const fallback = renderToStaticMarkup(
      <AnswerStatusNotice kind="safety_fallback" />,
    );
    expect(fallback).toContain("Safety response");
    expect(fallback).toContain("consult a qualified healthcare professional");

    const insufficient = renderToStaticMarkup(
      <AnswerStatusNotice kind="insufficient" />,
    );
    expect(insufficient).toContain("More information needed");
  });
});
