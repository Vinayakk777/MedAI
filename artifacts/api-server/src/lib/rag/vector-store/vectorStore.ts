import { VectorStore, VectorSearchQuery, VectorSearchResult } from "../types";

export abstract class BaseVectorStore implements VectorStore {
  abstract readonly name: string;
  abstract ensureCollection(): Promise<void>;
  abstract insertChunk(chunk: any, embedding: number[]): Promise<void>;
  abstract insertChunks(chunks: Array<{ chunk: any; embedding: number[] }>): Promise<void>;
  abstract search(query: VectorSearchQuery): Promise<VectorSearchResult[]>;
  abstract deleteChunk(chunkId: string): Promise<void>;
  abstract deleteDocumentChunks(documentId: string): Promise<void>;
  abstract count(): Promise<number>;
}
