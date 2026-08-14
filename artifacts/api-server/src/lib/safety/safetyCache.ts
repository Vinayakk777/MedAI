import { SafetyEvaluation } from "./types";

interface CacheEntry {
  evaluation: SafetyEvaluation;
  cachedAt: number;
  ttl: number;
}

export class SafetyCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  getKey(responseText: string, queryText: string): string {
    const normalized = (responseText + queryText)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const hash = this.simpleHash(normalized);
    return hash;
  }

  get(key: string): SafetyEvaluation | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.cachedAt > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.evaluation;
  }

  set(key: string, evaluation: SafetyEvaluation, ttlMs = 300_000): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.entries().next();
      if (oldest.value) {
        this.cache.delete(oldest.value[0]);
      }
    }

    this.cache.set(key, {
      evaluation,
      cachedAt: Date.now(),
      ttl: ttlMs,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `cache_${Math.abs(hash).toString(36)}`;
  }
}
