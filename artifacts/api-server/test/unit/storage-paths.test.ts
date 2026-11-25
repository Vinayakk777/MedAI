import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  UPLOAD_ROOT,
  chatAttachmentsDir,
  resolveStoredPath,
  safeExtension,
  safeUserSegment,
  sanitizeFileName,
  toStoredPath,
  userDocumentsDir,
} from "../../src/lib/storage/paths";

describe("upload path helpers", () => {
  it("round-trips an absolute path under the upload root", () => {
    const absolute = path.join(UPLOAD_ROOT, "user-documents", "user-a", "report.pdf");
    const stored = toStoredPath(absolute);

    expect(stored).toBe("user-documents/user-a/report.pdf");
    expect(resolveStoredPath(stored)).toBe(path.resolve(absolute));
  });

  it("accepts legacy paths that still carry the uploads/ prefix", () => {
    const expected = path.join(UPLOAD_ROOT, "user-a", "report.pdf");

    expect(resolveStoredPath("uploads/user-a/report.pdf")).toBe(path.resolve(expected));
  });

  it("normalises Windows separators", () => {
    const expected = path.join(UPLOAD_ROOT, "user-a", "report.pdf");
    expect(resolveStoredPath("user-a\\report.pdf")).toBe(path.resolve(expected));
  });

  it("rejects traversal outside the upload root", () => {
    expect(resolveStoredPath("../secrets.txt")).toBeNull();
    expect(resolveStoredPath("../../etc/passwd")).toBeNull();
    expect(resolveStoredPath("uploads/../../etc/passwd")).toBeNull();
    expect(resolveStoredPath("")).toBeNull();
  });

  it("builds per-user directories with a filesystem-safe segment", () => {
    expect(chatAttachmentsDir("user/a")).toBe(
      path.join(UPLOAD_ROOT, "chat-attachments", "user_a"),
    );
    expect(userDocumentsDir("user-a")).toBe(
      path.join(UPLOAD_ROOT, "user-documents", "user-a"),
    );
    expect(safeUserSegment("../../etc")).not.toContain("/");
    expect(safeUserSegment("")).toBe("unknown");
  });

  it("strips directories and unsafe characters from file names", () => {
    expect(sanitizeFileName("../../evil name.pdf")).toBe("evil name.pdf");
    expect(sanitizeFileName("report<>.pdf")).toBe("report.pdf");
    expect(sanitizeFileName("")).toBe("file");
  });

  it("only keeps conservative extensions", () => {
    expect(safeExtension("Report.PDF")).toBe(".pdf");
    expect(safeExtension("archive.tar.gz")).toBe(".gz");
    expect(safeExtension("noext")).toBe("");
    expect(safeExtension("weird.name.", ".bin")).toBe(".bin");
  });
});
