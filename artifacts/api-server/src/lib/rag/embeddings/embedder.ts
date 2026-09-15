import OpenAI from "openai";
import { EmbeddingProvider } from "../types";
import { createHash } from "crypto";

// ─── Hugging Face Free Embedding Provider ───

export class HuggingFaceEmbedder implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions = 384;
  private apiUrl: string;

  constructor(params?: { model?: string }) {
    this.model = params?.model ?? "sentence-transformers/all-MiniLM-L6-v2";
    this.dimensions = 384;
    this.apiUrl = `https://api-inference.huggingface.co/pipeline/feature-extraction/${this.model}`;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const cleaned = text.replace(/\s+/g, " ").trim();
    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: cleaned }),
    });
    if (!response.ok) {
      throw new Error(`HuggingFace embedding failed: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    // HF returns flat array or array of arrays; normalize to number[]
    if (Array.isArray(data) && typeof data[0] === "number") return data;
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
    return [];
  }

  async generateEmbeddings(batch: string[]): Promise<number[][]> {
    const results: number[][] = [];
    // Process in small batches to avoid rate limits
    for (let i = 0; i < batch.length; i += 5) {
      const chunk = batch.slice(i, i + 5);
      const embeddings = await Promise.all(chunk.map((t) => this.generateEmbedding(t)));
      results.push(...embeddings);
      // Small delay between batches
      if (i + 5 < batch.length) await new Promise((r) => setTimeout(r, 200));
    }
    return results;
  }
}

// ─── OpenAI Embedding Provider ───

export class OpenAIEmbedder implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private client: OpenAI;

  constructor(params?: { model?: string; dimensions?: number; apiKey?: string }) {
    this.model = params?.model ?? "text-embedding-3-small";
    this.dimensions = params?.dimensions ?? 1536;
    this.client = new OpenAI({
      apiKey: params?.apiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const cleaned = text.replace(/\s+/g, " ").trim();
    const response = await this.client.embeddings.create({
      model: this.model,
      input: cleaned,
      dimensions: this.dimensions,
    });
    return response.data[0]?.embedding ?? [];
  }

  async generateEmbeddings(batch: string[]): Promise<number[][]> {
    const cleaned = batch.map((t) => t.replace(/\s+/g, " ").trim());
    const results: number[][] = [];

    for (let i = 0; i < cleaned.length; i += 2048) {
      const chunk = cleaned.slice(i, i + 2048);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: chunk,
        dimensions: this.dimensions,
      });
      for (const item of response.data) {
        results[item.index] = item.embedding;
      }
    }

    return results;
  }
}

// ─── Embedding Cache (deduplicates by hash) ───

export class CachedEmbedder implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private inner: EmbeddingProvider;
  private cache: Map<string, { embedding: number[]; expiresAt: number }>;

  constructor(inner: EmbeddingProvider, ttlMs: number = 3600000) {
    this.inner = inner;
    this.model = inner.model;
    this.dimensions = inner.dimensions;
    this.cache = new Map();
  }

  hash(text: string): string {
    return createHash("sha256").update(text).digest("hex");
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const key = this.hash(text);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.embedding;
    }
    const embedding = await this.inner.generateEmbedding(text);
    this.cache.set(key, { embedding, expiresAt: Date.now() + 3600000 });
    return embedding;
  }

  async generateEmbeddings(batch: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const uncached: Array<{ text: string; index: number }> = [];

    for (let i = 0; i < batch.length; i++) {
      const key = this.hash(batch[i]);
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        results[i] = cached.embedding;
      } else {
        uncached.push({ text: batch[i], index: i });
      }
    }

    if (uncached.length > 0) {
      const texts = uncached.map((u) => u.text);
      const embeddings = await this.inner.generateEmbeddings(texts);
      for (let j = 0; j < uncached.length; j++) {
        const embedding = embeddings[j];
        if (embedding) {
          results[uncached[j].index] = embedding;
          this.cache.set(this.hash(uncached[j].text), {
            embedding,
            expiresAt: Date.now() + 3600000,
          });
        }
      }
    }

    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// ─── Embedding Provider Registry ───

const embedderRegistry = new Map<string, EmbeddingProvider>();

export function registerEmbedder(name: string, embedder: EmbeddingProvider): void {
  embedderRegistry.set(name, embedder);
}

export function getEmbedder(name: string): EmbeddingProvider | undefined {
  return embedderRegistry.get(name);
}

export function createEmbedder(): EmbeddingProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const inner = new OpenAIEmbedder({ apiKey });
    return new CachedEmbedder(inner);
  }
  // Free fallback: Hugging Face Inference API (no API key needed)
  console.log("[embedder] No OPENAI_API_KEY found, using free HuggingFace embeddings (384-dim)");
  const inner = new HuggingFaceEmbedder();
  return new CachedEmbedder(inner);
}
