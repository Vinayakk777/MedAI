import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ mock: null as any }));
const auth = vi.hoisted(() => ({ userId: "user-a" as string | null }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../helpers/drizzleMock"));

vi.mock("@clerk/express", () => ({
  getAuth: () => (auth.userId ? { userId: auth.userId } : null),
}));

import router from "../../src/routes/medical-documents";

const fake = () => dbHolder.mock.db.__fake;

function seedDocument(overrides: Record<string, any> = {}) {
  return fake().seed("docUploads", {
    id: "doc-1",
    userId: "user-a",
    documentType: "lab_report",
    status: "uploaded",
    fileName: "blood_test.pdf",
    fileSize: 1000,
    mimeType: "application/pdf",
    storagePath: "uploads/user-a/blood_test.pdf",
    title: "Blood test",
    description: "Routine panel",
    tags: [],
    isArchived: false,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  })[0];
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  app.use(router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: String(err) });
  });
  return app;
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

beforeEach(() => {
  fake().clear();
  auth.userId = "user-a";
});

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // leave as text
  }
  return { status: res.status, text, body };
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

describe("medical document authentication", () => {
  it("returns 401 when there is no authenticated user", async () => {
    auth.userId = null;

    const res = await request("/medical-documents");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });
});

describe("GET /medical-documents", () => {
  it("returns only the current user's active documents", async () => {
    seedDocument({ id: "a-active" });
    seedDocument({ id: "a-archived", isArchived: true });
    seedDocument({ id: "b-active", userId: "user-b" });

    const res = await request("/medical-documents");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.documents.map((d: any) => d.id)).toEqual(["a-active"]);
  });

  it("supports filters and pagination query parameters", async () => {
    seedDocument({ id: "lab", documentType: "lab_report", status: "uploaded" });
    seedDocument({
      id: "rx",
      documentType: "prescription",
      status: "analyzed",
      fileName: "rx.pdf",
    });

    const byType = await request("/medical-documents?type=prescription");
    expect(byType.body.documents.map((d: any) => d.id)).toEqual(["rx"]);

    const byStatus = await request("/medical-documents?status=uploaded");
    expect(byStatus.body.documents.map((d: any) => d.id)).toEqual(["lab"]);

    const paged = await request("/medical-documents?limit=1&offset=1");
    expect(paged.body.limit).toBe(1);
    expect(paged.body.offset).toBe(1);
    expect(paged.body.documents).toHaveLength(1);
  });

  it("returns a generic 500 when the database query fails", async () => {
    fake().failNext("select", "docUploads", new Error("db unavailable"));

    const res = await request("/medical-documents");

    expect(res.status).toBe(500);
    expect(res.body.error).toContain("db unavailable");
  });
});

describe("GET /medical-documents/:id", () => {
  it("returns the document to its owner", async () => {
    seedDocument({ id: "doc-1" });

    const res = await request("/medical-documents/doc-1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "doc-1", userId: "user-a" });
  });

  it("hides another user's document behind a 404", async () => {
    seedDocument({ id: "doc-b", userId: "user-b" });

    const res = await request("/medical-documents/doc-b");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("returns 404 for a missing document", async () => {
    const res = await request("/medical-documents/missing");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /medical-documents/:id", () => {
  it("soft-deletes an owned document", async () => {
    seedDocument({ id: "doc-1" });

    const res = await request("/medical-documents/doc-1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(fake().getRows("docUploads")[0].deletedAt).toBeInstanceOf(Date);
  });

  it("does not delete another user's document", async () => {
    seedDocument({ id: "doc-b", userId: "user-b" });

    const res = await request("/medical-documents/doc-b", { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(fake().getRows("docUploads")[0].deletedAt).toBeUndefined();
  });
});

describe("PATCH /medical-documents/:id", () => {
  it("archives and unarchives an owned document", async () => {
    seedDocument({ id: "doc-1", isArchived: false });

    const archived = await request(
      "/medical-documents/doc-1/archive",
      jsonRequest("PATCH", { archived: true }),
    );
    expect(archived.status).toBe(200);
    expect(fake().getRows("docUploads")[0].isArchived).toBe(true);

    const restored = await request(
      "/medical-documents/doc-1/archive",
      jsonRequest("PATCH", { archived: false }),
    );
    expect(restored.status).toBe(200);
    expect(fake().getRows("docUploads")[0].isArchived).toBe(false);
  });

  it("updates tags for an owned document", async () => {
    seedDocument({ id: "doc-1" });

    const res = await request(
      "/medical-documents/doc-1/tags",
      jsonRequest("PATCH", { tags: ["follow-up", "synthetic"] }),
    );

    expect(res.status).toBe(200);
    expect(fake().getRows("docUploads")[0].tags).toEqual(["follow-up", "synthetic"]);
  });

  it("rejects mutations on another user's document", async () => {
    seedDocument({ id: "doc-b", userId: "user-b" });

    const archive = await request(
      "/medical-documents/doc-b/archive",
      jsonRequest("PATCH", { archived: true }),
    );
    const tags = await request(
      "/medical-documents/doc-b/tags",
      jsonRequest("PATCH", { tags: ["x"] }),
    );

    expect(archive.status).toBe(404);
    expect(tags.status).toBe(404);
    expect(fake().getRows("docUploads")[0].isArchived).toBe(false);
    expect(fake().getRows("docUploads")[0].tags).toEqual([]);
  });
});

describe("document sub-resources", () => {
  it("returns 404 when an OCR result has not been generated", async () => {
    seedDocument({ id: "doc-1" });

    const res = await request("/medical-documents/doc-1/ocr");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "OCR result not found" });
  });

  it("does not expose OCR results for another user's document", async () => {
    seedDocument({ id: "doc-b", userId: "user-b" });

    const res = await request("/medical-documents/doc-b/ocr");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("returns lab values for an owned document", async () => {
    seedDocument({ id: "doc-1" });
    fake().seed("docLabValues", {
      id: "lab-1",
      documentId: "doc-1",
      testName: "Hemoglobin",
      value: 14.2,
      unit: "g/dL",
      isAbnormal: false,
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });

    const res = await request("/medical-documents/doc-1/lab-values");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ testName: "Hemoglobin", value: 14.2, unit: "g/dL" });
  });
});

describe("GET /medical-documents/timeline/events", () => {
  it("returns timeline events for the current user", async () => {
    seedDocument({
      id: "new",
      title: "Newest",
      createdAt: new Date("2025-02-01T00:00:00Z"),
    });
    seedDocument({ id: "archived", isArchived: true });
    seedDocument({ id: "other", userId: "user-b" });

    const res = await request("/medical-documents/timeline/events?limit=10");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: "new",
      type: "document_upload",
      title: "Newest",
      description: "lab report uploaded",
    });
  });
});

describe("GET /medical-documents/stats/summary", () => {
  // Characterisation test: the stats route is declared after
  // `/medical-documents/:id/summary`, so Express matches this URL as
  // `id = "stats"` and the summary handler returns 404. The stats endpoint is
  // therefore currently unreachable over HTTP. Recorded here instead of
  // silently changing production routing.
  it("is shadowed by /:id/summary and returns 404 (characterisation)", async () => {
    seedDocument({ id: "a", documentType: "lab_report", status: "uploaded", fileSize: 100 });
    seedDocument({
      id: "b",
      documentType: "prescription",
      status: "analyzed",
      fileSize: 250,
    });
    fake().seed("docLabValues", { documentId: "a", isAbnormal: true });

    const res = await request("/medical-documents/stats/summary");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});
