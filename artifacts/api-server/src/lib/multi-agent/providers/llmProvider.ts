import OpenAI from "openai";
import { LLMProvider, LLMProviderConfig, LLMGenerateParams } from "../types";

// ─── Groq Provider ───

export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  readonly models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];
  private client: OpenAI | null;

  constructor(config?: LLMProviderConfig) {
    const key = config?.apiKey ?? process.env.GROQ_API_KEY;
    this.client = key
      ? new OpenAI({ apiKey: key, baseURL: config?.baseUrl ?? "https://api.groq.com/openai/v1" })
      : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generateJSON<T>(params: LLMGenerateParams): Promise<T | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.chat.completions.create({
        model: params.maxTokens && params.maxTokens > 4096 ? "openai/gpt-oss-120b" : "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userContent },
        ],
        response_format: { type: "json_object" },
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2048,
      }, { signal: params.signal });
      const raw = result.choices[0]?.message?.content;
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  }

  async generateText(params: LLMGenerateParams): Promise<string | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userContent },
        ],
        temperature: params.temperature ?? 0.5,
        max_tokens: params.maxTokens ?? 2048,
      }, { signal: params.signal });
      return result.choices[0]?.message?.content ?? null;
    } catch {
      return null;
    }
  }
}

// ─── OpenAI Provider ───

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly models = ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"];
  private client: OpenAI | null;

  constructor(config?: LLMProviderConfig) {
    this.client = config?.apiKey ?? process.env.OPENAI_API_KEY
      ? new OpenAI({
          apiKey: config?.apiKey ?? process.env.OPENAI_API_KEY,
          baseURL: config?.baseUrl,
        })
      : null;
  }

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async generateJSON<T>(params: LLMGenerateParams): Promise<T | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userContent },
        ],
        response_format: { type: "json_object" },
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2048,
      }, { signal: params.signal });
      const raw = result.choices[0]?.message?.content;
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  }

  async generateText(params: LLMGenerateParams): Promise<string | null> {
    if (!this.client) return null;
    try {
      const result = await this.client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userContent },
        ],
        temperature: params.temperature ?? 0.5,
        max_tokens: params.maxTokens ?? 2048,
      }, { signal: params.signal });
      return result.choices[0]?.message?.content ?? null;
    } catch {
      return null;
    }
  }
}

// ─── Provider Registry ───

const providerRegistry = new Map<string, LLMProvider>();

export function registerLLMProvider(provider: LLMProvider): void {
  providerRegistry.set(provider.name, provider);
}

export function getLLMProvider(name?: string): LLMProvider | undefined {
  if (name) return providerRegistry.get(name);
  // Return first available
  for (const p of providerRegistry.values()) {
    if (p.isAvailable()) return p;
  }
  return undefined;
}

export function getAvailableProviders(): LLMProvider[] {
  return Array.from(providerRegistry.values()).filter((p) => p.isAvailable());
}

// Register defaults
registerLLMProvider(new GroqProvider());
registerLLMProvider(new OpenAIProvider());
