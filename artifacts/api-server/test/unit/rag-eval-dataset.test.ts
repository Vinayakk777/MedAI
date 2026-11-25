import { describe, expect, it } from "vitest";
import {
  loadGoldenDataset,
  normalizeIdentifier,
  validateDataset,
} from "../../eval/lib/dataset";

describe("RAG golden dataset", () => {
  const dataset = loadGoldenDataset();

  it("is structurally valid", () => {
    expect(validateDataset(dataset)).toEqual([]);
  });

  it("is versioned and clearly marked as synthetic", () => {
    expect(dataset.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(dataset.name).toBeTruthy();
    expect(dataset.disclaimer).toMatch(/synthetic/i);
    expect(dataset.disclaimer).toMatch(/not clinical guidance/i);
  });

  it("has unique document, chunk, and case identifiers", () => {
    const documentIds = dataset.documents.map((document) => document.id);
    const chunkIds = dataset.chunks.map((chunk) => chunk.id);
    const caseIds = dataset.cases.map((testCase) => testCase.id);

    expect(new Set(documentIds).size).toBe(documentIds.length);
    expect(new Set(chunkIds).size).toBe(chunkIds.length);
    expect(new Set(caseIds).size).toBe(caseIds.length);
  });

  it("references only existing documents and chunks", () => {
    const documentIds = new Set(dataset.documents.map((document) => document.id));
    const chunkIds = new Set(dataset.chunks.map((chunk) => chunk.id));

    for (const chunk of dataset.chunks) {
      expect(documentIds.has(chunk.documentId)).toBe(true);
    }
    for (const testCase of dataset.cases) {
      for (const chunkId of testCase.relevantChunkIds) {
        expect(chunkIds.has(chunkId)).toBe(true);
      }
      for (const chunkId of testCase.fixtureAnswerEvidenceChunkIds) {
        expect(chunkIds.has(chunkId)).toBe(true);
      }
    }
  });

  it("covers the required behavior categories", () => {
    const tags = new Set(dataset.cases.flatMap((testCase) => testCase.tags));

    for (const required of [
      "direct",
      "insufficient_evidence",
      "conflicting_evidence",
      "emergency",
      "unsafe_diagnosis",
      "unsafe_medication",
      "citation_fabrication",
      "prompt_injection",
    ]) {
      expect(tags.has(required)).toBe(true);
    }
  });

  it("labels expected citation identifiers in the evidence", () => {
    for (const testCase of dataset.cases) {
      if (testCase.expectedCitationIds.length === 0) continue;

      const relevantChunks = dataset.chunks.filter((chunk) =>
        testCase.relevantChunkIds.includes(chunk.id),
      );
      const relevantDocumentIds = new Set(
        relevantChunks.map((chunk) => chunk.documentId),
      );
      const relevantDocuments = dataset.documents.filter((document) =>
        relevantDocumentIds.has(document.id),
      );
      const known = [
        ...relevantDocuments.flatMap((document) => [
          document.url ?? "",
          String(document.metadata?.pmcid ?? ""),
        ]),
        ...relevantChunks.map((chunk) => chunk.content),
      ]
        .map(normalizeIdentifier)
        .filter(Boolean);

      for (const expected of testCase.expectedCitationIds) {
        const normalized = normalizeIdentifier(expected);
        expect(
          known.some(
            (value) =>
              value.includes(normalized) || normalized.includes(value),
          ),
        ).toBe(true);
      }
    }
  });

  it("keeps answer cases grounded in labeled evidence", () => {
    for (const testCase of dataset.cases) {
      if (testCase.expectedBehavior !== "answer") continue;

      expect(testCase.relevantChunkIds.length).toBeGreaterThan(0);
      expect(testCase.keyFacts.length).toBeGreaterThan(0);
      expect(testCase.fixtureAnswer.trim().length).toBeGreaterThan(0);
      expect(testCase.fixtureAnswerEvidenceChunkIds.length).toBeGreaterThan(0);

      for (const evidenceChunkId of testCase.fixtureAnswerEvidenceChunkIds) {
        expect(testCase.relevantChunkIds).toContain(evidenceChunkId);
      }
    }
  });

  it("keeps insufficient-evidence cases free of labeled evidence and citations", () => {
    const insufficient = dataset.cases.filter(
      (testCase) =>
        testCase.expectedBehavior === "abstain" &&
        testCase.abstainReason === "insufficient_evidence",
    );

    expect(insufficient.length).toBeGreaterThan(0);
    for (const testCase of insufficient) {
      expect(testCase.relevantChunkIds).toEqual([]);
      expect(testCase.expectedCitationIds).toEqual([]);
    }
  });

  it("does not expect citations for emergency cases", () => {
    const emergencies = dataset.cases.filter(
      (testCase) => testCase.expectedBehavior === "emergency",
    );

    expect(emergencies.length).toBeGreaterThan(0);
    for (const testCase of emergencies) {
      expect(testCase.expectedCitationIds).toEqual([]);
    }
  });
});
