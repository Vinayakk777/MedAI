import { llm } from "./llm";

/**
 * AI Client — Backward-compatible wrapper
 *
 * MAINTAINS THE SAME `generateJSON` API that 16+ engines import.
 * Internally delegates to the new LLM provider abstraction.
 *
 * WHY A WRAPPER:
 * - Zero changes needed in 16+ engine files
 * - They still import `{ generateJSON } from "./aiClient"`
 * - The underlying implementation now has fallback + retry + token tracking
 *
 * MIGRATION PATH:
 * Engines can gradually migrate to import from `./llm` directly:
 *   import { llm } from "./llm";
 *   const result = await llm.generateJSON<T>({ ... });
 *   console.log(result.usage.totalTokens);
 *
 * For now, this wrapper preserves backward compatibility.
 */

export interface JSONGenParams {
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Generate structured JSON from the LLM.
 *
 * Delegates to the shared LLM client which handles:
 * - Provider selection (Groq → OpenAI fallback)
 * - Retry with exponential backoff
 * - Token usage tracking
 *
 * Returns T on success, null on failure (same contract as before).
 */
export async function generateJSON<T>(params: JSONGenParams): Promise<T | null> {
  const result = await llm.generateJSON<T>({
    systemPrompt: params.systemPrompt,
    userContent: params.userContent,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    signal: params.signal,
  });

  return result.data;
}
