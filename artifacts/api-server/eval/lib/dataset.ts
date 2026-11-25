import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Golden RAG dataset types and validation.
 *
 * The dataset is intentionally synthetic and small. It is evaluation data, not
 * clinical guidance, and it contains no real patient information.
 */

export type ExpectedBehavior = "answer" | "abstain" | "emergency";

export type AbstainReason =
  | "insufficient_evidence"
  | "unsafe_advice"
  | "invalid_citation";

export interface GoldenDocument {
  id: string;
  sourceId?: string;
  organization: string;
  title: string;
  publicationDate: string;
  url?: string;
  author?: string;
  metadata?: {
    journal?: string;
    pmcid?: string;
    [key: string]: unknown;
  };
}

export interface GoldenChunk {
  id: string;
  documentId: string;
  sourceId?: string;
  content: string;
  section?: string;
  heading?: string;
  metadata?: Record<string, unknown>;
}

export interface GoldenCase {
  id: string;
  question: string;
  pipelineStage?: string;
  relevantChunkIds: string[];
  keyFacts: string[];
  expectedCitationIds: string[];
  expectedBehavior: ExpectedBehavior;
  abstainReason?: AbstainReason;
  fixtureAnswer: string;
  fixtureAnswerEvidenceChunkIds: string[];
  tags: string[];
  notes?: string;
}

export interface GoldenDataset {
  version: string;
  name: string;
  createdAt: string;
  description: string;
  disclaimer: string;
  config: {
    topK: number;
    recallK: number[];
    pipelineStage: string;
    [key: string]: unknown;
  };
  documents: GoldenDocument[];
  chunks: GoldenChunk[];
  cases: GoldenCase[];
}

const EVAL_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const DEFAULT_DATASET_PATH = path.join(
  EVAL_DIR,
  "golden",
  "rag-golden.v1.json",
);

export function loadGoldenDataset(
  filePath: string = DEFAULT_DATASET_PATH,
): GoldenDataset {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as GoldenDataset;
}

export function normalizeIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function collectCaseKnownIdentifiers(
  dataset: GoldenDataset,
  testCase: GoldenCase,
): string[] {
  const chunkIds = new Set(testCase.relevantChunkIds);
  const documentIds = new Set(
    dataset.chunks
      .filter((chunk) => chunkIds.has(chunk.id))
      .map((chunk) => chunk.documentId),
  );

  const values: string[] = [];

  for (const document of dataset.documents) {
    if (!documentIds.has(document.id)) continue;
    if (document.url) values.push(document.url);
    if (document.metadata?.pmcid) values.push(String(document.metadata.pmcid));
    if (document.metadata?.doi) values.push(String(document.metadata.doi));
  }

  for (const chunk of dataset.chunks) {
    if (chunkIds.has(chunk.id)) values.push(chunk.content);
  }

  return values.map(normalizeIdentifier);
}

function isExpectedIdentifierPresent(
  expected: string,
  knownIdentifiers: string[],
): boolean {
  const normalizedExpected = normalizeIdentifier(expected);
  if (normalizedExpected.length === 0) return false;
  return knownIdentifiers.some(
    (known) =>
      known.includes(normalizedExpected) ||
      normalizedExpected.includes(known),
  );
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

/**
 * Validate structural integrity and coverage of the golden dataset.
 * Returns an empty array when the dataset is usable.
 */
export function validateDataset(dataset: GoldenDataset): string[] {
  const errors: string[] = [];

  if (!dataset.version || typeof dataset.version !== "string") {
    errors.push("dataset.version is required");
  }
  if (!dataset.name) errors.push("dataset.name is required");
  if (!dataset.description) errors.push("dataset.description is required");
  if (!dataset.disclaimer || !/synthetic/i.test(dataset.disclaimer)) {
    errors.push("dataset.disclaimer must state that the data is synthetic");
  }
  if (!Array.isArray(dataset.documents) || dataset.documents.length === 0) {
    errors.push("dataset.documents must be a non-empty array");
  }
  if (!Array.isArray(dataset.chunks) || dataset.chunks.length === 0) {
    errors.push("dataset.chunks must be a non-empty array");
  }
  if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) {
    errors.push("dataset.cases must be a non-empty array");
  }
  if (!dataset.config || !Array.isArray(dataset.config.recallK)) {
    errors.push("dataset.config.recallK must be an array");
  }
  if (errors.length > 0) return errors;

  for (const duplicate of duplicates(dataset.documents.map((d) => d.id))) {
    errors.push(`duplicate document id: ${duplicate}`);
  }
  for (const duplicate of duplicates(dataset.chunks.map((c) => c.id))) {
    errors.push(`duplicate chunk id: ${duplicate}`);
  }
  for (const duplicate of duplicates(dataset.cases.map((c) => c.id))) {
    errors.push(`duplicate case id: ${duplicate}`);
  }

  const documentIds = new Set(dataset.documents.map((d) => d.id));
  const chunkIds = new Set(dataset.chunks.map((c) => c.id));

  for (const chunk of dataset.chunks) {
    if (!documentIds.has(chunk.documentId)) {
      errors.push(
        `chunk ${chunk.id} references missing document ${chunk.documentId}`,
      );
    }
    if (!chunk.content || chunk.content.trim().length === 0) {
      errors.push(`chunk ${chunk.id} has empty content`);
    }
  }

  for (const testCase of dataset.cases) {
    if (!testCase.question || testCase.question.trim().length === 0) {
      errors.push(`case ${testCase.id} has an empty question`);
    }
    if (
      !["answer", "abstain", "emergency"].includes(testCase.expectedBehavior)
    ) {
      errors.push(`case ${testCase.id} has an invalid expectedBehavior`);
    }
    if (!Array.isArray(testCase.relevantChunkIds)) {
      errors.push(`case ${testCase.id} relevantChunkIds must be an array`);
    }
    if (!Array.isArray(testCase.keyFacts)) {
      errors.push(`case ${testCase.id} keyFacts must be an array`);
    }
    if (!Array.isArray(testCase.expectedCitationIds)) {
      errors.push(`case ${testCase.id} expectedCitationIds must be an array`);
    }
    if (!Array.isArray(testCase.tags) || testCase.tags.length === 0) {
      errors.push(`case ${testCase.id} must have at least one tag`);
    }

    for (const chunkId of testCase.relevantChunkIds ?? []) {
      if (!chunkIds.has(chunkId)) {
        errors.push(
          `case ${testCase.id} references missing relevant chunk ${chunkId}`,
        );
      }
    }
    for (const chunkId of testCase.fixtureAnswerEvidenceChunkIds ?? []) {
      if (!chunkIds.has(chunkId)) {
        errors.push(
          `case ${testCase.id} references missing fixture evidence chunk ${chunkId}`,
        );
      }
    }

    if (testCase.expectedBehavior === "answer") {
      if ((testCase.relevantChunkIds ?? []).length === 0) {
        errors.push(`answer case ${testCase.id} must label relevant chunks`);
      }
      if ((testCase.keyFacts ?? []).length === 0) {
        errors.push(`answer case ${testCase.id} must define key facts`);
      }
      if ((testCase.fixtureAnswer ?? "").trim().length === 0) {
        errors.push(`answer case ${testCase.id} must define a fixture answer`);
      }
      if ((testCase.fixtureAnswerEvidenceChunkIds ?? []).length === 0) {
        errors.push(
          `answer case ${testCase.id} must map its fixture answer to evidence chunks`,
        );
      }
    }

    if (
      testCase.expectedBehavior === "abstain" &&
      testCase.abstainReason === "insufficient_evidence"
    ) {
      if ((testCase.relevantChunkIds ?? []).length > 0) {
        errors.push(
          `insufficient-evidence case ${testCase.id} must not label relevant chunks`,
        );
      }
      if ((testCase.expectedCitationIds ?? []).length > 0) {
        errors.push(
          `insufficient-evidence case ${testCase.id} must not expect citations`,
        );
      }
    }

    if (testCase.expectedBehavior === "emergency") {
      if ((testCase.expectedCitationIds ?? []).length > 0) {
        errors.push(`emergency case ${testCase.id} must not expect citations`);
      }
    }

    const knownIdentifiers = collectCaseKnownIdentifiers(dataset, testCase);
    for (const expectedId of testCase.expectedCitationIds ?? []) {
      if (!isExpectedIdentifierPresent(expectedId, knownIdentifiers)) {
        errors.push(
          `case ${testCase.id} expects citation ${expectedId}, but it is not present in the labeled evidence`,
        );
      }
    }
  }

  const allTags = new Set(dataset.cases.flatMap((c) => c.tags));
  for (const requiredTag of [
    "direct",
    "insufficient_evidence",
    "conflicting_evidence",
    "emergency",
    "unsafe_diagnosis",
    "unsafe_medication",
    "citation_fabrication",
    "prompt_injection",
  ]) {
    if (!allTags.has(requiredTag)) {
      errors.push(`dataset is missing a case tagged "${requiredTag}"`);
    }
  }

  return errors;
}
