import { normalizeIdentifier } from "./dataset";

/**
 * Pure metric calculations for the RAG golden evaluation.
 *
 * Definitions are documented in `artifacts/api-server/eval/README.md`. All
 * functions return `null` when a case does not apply, so callers can exclude
 * it from the aggregate instead of silently counting it as zero.
 */

export type RouteBehavior = "answer" | "abstain" | "emergency";

export function mean(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

export function meanBoolean(
  values: Array<boolean | null | undefined>,
): number | null {
  return mean(values.map((value) => (value === null || value === undefined ? null : value ? 1 : 0)));
}

/** Fraction of labeled relevant chunks found in the top K retrieved chunks. */
export function recallAtK(
  retrievedChunkIds: string[],
  relevantChunkIds: string[],
  k: number,
): number | null {
  if (relevantChunkIds.length === 0) return null;
  if (k <= 0) return 0;
  const topK = new Set(retrievedChunkIds.slice(0, k));
  const hits = relevantChunkIds.filter((id) => topK.has(id)).length;
  return hits / relevantChunkIds.length;
}

/** Reciprocal rank of the first relevant chunk; 0 when none is retrieved. */
export function reciprocalRank(
  retrievedChunkIds: string[],
  relevantChunkIds: string[],
): number | null {
  if (relevantChunkIds.length === 0) return null;
  const relevant = new Set(relevantChunkIds);
  for (let index = 0; index < retrievedChunkIds.length; index++) {
    if (relevant.has(retrievedChunkIds[index])) return 1 / (index + 1);
  }
  return 0;
}

/**
 * Fraction of retrieved citations that point at labeled relevant chunks.
 * This measures retrieval/citation precision, not answer-level citation
 * validity.
 */
export function retrievalCitationPrecision(
  retrievedChunkIds: string[],
  relevantChunkIds: string[],
): number | null {
  if (retrievedChunkIds.length === 0) return null;
  const relevant = new Set(relevantChunkIds);
  const hits = retrievedChunkIds.filter((id) => relevant.has(id)).length;
  return hits / retrievedChunkIds.length;
}

/**
 * True when the delivered text contains at least one expected citation
 * identifier. Returns null when the case does not expect citations.
 */
export function citationCoverage(
  deliveredText: string,
  expectedCitationIds: string[],
): boolean | null {
  if (expectedCitationIds.length === 0) return null;
  const delivered = normalizeIdentifier(deliveredText);
  return expectedCitationIds.some((expected) =>
    delivered.includes(normalizeIdentifier(expected)),
  );
}

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenizeForSupport(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/**
 * Lexical support proxy: a fact is supported when it appears verbatim in the
 * evidence or when at least 80% of its tokens occur in the evidence.
 */
export function isFactSupported(
  fact: string,
  normalizedEvidence: string,
): boolean {
  const normalizedFact = normalizeText(fact);
  if (normalizedFact.length === 0) return false;
  if (normalizedEvidence.includes(normalizedFact)) return true;

  const factTokens = tokenizeForSupport(fact);
  if (factTokens.length === 0) return false;
  const evidenceTokens = new Set(tokenizeForSupport(normalizedEvidence));
  const overlap =
    factTokens.filter((token) => evidenceTokens.has(token)).length /
    factTokens.length;
  return overlap >= 0.8;
}

export interface FaithfulnessResult {
  factCoverage: number | null;
  supportedFactRate: number | null;
  supportedFacts: string[];
  unsupportedFacts: string[];
  missingFacts: string[];
}

/**
 * Answer faithfulness proxy.
 *
 * `factCoverage` is the fraction of expected key facts present in the
 * delivered answer. `supportedFactRate` is the fraction of those present facts
 * that are lexically supported by retrieved evidence. This is not entailment;
 * it is a deterministic, inspectable proxy.
 */
export function faithfulnessProxy(
  deliveredText: string,
  keyFacts: string[],
  evidenceTexts: string[],
): FaithfulnessResult {
  if (keyFacts.length === 0) {
    return {
      factCoverage: null,
      supportedFactRate: null,
      supportedFacts: [],
      unsupportedFacts: [],
      missingFacts: [],
    };
  }

  const answer = normalizeText(deliveredText);
  const evidence = normalizeText(evidenceTexts.join("\n"));

  const factsInAnswer = keyFacts.filter((fact) =>
    answer.includes(normalizeText(fact)),
  );
  const missingFacts = keyFacts.filter(
    (fact) => !answer.includes(normalizeText(fact)),
  );
  const supportedFacts = factsInAnswer.filter((fact) =>
    isFactSupported(fact, evidence),
  );
  const unsupportedFacts = factsInAnswer.filter(
    (fact) => !isFactSupported(fact, evidence),
  );

  return {
    factCoverage: factsInAnswer.length / keyFacts.length,
    supportedFactRate:
      factsInAnswer.length > 0
        ? supportedFacts.length / factsInAnswer.length
        : null,
    supportedFacts,
    unsupportedFacts,
    missingFacts,
  };
}

export function routeMatches(
  expected: RouteBehavior,
  actual: RouteBehavior,
): boolean {
  return expected === actual;
}

/**
 * Answer-level citation precision: fraction of identifier references in the
 * text that resolve to retrieved evidence. `invalidReferences` is the count of
 * `unverified_citation_identifier:` issues reported by the production
 * validator.
 */
export function answerCitationPrecision(
  referenceCount: number,
  invalidReferenceCount: number,
): number | null {
  if (referenceCount === 0) return null;
  return Math.max(0, referenceCount - invalidReferenceCount) / referenceCount;
}
