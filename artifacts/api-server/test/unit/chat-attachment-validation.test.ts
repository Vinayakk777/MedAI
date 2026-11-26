import { describe, expect, it } from "vitest";
import {
  ALLOWED_CHAT_MIME_TYPES,
  MAX_CHAT_ATTACHMENT_BYTES,
  detectAttachment,
  isAllowedDeclaredMime,
} from "../../src/lib/chat-attachments/validation";

const pdfHeader = Buffer.from("%PDF-1.7\n1 0 obj\n", "ascii");
const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pngHeader = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const webpHeader = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.from([0x56, 0x50, 0x38, 0x20]),
]);

describe("detectAttachment", () => {
  it("accepts a PDF by its signature", () => {
    const result = detectAttachment(pdfHeader, "application/pdf");
    expect(result).toEqual({
      ok: true,
      value: { kind: "pdf", mimeType: "application/pdf", extension: ".pdf" },
    });
  });

  it("accepts a PDF whose header is preceded by a BOM or binary preamble", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), pdfHeader]);
    expect(detectAttachment(withBom, "application/pdf").ok).toBe(true);

    const withPreamble = Buffer.concat([Buffer.alloc(32, 0x20), pdfHeader]);
    expect(detectAttachment(withPreamble, "application/octet-stream").ok).toBe(true);
  });

  it("does not treat a PDF header buried deep in the file as a PDF", () => {
    const buried = Buffer.concat([Buffer.alloc(2048, 0x20), pdfHeader]);
    expect(detectAttachment(buried, "application/pdf")).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
  });

  it.each([
    ["jpeg", jpegHeader, "image/jpeg", ".jpg"],
    ["png", pngHeader, "image/png", ".png"],
    ["webp", webpHeader, "image/webp", ".webp"],
  ])("accepts %s images by signature", (_name, buffer, mimeType, extension) => {
    expect(detectAttachment(buffer, mimeType)).toEqual({
      ok: true,
      value: { kind: "image", mimeType, extension },
    });
  });

  it("rejects a file whose declared MIME type is unsupported", () => {
    const result = detectAttachment(Buffer.from("MZ\x90\x00", "binary"), "application/x-msdownload");
    expect(result).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("rejects a spoofed PDF MIME with non-PDF bytes", () => {
    const result = detectAttachment(Buffer.from("not a pdf at all", "utf8"), "application/pdf");
    expect(result).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("rejects empty files", () => {
    expect(detectAttachment(Buffer.alloc(0))).toEqual({ ok: false, reason: "empty_file" });
  });

  it("rejects files above the server cap", () => {
    const oversized = Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + 1);
    expect(detectAttachment(oversized, "image/png")).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("keeps the allowlist in sync with the detector", () => {
    expect([...ALLOWED_CHAT_MIME_TYPES].sort()).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(isAllowedDeclaredMime("application/pdf")).toBe(true);
    expect(isAllowedDeclaredMime("text/html")).toBe(false);
    expect(isAllowedDeclaredMime(undefined)).toBe(false);
  });
});
