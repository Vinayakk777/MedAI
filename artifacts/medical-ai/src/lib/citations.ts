/**
 * Citation helpers for the chat UI.
 *
 * The backend appends a deterministic "Sources used" markdown footer to
 * grounded answers (see `artifacts/api-server/src/lib/rag/citationFooter.ts`).
 * The footer is the existing, persisted citation contract, so the UI parses it
 * instead of inventing a second source shape. Only metadata that actually
 * appears in the footer is surfaced; nothing is fabricated.
 */

export type SourceKind = "shared" | "attachment";

export interface SourceReference {
  /** Stable key for React lists. */
  key: string;
  /** 1-based position in the footer. */
  index: number;
  kind: SourceKind;
  title: string;
  journal?: string;
  publicationYear?: number;
  pages: number[];
  pmcid?: string;
  /** Only a URL present in the footer, or the user's own attachment URL. */
  url?: string;
}

export interface ParsedCitationFooter {
  /** The answer text with the markdown footer removed. */
  body: string;
  sources: SourceReference[];
  /** The safety/basis sentence from the footer, without markdown asterisks. */
  basis?: string;
  hadFooter: boolean;
}

export interface CitationAttachment {
  name: string;
  url: string;
}

const FOOTER_HEADER = "**Sources used:**";

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanTitle(value: string): string {
  return normaliseWhitespace(
    value
      .replace(/^[\s—–,;|]+/, "")
      .replace(/[\s—–,;|]+$/, ""),
  );
}

function parsePages(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((page) => Number.isFinite(page) && page > 0);
}

/** Only public web links and same-origin paths are rendered as links. */
export function safeSourceHref(url?: string): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  return undefined;
}

export function sourceTypeLabel(kind: SourceKind): string {
  return kind === "attachment" ? "Your attachment" : "Shared medical source";
}

export function formatPageLabel(pages: number[]): string | undefined {
  if (pages.length === 0) return undefined;
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  return sorted.length === 1 ? `Page ${sorted[0]}` : `Pages ${sorted.join(", ")}`;
}

function parseSourceLine(
  line: string,
  index: number,
  attachments: CitationAttachment[],
): SourceReference | null {
  const match = line.match(/^\s*(\d+)\.\s+(.*)$/);
  if (!match) return null;

  const footerIndex = Number.parseInt(match[1], 10) || index;
  let remaining = match[2].trim();

  const urlMatch = remaining.match(/https?:\/\/[^\s)]+/i);
  const footerUrl = urlMatch?.[0]?.replace(/[.,;]+$/, "");
  if (urlMatch) remaining = remaining.replace(urlMatch[0], " ");

  const pmcidMatch = remaining.match(/PMCID:\s*([A-Za-z0-9]+)/i);
  const pmcid = pmcidMatch?.[1];
  if (pmcidMatch) remaining = remaining.replace(pmcidMatch[0], " ");

  const pageMatch = remaining.match(/\bpages?\s+([0-9][0-9,\s]*)/i);
  const pages = pageMatch ? parsePages(pageMatch[1]) : [];
  if (pageMatch) remaining = remaining.replace(pageMatch[0], " ");

  const yearMatch = remaining.match(/\((\d{4})\)/);
  const publicationYear = yearMatch ? Number.parseInt(yearMatch[1], 10) : undefined;
  if (yearMatch) remaining = remaining.replace(yearMatch[0], " ");

  const journalMatch = remaining.match(/\*([^*]+)\*/);
  const journal = journalMatch ? normaliseWhitespace(journalMatch[1]) : undefined;
  if (journalMatch) remaining = remaining.replace(journalMatch[0], " ");

  // The footer joins metadata with an em dash. A title containing an em dash
  // is not expected, and the first segment is the documented title slot.
  const segments = remaining
    .split(/\s+[—–]\s+/)
    .map((segment) => cleanTitle(segment))
    .filter(Boolean);
  const parsedTitle = segments[0] ?? cleanTitle(remaining);

  const attachment = attachments.find(
    (candidate) => candidate.name.toLowerCase() === parsedTitle.toLowerCase(),
  );
  const kind: SourceKind = attachment ? "attachment" : "shared";
  const title =
    parsedTitle ||
    (kind === "attachment" ? "Attached document" : "Medical source");

  return {
    key: `${kind}:${footerIndex}:${title}:${pages.join(",")}`,
    index: footerIndex,
    kind,
    title,
    ...(journal ? { journal } : {}),
    ...(publicationYear ? { publicationYear } : {}),
    pages,
    ...(pmcid ? { pmcid } : {}),
    ...(safeSourceHref(attachment?.url ?? footerUrl)
      ? { url: safeSourceHref(attachment?.url ?? footerUrl) }
      : {}),
  };
}

/**
 * Splits the answer body from the backend citation footer and turns each
 * footer line into a source reference. If the header is present but no source
 * line can be parsed, the original content is returned unchanged.
 */
export function parseCitationFooter(
  content: string,
  attachments: CitationAttachment[] = [],
): ParsedCitationFooter {
  const noFooter: ParsedCitationFooter = {
    body: content,
    sources: [],
    hadFooter: false,
  };

  const headerIndex = content.lastIndexOf(FOOTER_HEADER);
  if (headerIndex === -1) return noFooter;

  const beforeHeader = content.slice(0, headerIndex);
  const separatorMatch = beforeHeader.match(/(?:\r?\n)[ \t]*-{3,}[ \t]*\s*$/);
  if (!separatorMatch || separatorMatch.index === undefined) return noFooter;

  const footer = content.slice(headerIndex + FOOTER_HEADER.length);
  const basisMatch = footer.match(
    /\*([^*]*This response was grounded in [^*]*)\*/i,
  );
  const basis = basisMatch ? normaliseWhitespace(basisMatch[1]) : undefined;

  const sources: SourceReference[] = [];
  for (const line of footer.split(/\r?\n/)) {
    const source = parseSourceLine(line, sources.length + 1, attachments);
    if (source) sources.push(source);
  }

  if (sources.length === 0) return noFooter;

  return {
    body: beforeHeader.slice(0, separatorMatch.index).replace(/\s+$/, ""),
    sources,
    ...(basis ? { basis } : {}),
    hadFooter: true,
  };
}
