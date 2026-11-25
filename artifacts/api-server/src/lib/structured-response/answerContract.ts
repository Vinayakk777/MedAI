import type { CitationEvidence } from "../rag/types";
import { sanitizeUntrustedEvidence } from "../safety/untrustedEvidence";

/**
 * Structured chat-answer contract.
 *
 * The chat pipeline asks the provider for a single JSON object instead of free
 * text. That object is validated here at runtime before anything is rendered,
 * and its citation references are resolved against the evidence that was
 * actually retrieved for this request. Unknown references are rejected, so the
 * model cannot introduce a fabricated source through the structured channel.
 *
 * The final safety gate and citation validator remain authoritative: this
 * module only decides what candidate text may enter that gate.
 */

export const ANSWER_CONTRACT_NAME = "medai_answer_v1";

export const MAX_ANSWER_CHARS = 12_000;
export const MAX_CITATION_REFS = 24;

export type AnswerStatus = "answered" | "insufficient_evidence";

export interface AnswerContract {
  status: AnswerStatus;
  answer: string;
  citationRefs: string[];
}

/**
 * JSON Schema sent to the provider. Kept intentionally small: enums and plain
 * types only, every property required, and `additionalProperties: false`, so it
 * is valid for Groq's strict constrained-decoding mode.
 */
export const ANSWER_JSON_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["answered", "insufficient_evidence"],
    },
    answer: { type: "string" },
    citationRefs: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["status", "answer", "citationRefs"],
  additionalProperties: false,
} as const;

const CONTRACT_KEYS = ["status", "answer", "citationRefs"] as const;
const REF_PATTERN = /^E(?:[1-9][0-9]{0,2})$/;

export type AnswerContractParse =
  | { ok: true; value: AnswerContract }
  | { ok: false; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate an untrusted JSON payload against the contract. Any deviation is a
 * hard failure: the caller must take the safe fallback path rather than trying
 * to repair model output.
 */
export function parseAnswerContract(raw: unknown): AnswerContractParse {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not_an_object" };
  }

  const keys = Object.keys(raw);
  if (
    keys.length !== CONTRACT_KEYS.length ||
    keys.some((key) => !(CONTRACT_KEYS as readonly string[]).includes(key))
  ) {
    return { ok: false, reason: "unexpected_fields" };
  }

  const status = raw["status"];
  if (status !== "answered" && status !== "insufficient_evidence") {
    return { ok: false, reason: "invalid_status" };
  }

  const rawAnswer = raw["answer"];
  if (typeof rawAnswer !== "string") {
    return { ok: false, reason: "answer_not_string" };
  }
  const answer = rawAnswer.trim();
  if (answer.length === 0) {
    return { ok: false, reason: "answer_empty" };
  }
  if (answer.length > MAX_ANSWER_CHARS) {
    return { ok: false, reason: "answer_too_long" };
  }

  const rawRefs = raw["citationRefs"];
  if (!Array.isArray(rawRefs)) {
    return { ok: false, reason: "citation_refs_not_array" };
  }
  if (rawRefs.length > MAX_CITATION_REFS) {
    return { ok: false, reason: "too_many_citation_refs" };
  }

  const citationRefs: string[] = [];
  for (const rawRef of rawRefs) {
    if (typeof rawRef !== "string" || !REF_PATTERN.test(rawRef)) {
      return { ok: false, reason: "invalid_citation_ref" };
    }
    if (!citationRefs.includes(rawRef)) citationRefs.push(rawRef);
  }

  return {
    ok: true,
    value: { status, answer, citationRefs },
  };
}

export interface EvidenceReference {
  ref: string;
  citation: CitationEvidence;
}

export interface EvidenceRefBlock {
  block: string;
  references: EvidenceReference[];
}

function excerpt(text: string, max = 160): string {
  const clean = sanitizeUntrustedEvidence(text).text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Stable, short identifiers for the retrieved evidence. Short refs are used
 * instead of raw chunk IDs because models copy `E3` reliably and long UUIDs
 * unreliably; the mapping back to the chunk stays server-side.
 */
export function buildEvidenceRefBlock(citations: CitationEvidence[]): EvidenceRefBlock {
  const references: EvidenceReference[] = citations.map((citation, index) => ({
    ref: `E${index + 1}`,
    citation,
  }));

  if (references.length === 0) {
    return { block: "", references: [] };
  }

  const lines = references.map(({ ref, citation }) => {
    const parts: string[] = [];
    const label = citation.sourceName ?? citation.guidelineName ?? citation.organization;
    if (label) parts.push(sanitizeUntrustedEvidence(label).text);
    if (citation.journal) parts.push(sanitizeUntrustedEvidence(citation.journal).text);
    if (citation.pageNumber) parts.push(`page ${citation.pageNumber}`);
    if (citation.pmcid) parts.push(`PMCID ${citation.pmcid}`);
    const meta = parts.join(" | ");
    const snippet = excerpt(citation.evidenceText);
    return snippet ? `${ref}: ${meta} — ${snippet}` : `${ref}: ${meta}`;
  });

  return {
    block: ["[EVIDENCE REFERENCES]", ...lines, "[/EVIDENCE REFERENCES]"].join("\n"),
    references,
  };
}

export const STRUCTURED_ANSWER_INSTRUCTIONS = `## Structured response format (required)

Return one JSON object with exactly these fields and no others:

- "status": "answered" when you can answer safely, or "insufficient_evidence" when you cannot.
- "answer": the complete user-facing answer in Markdown. Do not add a "Sources used" section, citation list, or footer; the application renders verified sources.
- "citationRefs": identifiers from [EVIDENCE REFERENCES] that support the answer (for example ["E1", "E2"]). Use [] when no evidence is available or none of it supports the answer.

Rules:
- Never invent a reference identifier, source name, PMCID, PMID, DOI, or URL.
- Only cite identifiers listed in [EVIDENCE REFERENCES].
- If "status" is "insufficient_evidence", state briefly what information is missing and recommend professional care; "citationRefs" may be empty.
- Output JSON only. No Markdown fences, no commentary outside the object.`;

export interface ResolvedAnswer {
  ok: boolean;
  reason: string;
  status: AnswerStatus;
  text: string;
  /** Evidence-linked citations that may be rendered as the footer. */
  citations: CitationEvidence[];
}

/**
 * Resolve validated contract refs against retrieved evidence.
 *
 * - Unknown refs are a hard failure (fabricated citation).
 * - `insufficient_evidence` resolves to the model's explanation with no footer.
 * - An answered response with no refs keeps the previous behaviour of attaching
 *   the retrieved sources rather than silently dropping them.
 */
export function resolveAnswerContract(
  contract: AnswerContract,
  references: EvidenceReference[],
  retrieved: CitationEvidence[],
): ResolvedAnswer {
  const byRef = new Map(references.map((entry) => [entry.ref, entry.citation]));

  const selected: CitationEvidence[] = [];
  const seenChunks = new Set<string>();
  for (const ref of contract.citationRefs) {
    const citation = byRef.get(ref);
    if (!citation) {
      return {
        ok: false,
        reason: "unknown_citation_ref",
        status: contract.status,
        text: contract.answer,
        citations: [],
      };
    }
    if (!seenChunks.has(citation.chunkId)) {
      seenChunks.add(citation.chunkId);
      selected.push(citation);
    }
  }

  if (contract.status === "insufficient_evidence") {
    return {
      ok: true,
      reason: "insufficient_evidence",
      status: contract.status,
      text: contract.answer,
      citations: [],
    };
  }

  if (selected.length === 0 && retrieved.length > 0) {
    return {
      ok: true,
      reason: "answered_unlinked",
      status: contract.status,
      text: contract.answer,
      citations: retrieved,
    };
  }

  return {
    ok: true,
    reason: "answered",
    status: contract.status,
    text: contract.answer,
    citations: selected,
  };
}
