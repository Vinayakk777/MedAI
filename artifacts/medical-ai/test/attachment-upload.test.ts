import { describe, expect, it } from "vitest";
import {
  detectAttachmentKind,
  MAX_ATTACHMENT_SIZE_BYTES,
  prepareAttachment,
  sniffAttachmentKind,
} from "../src/lib/image";

const pdfBytes = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii");
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const webpBytes = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.from([0x56, 0x50, 0x38, 0x20]),
]);

function file(bytes: Buffer | Uint8Array, name: string, type = ""): File {
  return new File([bytes], name, { type });
}

describe("sniffAttachmentKind", () => {
  it("detects a PDF from its signature even with leading bytes", async () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), pdfBytes]);
    expect(await sniffAttachmentKind(file(withBom, "scan"))).toBe("pdf");
  });

  it.each([
    ["jpeg", jpegBytes],
    ["png", pngBytes],
    ["webp", webpBytes],
  ])("detects %s images from their signature", async (_name, bytes) => {
    expect(await sniffAttachmentKind(file(bytes, "upload"))).toBe("image");
  });

  it("returns null for content that is not a supported attachment", async () => {
    expect(await sniffAttachmentKind(file(Buffer.from("<html>hi</html>"), "page"))).toBeNull();
  });
});

describe("detectAttachmentKind", () => {
  it("accepts a PDF whose browser MIME type is empty", () => {
    expect(detectAttachmentKind(file(pdfBytes, "report.pdf"))).toBe("pdf");
  });

  it("accepts a PDF with a generic MIME type", () => {
    expect(detectAttachmentKind(file(pdfBytes, "report.pdf", "application/octet-stream"))).toBe(
      "pdf",
    );
  });

  it("accepts images with an empty MIME type", () => {
    expect(detectAttachmentKind(file(pngBytes, "photo.png"))).toBe("image");
    expect(detectAttachmentKind(file(jpegBytes, "photo.JPG"))).toBe("image");
    expect(detectAttachmentKind(file(jpegBytes, "photo.jfif", "image/jpeg"))).toBe("image");
  });

  it("accepts an extensionless image from its declared MIME type", () => {
    expect(detectAttachmentKind(file(pngBytes, "image-from-drive", "image/png"))).toBe("image");
  });

  it("prefers a recognised extension over a contradictory MIME type", () => {
    expect(detectAttachmentKind(file(jpegBytes, "photo.jpg", "application/pdf"))).toBe("image");
  });

  it("rejects unsupported files", () => {
    expect(detectAttachmentKind(file(Buffer.from("hi"), "notes.txt", "text/plain"))).toBeNull();
  });
});

describe("prepareAttachment", () => {
  it("prepares a PDF even when the file has no extension or MIME type", async () => {
    const prepared = await prepareAttachment(file(pdfBytes, "download"));
    expect(prepared.kind).toBe("pdf");
    expect(prepared.mimeType).toBe("application/pdf");
    expect(prepared.name).toBe("download.pdf");
    expect(prepared.blob.size).toBe(pdfBytes.length);
  });

  it("normalises a PDF name with an existing extension", async () => {
    const prepared = await prepareAttachment(file(pdfBytes, "lab.report.PDF"));
    expect(prepared.name).toBe("lab.report.pdf");
  });

  it("rejects an empty file", async () => {
    await expect(prepareAttachment(file(Buffer.alloc(0), "empty.pdf"))).rejects.toThrow(
      "This file is empty.",
    );
  });

  it("rejects an unsupported file before any upload happens", async () => {
    await expect(prepareAttachment(file(Buffer.from("hello"), "notes.txt", "text/plain"))).rejects.toThrow(
      "Unsupported file type",
    );
  });

  it("keeps the 25 MB server limit in the client contract", () => {
    expect(MAX_ATTACHMENT_SIZE_BYTES).toBe(25 * 1024 * 1024);
  });
});
