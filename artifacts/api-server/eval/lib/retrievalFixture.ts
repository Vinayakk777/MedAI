import type {
  EmbeddingProvider,
  VectorSearchQuery,
  VectorSearchResult,
  VectorStore,
} from "../../src/lib/rag/types";
import type { GoldenChunk } from "./dataset";

/**
 * Deterministic fixtures for the external parts of the RAG pipeline.
 *
 * The real pipeline is still used: `RagEngine` -> `HybridSearchEngine` ->
 * reranker -> `ContextSelector` -> `CitationEngine`. Only the embedding
 * provider, vector store, PostgreSQL keyword query, LLM, and live PubMed
 * ingest are replaced with deterministic fixtures.
 */

const STOPWORDS = new Set([
  "the", "and", "for", "are", "with", "that", "this", "from", "have", "has",
  "was", "were", "will", "can", "may", "might", "should", "would", "could",
  "into", "their", "they", "them", "your", "you", "what", "when", "where",
  "which", "who", "how", "why", "not", "but", "also", "about", "after",
  "before", "during", "under", "over", "such", "other", "these", "those",
  "its", "it", "is", "of", "to", "in", "on", "at", "as", "by", "or", "an",
  "a", "be", "been", "being", "do", "does", "did", "done", "if", "then",
  "than", "there", "here", "we", "our", "us", "i", "me", "my", "he", "she",
  "his", "her", "they", "them", "their", "use", "used", "using",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

export function buildVocabulary(texts: string[]): Map<string, number> {
  const vocabulary = new Map<string, number>();
  for (const text of texts) {
    for (const token of tokenize(text)) {
      if (!vocabulary.has(token)) vocabulary.set(token, vocabulary.size);
    }
  }
  return vocabulary;
}

export function embedText(text: string, vocabulary: Map<string, number>): number[] {
  const vector = new Array<number>(vocabulary.size).fill(0);
  for (const token of tokenize(text)) {
    const index = vocabulary.get(token);
    if (index !== undefined) vector[index] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

export function createDeterministicEmbedder(
  vocabulary: Map<string, number>,
): EmbeddingProvider {
  return {
    model: "eval-deterministic-bag-of-words-v1",
    dimensions: vocabulary.size,
    async generateEmbedding(text: string): Promise<number[]> {
      return embedText(text, vocabulary);
    },
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
      return texts.map((text) => embedText(text, vocabulary));
    },
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let index = 0; index < length; index++) dot += a[index] * b[index];
  return dot;
}

export async function createFixtureVectorStore(
  chunks: GoldenChunk[],
  embedder: EmbeddingProvider,
): Promise<VectorStore> {
  const embeddings = await embedder.generateEmbeddings(
    chunks.map((chunk) => chunk.content),
  );
  const byChunkId = new Map(
    chunks.map((chunk, index) => [chunk.id, embeddings[index]]),
  );

  return {
    name: "eval-in-memory-vector-store",
    async ensureCollection(): Promise<void> {},
    async insertChunk(): Promise<void> {},
    async insertChunks(): Promise<void> {},
    async search(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
      const topK = query.topK ?? chunks.length;
      return chunks
        .map((chunk) => ({
          chunk,
          score: cosineSimilarity(
            query.embedding,
            byChunkId.get(chunk.id) ?? [],
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || a.chunk.id.localeCompare(b.chunk.id),
        )
        .slice(0, topK)
        .map((entry) => ({
          chunkId: entry.chunk.id,
          documentId: entry.chunk.documentId,
          sourceId: entry.chunk.sourceId,
          content: entry.chunk.content,
          contentPreview: entry.chunk.content.slice(0, 200),
          section: entry.chunk.section,
          heading: entry.chunk.heading,
          score: entry.score,
          metadata: entry.chunk.metadata,
        }));
    },
    async deleteChunk(): Promise<void> {},
    async deleteDocumentChunks(): Promise<void> {},
    async count(): Promise<number> {
      return chunks.length;
    },
  };
}

interface KeywordRow {
  id: string;
  document_id: string;
  source_id: string | null;
  content: string;
  content_preview: string;
  section: string | null;
  heading: string | null;
  metadata: Record<string, unknown>;
  rank: number;
}

/**
 * Stand-in for PostgreSQL full-text search. `HybridSearchEngine` issues a
 * `tsquery` through `db.execute`; this fixture parses the query terms and ranks
 * chunks by the fraction of terms they contain. The result shape matches the
 * real SQL row shape.
 */
export function installKeywordSearchFixture(
  db: any,
  chunks: GoldenChunk[],
): () => void {
  const originalExecute = db.execute;

  db.execute = async (query: any) => {
    if (query && query.op === "sql" && Array.isArray(query.values)) {
      const tsquery = query.values.find(
        (value: unknown): value is string =>
          typeof value === "string" && value.includes(":*"),
      );

      if (typeof tsquery === "string") {
        const terms = tsquery
          .split(" & ")
          .map((term) => term.replace(/:\*$/, "").toLowerCase())
          .filter(Boolean);
        const topKValue = query.values[query.values.length - 1];
        const topK = typeof topKValue === "number" ? topKValue : 10;

        const rows: KeywordRow[] = chunks
          .map((chunk) => {
            const content = chunk.content.toLowerCase();
            const matches = terms.filter((term) => content.includes(term)).length;
            return {
              chunk,
              rank: terms.length > 0 ? (matches / terms.length) * 10 : 0,
            };
          })
          .filter((entry) => entry.rank > 0)
          .sort(
            (a, b) =>
              b.rank - a.rank || a.chunk.id.localeCompare(b.chunk.id),
          )
          .slice(0, topK)
          .map(({ chunk, rank }) => ({
            id: chunk.id,
            document_id: chunk.documentId,
            source_id: chunk.sourceId ?? null,
            content: chunk.content,
            content_preview: chunk.content.slice(0, 200),
            section: chunk.section ?? null,
            heading: chunk.heading ?? null,
            metadata: chunk.metadata ?? {},
            rank,
          }));

        return { rows };
      }
    }

    return originalExecute(query);
  };

  return () => {
    db.execute = originalExecute;
  };
}
