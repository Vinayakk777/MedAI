import { ChunkingStrategy, ChunkOptions, ChunkResult } from "../types";

// ─── Recursive Character Text Splitter ───

export class RecursiveCharacterChunker implements ChunkingStrategy {
  readonly name = "recursive_character";
  private readonly separators = ["\n\n", "\n", ". ", " ", ""];

  chunk(text: string, options?: ChunkOptions): ChunkResult[] {
    const maxSize = options?.maxChunkSize ?? 1000;
    const overlap = options?.chunkOverlap ?? 100;
    return this.splitText(text, maxSize, overlap);
  }

  private splitText(text: string, maxSize: number, overlap: number): ChunkResult[] {
    const chunks: ChunkResult[] = [];
    const sections = this.splitByHeadings(text);

    let currentChunk = "";
    let index = 0;

    for (const section of sections) {
      if (currentChunk.length + section.content.length <= maxSize) {
        currentChunk += (currentChunk ? "\n" : "") + section.content;
      } else {
        if (currentChunk) {
          chunks.push(this.createChunk(currentChunk, index++, section.heading));
        }
        currentChunk = section.content.length > maxSize
          ? this.forceSplit(section.content, maxSize, overlap, index, section.heading, chunks).joined
          : section.content;
        if (currentChunk.length > maxSize) {
          currentChunk = this.forceSplit(currentChunk, maxSize, overlap, index, section.heading, chunks).joined;
          index = this.forceSplit(currentChunk, maxSize, overlap, index, section.heading, chunks).nextIndex;
        }
      }
    }

    if (currentChunk) {
      chunks.push(this.createChunk(currentChunk, index++));
    }

    return chunks;
  }

  private createChunk(content: string, index: number, heading?: string): ChunkResult {
    return {
      content: content.trim(),
      index,
      heading,
      wordCount: content.split(/\s+/).filter(Boolean).length,
    };
  }

  private splitByHeadings(text: string): Array<{ content: string; heading?: string }> {
    const headingRegex = /^(#{1,6}\s+.+)$/gm;
    const sections: Array<{ content: string; heading?: string }> = [];
    let lastIndex = 0;
    let currentHeading: string | undefined;
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        sections.push({ content: text.slice(lastIndex, match.index).trim(), heading: currentHeading });
      }
      currentHeading = match[1].replace(/^#+\s+/, "");
      lastIndex = match.index;
    }

    if (lastIndex < text.length) {
      sections.push({ content: text.slice(lastIndex).trim(), heading: currentHeading });
    }

    return sections.length > 0 ? sections : [{ content: text }];
  }

  private forceSplit(
    text: string, maxSize: number, overlap: number,
    startIndex: number, heading: string | undefined,
    chunks: ChunkResult[],
  ): { joined: string; nextIndex: number } {
    let index = startIndex;
    const words = text.split(/\s+/);
    let i = 0;

    while (i < words.length) {
      const chunk = words.slice(i, i + maxSize).join(" ");
      chunks.push(this.createChunk(chunk, index++, heading));
      i += maxSize - overlap;
    }

    return { joined: "", nextIndex: index };
  }
}

// ─── Sentence-Based Chunker ───

export class SentenceChunker implements ChunkingStrategy {
  readonly name = "sentence";

  chunk(text: string, options?: ChunkOptions): ChunkResult[] {
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
    return {
      content: content.trim(),
      index,
      wordCount: content.split(/\s+/).filter(Boolean).length,
    };
  }
}

// ─── Section-Based Chunker (for guidelines with structured sections) ───

export class SectionChunker implements ChunkingStrategy {
  readonly name = "section";

  chunk(text: string, options?: ChunkOptions): ChunkResult[] {
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
            wordCount: sectionContent.split(/\s+/).filter(Boolean).length,
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
