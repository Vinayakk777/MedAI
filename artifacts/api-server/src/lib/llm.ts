import OpenAI from "openai";

interface StreamCallbacks {
  onChunk: (chunk: { content: string }) => void;
  onDone: (fullText: string, usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
  onError: (err: unknown) => void;
}

interface StreamChatParams {
  systemPrompt: string;
  messages: Array<{ role: string; content: any }>;
  model: string;
  signal?: AbortSignal;
  callbacks: StreamCallbacks;
}

interface GenerateParams {
  systemPrompt: string;
  userContent: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

interface GenerateResult<T> {
  data: T | null;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface ModelConfig {
  chatModel: string;
  visionModel: string;
  jsonModel: string;
}

export type StructuredGenerationMode = "json_schema" | "json_object";

export interface StructuredGenerationParams {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: any }>;
  model: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  /**
   * `json_schema` asks the provider for constrained decoding (supported by the
   * configured GPT-OSS text models). `json_object` is the portable fallback for
   * models or endpoints without schema support; the caller still validates.
   */
  mode?: StructuredGenerationMode;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type StructuredGenerationErrorCode =
  | "provider_error"
  | "provider_timeout"
  | "invalid_json"
  | "empty_content";

export interface StructuredGenerationResult {
  data: unknown | null;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** Coarse failure code only. Provider messages are never propagated. */
  error?: StructuredGenerationErrorCode;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

function getClient(): OpenAI {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  return new OpenAI({ apiKey: key, baseURL: GROQ_BASE_URL });
}

function resolveModel(requested: string | undefined, fallback: string): string {
  return requested || fallback;
}

export function getModelConfig(): ModelConfig {
  return {
    chatModel: "openai/gpt-oss-120b",
    visionModel: "qwen/qwen3.6-27b",
    jsonModel: "openai/gpt-oss-20b",
  };
}

async function generateJSON<T>(params: GenerateParams): Promise<GenerateResult<T>> {
  const client = getClient();
  const model = resolveModel(params.model, getModelConfig().jsonModel);
  try {
    const result = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userContent },
        ],
        response_format: { type: "json_object" },
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 2048,
      },
      { signal: params.signal },
    );
    const raw = result.choices[0]?.message?.content;
    const usage = result.usage
      ? {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        }
      : undefined;
    return { data: raw ? (JSON.parse(raw) as T) : null, usage };
  } catch {
    return { data: null };
  }
}

async function generateText(params: GenerateParams): Promise<GenerateResult<string>> {
  const client = getClient();
  const model = resolveModel(params.model, getModelConfig().chatModel);
  try {
    const result = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userContent },
        ],
        temperature: params.temperature ?? 0.5,
        max_tokens: params.maxTokens ?? 2048,
      },
      { signal: params.signal },
    );
    const text = result.choices[0]?.message?.content ?? null;
    const usage = result.usage
      ? {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        }
      : undefined;
    return { data: text, usage };
  } catch {
    return { data: null };
  }
}

async function streamChat(params: StreamChatParams): Promise<void> {
  const client = getClient();
  const stream = await client.chat.completions.create(
    {
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        ...params.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
      stream: true,
      stream_options: { include_usage: true },
    },
    { signal: params.signal },
  );

  let fullText = "";
  let finalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      params.callbacks.onChunk({ content: delta });
    }
    if (chunk.usage) {
      finalUsage = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens,
      };
    }
  }

  params.callbacks.onDone(fullText, finalUsage);
}

function toUsage(
  usage:
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!isRecord(err)) return false;
  const name = typeof err.name === "string" ? err.name : "";
  const message = typeof err.message === "string" ? err.message : "";
  return /abort/i.test(name) || /abort|timeout|timed out/i.test(message);
}

function isUnsupportedResponseFormat(err: unknown): boolean {
  if (!isRecord(err)) return false;
  const status = typeof err.status === "number" ? err.status : undefined;
  if (status !== 400 && status !== 422) return false;
  const message = typeof err.message === "string" ? err.message : "";
  return /response_format|json_schema|json schema|structured/i.test(message);
}

interface CompletionLike {
  choices: Array<{ message?: { content?: string | null } | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * Non-streaming generation with a JSON response contract.
 *
 * Groq does not support streaming together with structured outputs, so this
 * call is buffered. The chat route already buffered model output before
 * delivery, so the SSE contract is unchanged. Failures are reduced to a coarse
 * code; raw provider errors never leave this function.
 */
async function generateStructured(
  params: StructuredGenerationParams,
): Promise<StructuredGenerationResult> {
  const requestedMode: StructuredGenerationMode = params.mode ?? "json_schema";
  if (params.signal?.aborted) {
    return { data: null, error: "provider_timeout" };
  }
  const messages = [
    { role: "system" as const, content: params.systemPrompt },
    ...params.messages,
  ];

  const call = async (mode: StructuredGenerationMode): Promise<CompletionLike> => {
    const client = getClient();
    return client.chat.completions.create(
      {
        model: params.model,
        messages,
        response_format:
          mode === "json_schema"
            ? {
                type: "json_schema" as const,
                json_schema: {
                  name: params.schemaName,
                  strict: true,
                  schema: params.jsonSchema,
                },
              }
            : { type: "json_object" as const },
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 8192,
      },
      { signal: params.signal },
    );
  };

  let completion: CompletionLike;
  try {
    try {
      completion = await call(requestedMode);
    } catch (err) {
      // A provider without constrained-decoding support rejects the request.
      // Retry once in portable JSON-object mode; the caller still validates.
      if (requestedMode === "json_schema" && isUnsupportedResponseFormat(err)) {
        completion = await call("json_object");
      } else {
        throw err;
      }
    }
  } catch (err) {
    return {
      data: null,
      error: isAbortError(err, params.signal) ? "provider_timeout" : "provider_error",
    };
  }

  if (!completion || !Array.isArray(completion.choices)) {
    return { data: null, error: "provider_error" };
  }

  const raw = completion.choices[0]?.message?.content;
  const usage = toUsage(completion.usage);
  if (!raw || raw.trim().length === 0) {
    return { data: null, usage, error: "empty_content" };
  }

  try {
    return { data: JSON.parse(raw), usage };
  } catch {
    return { data: null, usage, error: "invalid_json" };
  }
}

export const llm = {
  primary: process.env.GROQ_API_KEY ? { name: "groq" } : process.env.OPENAI_API_KEY ? { name: "openai" } : null,
  generateJSON,
  generateText,
  generateStructured,
  streamChat,
};
