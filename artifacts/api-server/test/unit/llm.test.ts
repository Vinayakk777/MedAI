import { beforeEach, describe, expect, it, vi } from "vitest";

// The real module constructs an OpenAI client. We replace the constructor so
// every provider call is a deterministic in-process mock: no network, no key.
const provider = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: provider.create } };
    embeddings = { create: vi.fn() };
  },
}));

import { getModelConfig, llm } from "../../src/lib/llm";

function completion(content: string | null, usage = true) {
  return {
    choices: [{ message: { content } }],
    usage: usage
      ? { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
      : undefined,
  };
}

async function* streamOf(chunks: any[]) {
  for (const chunk of chunks) yield chunk;
}

describe("llm.generateJSON", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    provider.create.mockReset();
  });

  it("returns parsed JSON and normalised token usage", async () => {
    provider.create.mockResolvedValue(completion('{"answer":"ok"}'));

    const result = await llm.generateJSON<{ answer: string }>({
      systemPrompt: "system",
      userContent: "user",
    });

    expect(result.data).toEqual({ answer: "ok" });
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });
    expect(provider.create).toHaveBeenCalledOnce();

    const [request, options] = provider.create.mock.calls[0];
    expect(request.response_format).toEqual({ type: "json_object" });
    expect(request.temperature).toBe(0.3);
    expect(request.max_tokens).toBe(2048);
    expect(options).toEqual({ signal: undefined });
  });

  it("returns null data for invalid JSON instead of throwing", async () => {
    provider.create.mockResolvedValue(completion("this is not json"));

    const result = await llm.generateJSON({ systemPrompt: "s", userContent: "u" });

    expect(result.data).toBeNull();
    expect(result.usage).toBeUndefined();
  });

  it("returns null data when the provider rejects", async () => {
    provider.create.mockRejectedValue(new Error("provider unavailable"));

    const result = await llm.generateJSON({ systemPrompt: "s", userContent: "u" });

    expect(result.data).toBeNull();
  });

  it("returns null data for an empty completion", async () => {
    provider.create.mockResolvedValue(completion(null));

    const result = await llm.generateJSON({ systemPrompt: "s", userContent: "u" });

    expect(result.data).toBeNull();
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });
  });

  it("honours caller-supplied model, temperature and maxTokens", async () => {
    provider.create.mockResolvedValue(completion("{}"));

    await llm.generateJSON({
      systemPrompt: "s",
      userContent: "u",
      model: "custom-json-model",
      temperature: 0,
      maxTokens: 64,
    });

    const [request] = provider.create.mock.calls[0];
    expect(request.model).toBe("custom-json-model");
    expect(request.temperature).toBe(0);
    expect(request.max_tokens).toBe(64);
  });

  it("throws when no provider key is configured (client creation is outside the try)", async () => {
    delete process.env.GROQ_API_KEY;

    await expect(llm.generateJSON({ systemPrompt: "s", userContent: "u" })).rejects.toThrow(
      "GROQ_API_KEY is not set",
    );
    expect(provider.create).not.toHaveBeenCalled();
  });
});

describe("llm.generateText", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    provider.create.mockReset();
  });

  it("returns text and usage", async () => {
    provider.create.mockResolvedValue(completion("A normal heart rate is 60-100 bpm."));

    const result = await llm.generateText({ systemPrompt: "s", userContent: "u" });

    expect(result.data).toBe("A normal heart rate is 60-100 bpm.");
    expect(result.usage?.totalTokens).toBe(18);
    const [request] = provider.create.mock.calls[0];
    expect(request.temperature).toBe(0.5);
    expect(request.response_format).toBeUndefined();
  });

  it("returns null data when the provider rejects", async () => {
    provider.create.mockRejectedValue(new Error("timeout"));

    const result = await llm.generateText({ systemPrompt: "s", userContent: "u" });

    expect(result.data).toBeNull();
  });

  it("returns null data when the completion has no content", async () => {
    provider.create.mockResolvedValue(completion(null));

    const result = await llm.generateText({ systemPrompt: "s", userContent: "u" });

    expect(result.data).toBeNull();
  });
});

describe("llm.streamChat", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    provider.create.mockReset();
  });

  it("emits each delta, then the full text and final usage", async () => {
    provider.create.mockResolvedValue(
      streamOf([
        { choices: [{ delta: { content: "Hello " } }] },
        { choices: [{ delta: {} }] },
        { choices: [{ delta: { content: "world" } }] },
        {
          choices: [{ delta: {} }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
        },
      ]),
    );

    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await llm.streamChat({
      systemPrompt: "system",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      model: "test-model",
      callbacks: { onChunk, onDone, onError },
    });

    expect(onChunk.mock.calls.map((c) => c[0].content)).toEqual(["Hello ", "world"]);
    expect(onDone).toHaveBeenCalledWith("Hello world", {
      promptTokens: 3,
      completionTokens: 2,
      totalTokens: 5,
    });
    expect(onError).not.toHaveBeenCalled();

    const [request] = provider.create.mock.calls[0];
    expect(request.stream).toBe(true);
    expect(request.stream_options).toEqual({ include_usage: true });
    expect(request.messages[0]).toEqual({ role: "system", content: "system" });
  });

  it("propagates provider failures and does not call onError (current behaviour)", async () => {
    provider.create.mockRejectedValue(new Error("stream reset"));

    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await expect(
      llm.streamChat({
        systemPrompt: "s",
        messages: [{ role: "user", content: "hi" }],
        model: "m",
        callbacks: { onChunk, onDone, onError },
      }),
    ).rejects.toThrow("stream reset");

    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
  });
});

describe("llm.generateStructured", () => {
  const params = {
    systemPrompt: "system",
    messages: [{ role: "user" as const, content: "hi" }],
    model: "test-model",
    schemaName: "medai_answer_v1",
    jsonSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
  };

  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
    provider.create.mockReset();
  });

  it("requests strict JSON-schema output and parses the payload", async () => {
    provider.create.mockResolvedValue(
      completion('{"status":"answered","answer":"ok","citationRefs":[]}'),
    );

    const result = await llm.generateStructured(params);

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ status: "answered", answer: "ok", citationRefs: [] });
    expect(result.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });

    const [request] = provider.create.mock.calls[0];
    expect(request.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "medai_answer_v1",
        strict: true,
        schema: params.jsonSchema,
      },
    });
    expect(request.messages[0]).toEqual({ role: "system", content: "system" });
    expect(request.temperature).toBe(0.3);
    expect(request.max_tokens).toBe(8192);
  });

  it("uses portable JSON-object mode when requested", async () => {
    provider.create.mockResolvedValue(completion('{"ok":true}'));

    const result = await llm.generateStructured({ ...params, mode: "json_object" });

    expect(result.data).toEqual({ ok: true });
    const [request] = provider.create.mock.calls[0];
    expect(request.response_format).toEqual({ type: "json_object" });
  });

  it("retries in JSON-object mode when the provider rejects the schema", async () => {
    const unsupported = Object.assign(new Error("response_format json_schema is not supported"), {
      status: 400,
    });
    provider.create
      .mockRejectedValueOnce(unsupported)
      .mockResolvedValueOnce(completion('{"status":"answered","answer":"ok","citationRefs":[]}'));

    const result = await llm.generateStructured(params);

    expect(result.error).toBeUndefined();
    expect(provider.create).toHaveBeenCalledTimes(2);
    expect(provider.create.mock.calls[1][0].response_format).toEqual({ type: "json_object" });
  });

  it("does not retry unrelated provider errors", async () => {
    provider.create.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));

    const result = await llm.generateStructured(params);

    expect(result.data).toBeNull();
    expect(result.error).toBe("provider_error");
    expect(provider.create).toHaveBeenCalledOnce();
  });

  it("reports invalid JSON without exposing the raw payload", async () => {
    provider.create.mockResolvedValue(completion("not json"));

    const result = await llm.generateStructured(params);

    expect(result.data).toBeNull();
    expect(result.error).toBe("invalid_json");
    expect(JSON.stringify(result)).not.toContain("not json");
  });

  it("reports empty content", async () => {
    provider.create.mockResolvedValue(completion(null));

    const result = await llm.generateStructured(params);

    expect(result.data).toBeNull();
    expect(result.error).toBe("empty_content");
  });

  it("reports aborts as provider timeouts", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await llm.generateStructured({ ...params, signal: controller.signal });

    expect(result.data).toBeNull();
    expect(result.error).toBe("provider_timeout");
  });

  it("returns a coarse provider error without leaking the provider message", async () => {
    provider.create.mockRejectedValue(new Error("secret upstream detail"));

    const result = await llm.generateStructured(params);

    expect(result.data).toBeNull();
    expect(result.error).toBe("provider_error");
    expect(JSON.stringify(result)).not.toContain("secret upstream detail");
  });
});

describe("model configuration", () => {
  it("returns stable model identifiers for each task", () => {
    expect(getModelConfig()).toEqual({
      chatModel: "openai/gpt-oss-120b",
      visionModel: "qwen/qwen3.6-27b",
      jsonModel: "openai/gpt-oss-20b",
    });
  });

  it("reports no primary provider when no keys are present in the test environment", () => {
    // `llm.primary` is computed at module load; the test setup removes keys.
    expect(llm.primary).toBeNull();
  });
});
