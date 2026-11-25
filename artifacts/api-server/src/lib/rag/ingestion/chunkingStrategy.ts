import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChunkingStrategy, ChunkOptions, ChunkResult } from "../types";

/**
 * Text splitting is delegated to LangChain's `RecursiveCharacterTextSplitter`.
 *
 * MedAI keeps the `ChunkingStrategy` contract, the chunker registry and the
 * heading-aware section scanning, because chunk provenance (`heading`,
 * `section`, sequential index, word count) is part of the ingestion schema and
 * the citation contract. LangChain provides the actual recursive splitting,
 * overlap handling and separator strategy.
 */

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

function splitterOptions(maxChunkSize: number, chunkOverlap: number) {
  const chunkSize = Math.max(1, Math.floor(maxChunkSize));
  return {
    chunkSize,
    chunkOverlap: Math.min(
      Math.max(0, Math.floor(chunkOverlap)),
      Math.max(0, chunkSize - 1),
    ),
    keepSeparator: true,
  };
}

function countWords(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}

// ─── Recursive Character Text Splitter ───

export class RecursiveCharacterChunker implements ChunkingStrategy {
  readonly name = "recursive_character";

  async chunk(text: string, options?: ChunkOptions): Promise<ChunkResult[]> {
    const maxSize = options?.maxChunkSize ?? 1000;
    const overlap = options?.chunkOverlap ?? 100;
    const splitter = new RecursiveCharacterTextSplitter({
      ...splitterOptions(maxSize, overlap),
      separators: DEFAULT_SEPARATORS,
    });

    const chunks: ChunkResult[] = [];
    let pending = "";
    let pendingHeading: string | undefined;

    const flush = () => {
      if (pending.trim()) {
        chunks.push(this.createChunk(pending, chunks.length, pendingHeading));
      }
      pending = "";
      pendingHeading = undefined;
    };

    for (const section of this.splitByHeadings(text)) {
      const content = section.content.trim();
      if (!content) continue;

      // Merge consecutive short sections so headings stay attached to their
      // text, matching the previous chunker's behavior.
      if (pending && pending.length + content.length + 1 <= maxSize) {
        pending += `\n${content}`;
        continue;
      }

      flush();

      if (content.length <= maxSize) {
        pending = content;
        pendingHeading = section.heading;
        continue;
      }

      const pieces = await splitter.splitText(content);
      for (const piece of pieces) {
        if (!piece.trim()) continue;
        chunks.push(this.createChunk(piece, chunks.length, section.heading));
      }
    }

    flush();
    return chunks;
  }

  private createChunk(
    content: string,
    index: number,
    heading?: string,
  ): ChunkResult {
    const trimmed = content.trim();
    return {
      content: trimmed,
      index,
      heading,
      wordCount: countWords(trimmed),
    };
  }

  private splitByHeadings(
    text: string,
  ): Array<{ content: string; heading?: string }> {
    const headingRegex = /^(#{1,6}\s+.+)$/gm;
    const sections: Array<{ content: string; heading?: string }> = [];
    let lastIndex = 0;
    let currentHeading: string | undefined;
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        sections.push({
          content: text.slice(lastIndex, match.index).trim(),
          heading: currentHeading,
        });
      }
      currentHeading = match[1].replace(/^#+\s+/, "");
      lastIndex = match.index;
    }

    if (lastIndex < text.length) {
      sections.push({ content: text.slice(lastIndex).trim(), heading: currentHeading });
    }

    return sections.length > 0 ? sections : [{ content: text }];
  }
}

// ─── Sentence-Based Chunker ───

/**
 * Sentence-aware chunking stays custom on purpose.
 *
 * LangChain's text splitters split on literal separators and, with
 * `keepSeparator`, attach the separator to the *start* of the next piece
 * (`"First sentence"`, `". Second sentence"`). That would strip the terminal
 * punctuation from every chunk. MedAI keeps sentence segmentation so chunks end
 * on a complete sentence, which the ingestion contract and citation snippets
 * rely on.
 */
export class SentenceChunker implements ChunkingStrategy {
  readonly name = "sentence";

  async chunk(text: string, options?: ChunkOptions): Promise<ChunkResult[]> {
    const maxSize = options?.maxChunkSize ?? 1000;
    const overlap = options?.chunkOverlap ?? 50;
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    const chunks: ChunkResult[] = [];
    let current: string[] = [];
    let currentLen = 0;
    let index = 0;

    for (const sentence of sentences) {
      if (currentLen + sentence.length > maxSize && current.length > 0) {
        chunks.push(this.buildChunk(current.join(" "), index++));
        const overlapSentences = current.slice(-Math.ceil(overlap / 50));
        current = [...overlapSentences];
        currentLen = overlapSentences.join(" ").length;
      }
      current.push(sentence.trim());
      currentLen += sentence.length;
    }

    if (current.length > 0) {
      chunks.push(this.buildChunk(current.join(" "), index++));
    }

    return chunks;
  }

  private buildChunk(content: string, index: number): ChunkResult {
    const trimmed = content.trim();
    return {
      content: trimmed,
      index,
      wordCount: countWords(trimmed),
    };
  }
}

// ─── Section-Based Chunker (for guidelines with structured sections) ───

export class SectionChunker implements ChunkingStrategy {
  readonly name = "section";

  async chunk(text: string, options?: ChunkOptions): Promise<ChunkResult[]> {
    const headings = options?.sectionHeadings ?? [
      "Introduction", "Background", "Scope", "Recommendations",
      "Guidelines", "Clinical Practice", "Diagnosis", "Treatment",
      "Management", "Prevention", "Screening", "Follow-up",
      "Evidence", "References", "Appendix",
    ];

    const pattern = new RegExp(`^(?:${headings.join("|")})(?:\\s|:)`, "gim");
    const chunks: ChunkResult[] = [];
    let lastIndex = 0;
    let currentSection = "preamble";
    let index = 0;

    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = pattern.exec(line);
      if (match || i === lines.length - 1) {
        const sectionContent = lines.slice(lastIndex, i).join("\n").trim();
        if (sectionContent) {
          chunks.push({
            content: sectionContent,
            index: index++,
            section: currentSection,
            wordCount: countWords(sectionContent),
          });
        }
        currentSection = match ? match[1].toLowerCase() : currentSection;
        lastIndex = i;
      }
    }

    return chunks;
  }
}

// ─── Chunker Registry ───

const chunkerRegistry = new Map<string, ChunkingStrategy>();

export function registerChunker(chunker: ChunkingStrategy): void {
  chunkerRegistry.set(chunker.name, chunker);
}

export function getChunker(name: string): ChunkingStrategy | undefined {
  return chunkerRegistry.get(name);
}

export function getAllChunkers(): ChunkingStrategy[] {
  return Array.from(chunkerRegistry.values());
}

// Register defaults
registerChunker(new RecursiveCharacterChunker());
registerChunker(new SentenceChunker());
registerChunker(new SectionChunker());
