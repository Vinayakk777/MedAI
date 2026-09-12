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

export const llm = {
  generateJSON,
  generateText,
  streamChat,
};
