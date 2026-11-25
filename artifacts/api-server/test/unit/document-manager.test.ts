import { beforeEach, describe, expect, it, vi } from "vitest";

const dbHolder = vi.hoisted(() => ({ mock: null as any }));

vi.mock("@workspace/db", async () => {
  const { createWorkspaceDbMock } = await import("../helpers/workspaceDbMock");
  const mock = createWorkspaceDbMock();
  dbHolder.mock = mock;
  return mock;
});

vi.mock("drizzle-orm", async () => await import("../helpers/drizzleMock"));

import { DocumentManager } from "../../src/lib/medical-documents/documentManager";

const fake = () => dbHolder.mock.db.__fake;

function seedUpload(overrides: Record<string, any> = {}) {
  return fake().seed("docUploads", {
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

beforeEach(() => {
  fake().clear();
});

describe("DocumentManager.detectDocumentType", () => {
  const manager = new DocumentManager();
  const cases: Array<[string, string, string]> = [
    ["chest_xray.pdf", "application/pdf", "chest_xray"],
    ["ecg_reading.pdf", "application/pdf", "ecg_printout"],
    ["discharge_summary.pdf", "application/pdf", "discharge_summary"],
    ["prescription_rx.pdf", "application/pdf", "prescription"],
    ["vaccination_record.pdf", "application/pdf", "vaccination_record"],
    ["referral.pdf", "application/pdf", "referral_letter"],
    ["lab_report.pdf", "application/pdf", "lab_report"],
    ["mri_brain.pdf", "application/pdf", "mri_report"],
    ["unknown.pdf", "application/pdf", "lab_report"],
    ["skin_lesion.jpg", "image/jpeg", "skin_photograph"],
    ["chest_photo.png", "image/png", "chest_xray"],
    ["random.jpg", "image/jpeg", "other"],
    ["notes.txt", "text/plain", "other"],
  ];

  it.each(cases)("maps %s (%s) to %s", (fileName, mimeType, expected) => {
    expect(manager.detectDocumentType(fileName, mimeType)).toBe(expected);
  });
});

describe("DocumentManager.upload", () => {
  it("records upload metadata without touching the filesystem", async () => {
    const manager = new DocumentManager();

    const result = await manager.upload(
      "user-a",
      { originalname: "report.pdf", size: 2048, mimetype: "application/pdf" },
      {
        documentType: "lab_report",
        title: "Lab report",
        description: "Synthetic description",
        tags: ["synthetic", "lab"],
        conversationId: "conv-1",
      },
    );

    expect(result).toMatchObject({
      fileName: "report.pdf",
      status: "uploaded",
    });
    expect(result.documentId).toBeTruthy();
    expect(result.storagePath).toContain("user-a");
    expect(result.storagePath).toContain("report.pdf");

    const [row] = fake().getRows("docUploads");
    expect(row).toMatchObject({
      userId: "user-a",
      documentType: "lab_report",
      status: "uploaded",
      fileName: "report.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      title: "Lab report",
      description: "Synthetic description",
      tags: ["synthetic", "lab"],
      conversationId: "conv-1",
      isArchived: false,
    });
  });

  it("defaults tags to an empty array", async () => {
    const manager = new DocumentManager();

    await manager.upload(
      "user-a",
      { originalname: "scan.pdf", size: 10, mimetype: "application/pdf" },
      { documentType: "lab_report" },
    );

    expect(fake().getRows("docUploads")[0].tags).toEqual([]);
  });
});

describe("DocumentManager.list", () => {
  it("scopes results to the user and excludes archived documents by default", async () => {
    seedUpload({ id: "a-1" });
    seedUpload({ id: "a-2", documentType: "prescription", fileName: "rx.pdf" });
    seedUpload({ id: "a-archived", isArchived: true });
    seedUpload({ id: "b-1", userId: "user-b" });

    const result = await new DocumentManager().list("user-a", {});

    expect(result.total).toBe(2);
    expect(result.documents.map((d: any) => d.id).sort()).toEqual(["a-1", "a-2"]);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("filters by document type and status", async () => {
    seedUpload({ id: "a-1", documentType: "lab_report", status: "uploaded" });
    seedUpload({ id: "a-2", documentType: "prescription", status: "analyzed" });

    const byType = await new DocumentManager().list("user-a", { documentType: "prescription" });
    expect(byType.documents.map((d: any) => d.id)).toEqual(["a-2"]);

    const byStatus = await new DocumentManager().list("user-a", { status: "uploaded" });
    expect(byStatus.documents.map((d: any) => d.id)).toEqual(["a-1"]);
  });

  it("can list archived documents explicitly", async () => {
    seedUpload({ id: "active" });
    seedUpload({ id: "archived", isArchived: true });

    const result = await new DocumentManager().list("user-a", { isArchived: true });

    expect(result.documents.map((d: any) => d.id)).toEqual(["archived"]);
  });

  it("matches a fileName substring", async () => {
    seedUpload({ id: "match", fileName: "blood_panel.pdf" });
    seedUpload({ id: "other", fileName: "xray.pdf" });

    const result = await new DocumentManager().list("user-a", { query: "blood" });

    expect(result.documents.map((d: any) => d.id)).toEqual(["match"]);
  });

  it("applies ordering, limit, and offset", async () => {
    seedUpload({ id: "b", fileName: "b.pdf", createdAt: new Date("2025-01-02T00:00:00Z") });
    seedUpload({ id: "a", fileName: "a.pdf", createdAt: new Date("2025-01-01T00:00:00Z") });

    const ascending = await new DocumentManager().list("user-a", {
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(ascending.documents.map((d: any) => d.id)).toEqual(["a", "b"]);

    const paged = await new DocumentManager().list("user-a", { limit: 1, offset: 1 });
    expect(paged.documents).toHaveLength(1);
    expect(paged.limit).toBe(1);
    expect(paged.offset).toBe(1);
  });

  it("caps the page size at 100", async () => {
    const result = await new DocumentManager().list("user-a", { limit: 500 });
    expect(result.limit).toBe(100);
  });
});

describe("DocumentManager record operations", () => {
  it("gets a document by id and returns null when absent", async () => {
    seedUpload({ id: "doc-1" });
    const manager = new DocumentManager();

    expect(await manager.getById("doc-1")).toMatchObject({ id: "doc-1" });
    expect(await manager.getById("missing")).toBeNull();
  });

  it("soft-deletes, archives, and updates tags", async () => {
    seedUpload({ id: "doc-1" });
    const manager = new DocumentManager();

    await manager.softDelete("doc-1");
    let row = fake().getRows("docUploads")[0];
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);

    await manager.archive("doc-1", true);
    row = fake().getRows("docUploads")[0];
    expect(row.isArchived).toBe(true);

    await manager.updateTags("doc-1", ["follow-up"]);
    expect(fake().getRows("docUploads")[0].tags).toEqual(["follow-up"]);
  });

  it("moves an existing document to ocr_pending", async () => {
    seedUpload({ id: "doc-1", status: "uploaded" });

    await new DocumentManager().processDocument("doc-1");

    expect(fake().getRows("docUploads")[0].status).toBe("ocr_pending");
  });

  it("throws when processing a missing document", async () => {
    await expect(new DocumentManager().processDocument("missing")).rejects.toThrow(
      "Document not found",
    );
  });

  it("updates status with extra fields", async () => {
    seedUpload({ id: "doc-1", status: "uploaded" });

    await new DocumentManager().updateStatus("doc-1", "analyzed", { aiSummary: "summary" });

    expect(fake().getRows("docUploads")[0]).toMatchObject({
      status: "analyzed",
      aiSummary: "summary",
    });
  });
});

describe("DocumentManager.getTimelineEvents", () => {
  it("returns the newest non-archived events for the user only", async () => {
    seedUpload({
      id: "new",
      title: "Newest",
      createdAt: new Date("2025-02-01T00:00:00Z"),
    });
    seedUpload({
      id: "old",
      title: "Older",
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    seedUpload({ id: "archived", isArchived: true });
    seedUpload({ id: "other-user", userId: "user-b" });

    const events = await new DocumentManager().getTimelineEvents("user-a", 1);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "new",
      type: "document_upload",
      title: "Newest",
      description: "lab report uploaded",
      metadata: {
        documentType: "lab_report",
        status: "uploaded",
        fileSize: 1000,
      },
    });
    expect(events[0].timestamp).toBe("2025-02-01T00:00:00.000Z");
  });
});
