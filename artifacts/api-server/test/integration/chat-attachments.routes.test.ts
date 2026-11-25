import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ mock: null as any }));
const auth = vi.hoisted(() => ({ userId: "user-a" as string | null }));
const storage = vi.hoisted(() => ({ root: "" }));
const extractHolder = vi.hoisted(() => ({ fn: null as any }));

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

// Keep uploads out of the repository and make paths deterministic.
vi.mock("../../src/lib/storage/paths", async () => {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const { randomUUID } = await import("node:crypto");

  const root = path.join(os.tmpdir(), `medai-attachments-${randomUUID()}`);
  storage.root = root;

  const safeUserSegment = (userId: string) =>
    (userId || "unknown").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128) || "unknown";

  return {
    UPLOAD_ROOT: root,
    ensureDir: (dir: string) => fs.mkdirSync(dir, { recursive: true }),
    safeUserSegment,
    chatAttachmentsDir: (userId: string) =>
      path.join(root, "chat-attachments", safeUserSegment(userId)),
    userDocumentsDir: (userId: string) =>
      path.join(root, "user-documents", safeUserSegment(userId)),
    toStoredPath: (absolutePath: string) =>
      path.relative(root, path.resolve(absolutePath)).split(path.sep).join("/"),
    resolveStoredPath: (storedPath: string) => {
      const candidate = path.resolve(root, storedPath);
      const relative = path.relative(root, candidate);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
      return candidate;
    },
    sanitizeFileName: (name: string, fallback = "file") => {
      const base = path
        .basename(name || fallback)
        .replace(/[^\w.\- ]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      return base || fallback;
    },
    safeExtension: (name: string, fallback = "") => {
      const ext = path.extname(name || "").toLowerCase();
      return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
    },
  };
});

vi.mock("../../src/lib/pdf/extractPdf", () => ({
  extractPdfPages: (...args: any[]) => extractHolder.fn(...args),
}));

import router from "../../src/routes/images";

const fake = () => dbHolder.mock.db.__fake;

const pdfBytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii");
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const successfulExtraction = () => ({
  pageCount: 2,
  status: "completed",
  usedOcr: false,
  pages: [
    { pageNumber: 1, text: "Hemoglobin 13.5 g/dL", method: "pdf_text" },
    { pageNumber: 2, text: "Glucose 92 mg/dL", method: "pdf_text" },
  ],
});

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
  if (storage.root) {
    const fs = await import("node:fs");
    fs.rmSync(storage.root, { recursive: true, force: true });
  }
});

beforeEach(() => {
  fake().clear();
  auth.userId = "user-a";
  extractHolder.fn = vi.fn(async () => successfulExtraction());
});

function uploadForm(
  files: { name: string; bytes: Buffer; type: string }[],
): FormData {
  const form = new FormData();
  for (const file of files) {
    form.append("images", new Blob([file.bytes], { type: file.type }), file.name);
  }
  return form;
}

async function upload(files: { name: string; bytes: Buffer; type: string }[]) {
  const res = await fetch(`${baseUrl}/images/upload`, {
    method: "POST",
    body: uploadForm(files),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body, text };
}

async function request(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, buffer };
}

describe("chat attachment upload", () => {
  it("requires authentication", async () => {
    auth.userId = null;
    const res = await upload([{ name: "a.pdf", bytes: pdfBytes, type: "application/pdf" }]);

    expect(res.status).toBe(401);
    expect(extractHolder.fn).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file signature", async () => {
    const res = await upload([
      { name: "payload.png", bytes: Buffer.from("<html>hi</html>"), type: "image/png" },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unsupported file type");
    expect(fake().getRows("chatAttachments")).toHaveLength(0);
  });

  it("rejects an empty file", async () => {
    const res = await upload([{ name: "empty.pdf", bytes: Buffer.alloc(0), type: "application/pdf" }]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Empty file");
  });

  it("stores a PDF, extracts pages, and records provenance", async () => {
    const res = await upload([
      { name: "blood_test.pdf", bytes: pdfBytes, type: "application/pdf" },
    ]);

    expect(res.status).toBe(201);
    const [attachment] = res.body.attachments;
    expect(attachment).toMatchObject({
      kind: "pdf",
      type: "document",
      mimeType: "application/pdf",
      name: "blood_test.pdf",
      pageCount: 2,
      extractionStatus: "completed",
    });
    expect(extractHolder.fn).toHaveBeenCalledOnce();

    const [row] = fake().getRows("chatAttachments");
    expect(row).toMatchObject({
      userId: "user-a",
      kind: "pdf",
      pageCount: 2,
      extractionStatus: "completed",
    });
    expect(row.storageKey).toMatch(/^chat-attachments\/user-a\/.+\.pdf$/);
    expect(row.sha256).toMatch(/^[a-f0-9]{64}$/);

    const pages = fake().getRows("chatAttachmentPages");
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      attachmentId: attachment.id,
      pageNumber: 1,
      text: "Hemoglobin 13.5 g/dL",
      extractionMethod: "pdf_text",
    });
    expect(pages[1].pageNumber).toBe(2);

    const fs = await import("node:fs");
    const path = await import("node:path");
    expect(fs.existsSync(path.join(storage.root, row.storageKey))).toBe(true);
  });

  it("keeps an unreadable PDF but marks its extraction status", async () => {
    extractHolder.fn = vi.fn(async () => ({
      pageCount: 3,
      status: "failed",
      usedOcr: false,
      pages: [],
      error: "no_extractable_text",
    }));

    const res = await upload([{ name: "scan.pdf", bytes: pdfBytes, type: "application/pdf" }]);

    expect(res.status).toBe(201);
    expect(res.body.attachments[0]).toMatchObject({
      kind: "pdf",
      extractionStatus: "failed",
      pageCount: 3,
    });
    expect(fake().getRows("chatAttachments")[0]).toMatchObject({
      extractionStatus: "failed",
      extractionError: "no_extractable_text",
    });
    expect(fake().getRows("chatAttachmentPages")).toHaveLength(0);
  });

  it("does not run PDF extraction for images", async () => {
    const res = await upload([{ name: "rash.jpg", bytes: jpegBytes, type: "image/jpeg" }]);

    expect(res.status).toBe(201);
    expect(res.body.attachments[0]).toMatchObject({
      kind: "image",
      type: "image",
      mimeType: "image/jpeg",
    });
    expect(extractHolder.fn).not.toHaveBeenCalled();
    expect(fake().getRows("chatAttachments")[0]).toMatchObject({ kind: "image" });
  });

  it("marks extraction failed when page rows cannot be stored", async () => {
    fake().failNext("insert", "chatAttachmentPages");

    const res = await upload([
      { name: "labs.pdf", bytes: pdfBytes, type: "application/pdf" },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.attachments[0]).toMatchObject({
      kind: "pdf",
      extractionStatus: "failed",
    });
    expect(fake().getRows("chatAttachments")[0]).toMatchObject({
      extractionStatus: "failed",
      extractionError: "page_persist_failed",
    });
    expect(fake().getRows("chatAttachmentPages")).toHaveLength(0);
  });
});

describe("chat attachment download", () => {
  it("serves an owner's PDF with the stored content type", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(storage.root, "chat-attachments", "user-a");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "owned.pdf"), pdfBytes);

    fake().seed("chatAttachments", {
      id: "11111111-1111-1111-1111-111111111111",
      userId: "user-a",
      kind: "pdf",
      storageKey: "chat-attachments/user-a/owned.pdf",
      mimeType: "application/pdf",
      name: "owned.pdf",
    });

    const res = await request("/images/11111111-1111-1111-1111-111111111111");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.buffer.equals(pdfBytes)).toBe(true);
  });

  it("does not disclose another user's attachment", async () => {
    auth.userId = "user-b";

    fake().seed("chatAttachments", {
      id: "22222222-2222-2222-2222-222222222222",
      userId: "user-a",
      kind: "pdf",
      storageKey: "chat-attachments/user-a/private.pdf",
      mimeType: "application/pdf",
      name: "private.pdf",
    });

    const res = await request("/images/22222222-2222-2222-2222-222222222222");

    expect(res.status).toBe(404);
    expect(res.buffer.toString()).not.toContain("Hemoglobin");
  });

  it("returns 404 when the file is missing from disk", async () => {
    fake().seed("chatAttachments", {
      id: "33333333-3333-3333-3333-333333333333",
      userId: "user-a",
      kind: "pdf",
      storageKey: "chat-attachments/user-a/does-not-exist.pdf",
      mimeType: "application/pdf",
      name: "gone.pdf",
    });

    const res = await request("/images/33333333-3333-3333-3333-333333333333");
    expect(res.status).toBe(404);
  });
});
