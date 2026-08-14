import { CacheEntry, RagResponse } from "./types";

export class RagCache {
  private cache: Map<string, CacheEntry<RagResponse>>;
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  key(query: string, pipelineStage?: string): string {
    const normalized = query.toLowerCase().replace(/\s+/g, " ").trim();
    return pipelineStage ? `${pipelineStage}::${normalized}` : normalized;
  }

  get(query: string, pipelineStage?: string): RagResponse | undefined {
    const k = this.key(query, pipelineStage);
    const entry = this.cache.get(k);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(k);
      return undefined;
    }
    entry.hitCount++;
    return entry.data;
  }

  set(query: string, data: RagResponse, pipelineStage?: string, ttlMs?: number): void {
    const k = this.key(query, pipelineStage);
    this.cache.set(k, {
      key: k,
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      hitCount: 0,
    });

    // Evict oldest entries if cache is too large
    if (this.cache.size > 1000) {
      const entries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.expiresAt - b.expiresAt);
      const toDelete = entries.slice(0, 200);
      for (const [key] of toDelete) {
        this.cache.delete(key);
      }
    }
  }

  invalidate(stage?: string): void {
    if (stage) {
      for (const [key] of this.cache) {
        if (key.startsWith(`${stage}::`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  stats(): { size: number; hitRate: number; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
    }
    return {
      size: this.cache.size,
      hitRate: this.cache.size > 0 ? totalHits / (totalHits + this.cache.size * 0.1) : 0,
      totalHits,
    };
  }
}

// Singleton cache instance
export const ragCache = new RagCache();
