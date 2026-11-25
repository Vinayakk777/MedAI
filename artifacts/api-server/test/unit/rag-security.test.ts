import { beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ mock: null as any }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../helpers/drizzleMock"));

import { RagCache, ragCache } from "../../src/lib/rag/cache";
import { PgVectorStore } from "../../src/lib/rag/vector-store/pgVectorStore";
import type { RagResponse } from "../../src/lib/rag/types";

const fake = () => dbHolder.mock.db.__fake;

function response(query: string): RagResponse {
  return {
    query,
    hasEvidence: false,
    evidenceGroups: [],
    citations: [],
    summary: "",
    pipelineStage: "general",
    latencyMs: 0,
    wasFallback: false,
  };
}

beforeEach(() => {
  fake().clear();
  ragCache.invalidate();
});

describe("RAG cache scoping", () => {
  it("does not serve a cached response across owner scopes", () => {
    const cache = new RagCache();
    cache.set("hypertension guidance", response("hypertension guidance"), "diagnosis", undefined, "u:user-a");

    expect(cache.get("hypertension guidance", "diagnosis", "u:user-a")).toBeDefined();
    expect(cache.get("hypertension guidance", "diagnosis", "u:user-b")).toBeUndefined();
  });

  it("does not serve a cached response across filter scopes", () => {
    const cache = new RagCache();
    const filterA = "f:[{\"field\":\"sourceId\",\"operator\":\"eq\",\"value\":\"a\"}]";
    const filterB = "f:[{\"field\":\"sourceId\",\"operator\":\"eq\",\"value\":\"b\"}]";

    cache.set("hypertension guidance", response("hypertension guidance"), "diagnosis", undefined, filterA);

    expect(cache.get("hypertension guidance", "diagnosis", filterB)).toBeUndefined();
  });

  it("still invalidates every scope for a pipeline stage", () => {
    const cache = new RagCache();
    cache.set("q", response("q"), "diagnosis", undefined, "u:user-a");
    cache.set("q", response("q"), "diagnosis", undefined, "u:user-b");

    cache.invalidate("diagnosis");

    expect(cache.get("q", "diagnosis", "u:user-a")).toBeUndefined();
    expect(cache.get("q", "diagnosis", "u:user-b")).toBeUndefined();
  });
});

describe("PgVectorStore degraded retrieval", () => {
  it("returns no evidence when the vector query fails instead of arbitrary scored rows", async () => {
    fake().seed("documentChunks", {
      id: "chunk-1",
      documentId: "doc-1",
      content: "unrelated content",
      index: 0,
    });
    fake().failNext("execute", undefined, new Error("pgvector unavailable"));

    const results = await new PgVectorStore().search({
      embedding: [0.1, 0.2],
      topK: 5,
    });

    expect(results).toEqual([]);
  });
});
