import OpenAI from "openai";

const groqKey = process.env.GROQ_API_KEY;
const groqClient = groqKey
  ? new OpenAI({ apiKey: groqKey, baseURL: "https://api.groq.com/openai/v1" })
  : null;

const MODEL = "openai/gpt-oss-20b";

export interface JSONGenParams {
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function generateJSON<T>(params: JSONGenParams): Promise<T | null> {
  if (!groqClient) {
    console.error("[aiClient] GROQ_API_KEY not set");
    return null;
  }

  try {
    const result = await groqClient.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userContent },
        ],
        response_format: { type: "json_object" },
        temperature: params.temperature ?? 0.3,
        max_tokens: params.maxTokens ?? 1024,
      },
      { signal: params.signal },
    );

    const raw = result.choices[0]?.message?.content;
    if (!raw) return null;

    return JSON.parse(raw) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[aiClient] generation failed:", message);
    return null;
  }
}
