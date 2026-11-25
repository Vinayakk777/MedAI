import type { CitationEvidence } from "./types";

/**
 * Build the human-readable "Sources used" footer appended to grounded
 * responses. Shared by the chat route and the offline RAG evaluation so both
 * validate the exact same candidate text.
 */
export function buildCitationFooter(citations: CitationEvidence[]): string {
  if (citations.length === 0) return "";

  const byDocument = new Map<
    string,
    { citation: CitationEvidence; pages: Set<number> }
  >();
  for (const citation of citations) {
    let entry = byDocument.get(citation.documentId);
    if (!entry) {
      entry = { citation, pages: new Set<number>() };
      byDocument.set(citation.documentId, entry);
    }
    if (typeof citation.pageNumber === "number" && citation.pageNumber > 0) {
      entry.pages.add(citation.pageNumber);
    }
  }

  const footerLines: string[] = ["", "---", "**Sources used:**"];
  let idx = 1;
  for (const [, { citation, pages }] of byDocument) {
    const parts: string[] = [];
    const name = citation.sourceName ?? citation.guidelineName;
    if (name) parts.push(name);
    if (citation.journal) parts.push(`*${citation.journal}*`);
    if (citation.publicationDate) {
      parts.push(`(${new Date(citation.publicationDate).getFullYear()})`);
    }
    if (pages.size > 0) {
      const sorted = [...pages].sort((a, b) => a - b);
      parts.push(sorted.length === 1 ? `page ${sorted[0]}` : `pages ${sorted.join(", ")}`);
    }
    if (citation.pmcid) parts.push(`PMCID: ${citation.pmcid}`);
    if (citation.sourceUrl) parts.push(citation.sourceUrl);
    footerLines.push(`${idx}. ${parts.join(" — ")}`);
    idx++;
  }
  const hasAttachment = citations.some((citation) => citation.sourceType === "attachment");
  const hasSharedSource = citations.some((citation) => citation.sourceType !== "attachment");
  const basis = hasAttachment
    ? hasSharedSource
      ? "the attached document(s) and retrieved medical literature"
      : "the attached document(s)"
    : "retrieved medical literature";

  footerLines.push("");
  footerLines.push(
    `*This response was grounded in ${basis}. It is informational and is not a diagnosis or personalized medical advice.*`,
  );
  return footerLines.join("\n");
}
