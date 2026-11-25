import type { CitationEvidence } from "../rag/types";

/**
 * Citation identifiers are only trustworthy when they can be traced back to
 * evidence that was actually retrieved for this request. This validator is a
 * deterministic gate: it does not try to judge prose, it checks identifiers.
 */

export interface CitationValidationResult {
  valid: boolean;
  citations: CitationEvidence[];
  issues: string[];
}

const PMCID_PATTERN = /\bPMC\s*(\d{3,})\b/gi;
const PMID_PATTERN = /\bPMID\s*:?\s*(\d{3,})\b/gi;
const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s)\]>"']+)/gi;
const URL_PATTERN = /\bhttps?:\/\/[^\s)\]>"']+/gi;

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/, "")
    .replace(/\/+$/, "");
}

function collectKnownIdentifiers(citations: CitationEvidence[]): Set<string> {
  const known = new Set<string>();
  const evidence: string[] = [];

  for (const citation of citations) {
    if (citation.chunkId) known.add(normalize(citation.chunkId));
    if (citation.documentId) known.add(normalize(citation.documentId));
    if (citation.pmcid) known.add(normalize(citation.pmcid));
    if (citation.sourceUrl) known.add(normalize(citation.sourceUrl));
    if (citation.evidenceText) evidence.push(citation.evidenceText);
  }

  // Identifiers can also legitimately appear inside the retrieved evidence
  // itself (for example a PubMed abstract that includes its own PMID/DOI).
  const combined = evidence.join("\n");
  for (const match of combined.matchAll(PMCID_PATTERN)) {
    known.add(normalize(`PMC${match[1]}`));
  }
  for (const match of combined.matchAll(PMID_PATTERN)) {
    known.add(normalize(`PMID${match[1]}`));
  }
  for (const match of combined.matchAll(DOI_PATTERN)) {
    known.add(normalize(match[1]));
  }
  for (const match of combined.matchAll(URL_PATTERN)) {
    known.add(normalize(match[0]));
  }

  return known;
}

export interface CitationReference {
  kind: string;
  value: string;
  raw: string;
}

export function extractCitationReferences(
  responseText: string,
): CitationReference[] {
  const references: CitationReference[] = [];

  for (const match of responseText.matchAll(PMCID_PATTERN)) {
    references.push({
      kind: "pmcid",
      value: normalize(`PMC${match[1]}`),
      raw: match[0],
    });
  }
  for (const match of responseText.matchAll(PMID_PATTERN)) {
    references.push({
      kind: "pmid",
      value: normalize(`PMID${match[1]}`),
      raw: match[0],
    });
  }
  for (const match of responseText.matchAll(DOI_PATTERN)) {
    references.push({
      kind: "doi",
      value: normalize(match[1]),
      raw: match[0],
    });
  }
  for (const match of responseText.matchAll(URL_PATTERN)) {
    references.push({
      kind: "url",
      value: normalize(match[0]),
      raw: match[0],
    });
  }

  return references;
}

function isUsableCitation(citation: CitationEvidence): boolean {
  return Boolean(
    citation &&
      typeof citation.chunkId === "string" &&
      citation.chunkId.length > 0 &&
      typeof citation.documentId === "string" &&
      citation.documentId.length > 0 &&
      typeof citation.organization === "string" &&
      citation.organization.length > 0 &&
      typeof citation.evidenceText === "string" &&
      citation.evidenceText.trim().length > 0,
  );
}

/**
 * Validate citation identifiers in `responseText` against the citations that
 * were actually retrieved. Any identifier that cannot be traced is treated as
 * a fabricated citation and invalidates the response.
 */
export function validateCitations(
  responseText: string,
  citations: CitationEvidence[],
): CitationValidationResult {
  const issues: string[] = [];
  const usable: CitationEvidence[] = [];

  for (const citation of citations) {
    if (isUsableCitation(citation)) {
      usable.push(citation);
    } else {
      issues.push("citation_missing_required_metadata");
    }
  }

  const known = collectKnownIdentifiers(usable);
  const references = extractCitationReferences(responseText);

  for (const reference of references) {
    if (!known.has(reference.value)) {
      issues.push(`unverified_citation_identifier:${reference.raw}`);
    }
  }

  return {
    valid: issues.length === 0,
    citations: usable,
    issues,
  };
}
