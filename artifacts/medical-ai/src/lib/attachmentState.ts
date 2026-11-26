/**
 * Maps backend attachment upload/extraction states to user-facing labels.
 * PDF extraction reports `pending | completed | partial | failed | unsupported`
 * (see `lib/db/src/schema/chat_attachments.ts`). Images are ready immediately.
 */

export type AttachmentState =
  | "uploading"
  | "processing"
  | "ready"
  | "partial"
  | "unreadable"
  | "failed"
  | "unknown";

export type AttachmentTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export interface AttachmentStateView {
  state: AttachmentState;
  label: string;
  description: string;
  tone: AttachmentTone;
}

export interface AttachmentStateInput {
  type?: "image" | "document";
  mimeType?: string;
  extractionStatus?: string | null;
  isUploading?: boolean;
}

export function getAttachmentStateView(
  attachment: AttachmentStateInput,
): AttachmentStateView {
  if (attachment.isUploading) {
    return {
      state: "uploading",
      label: "Uploading…",
      description: "This file is being uploaded.",
      tone: "info",
    };
  }

  const isPdf =
    attachment.type === "document" ||
    attachment.mimeType === "application/pdf";

  if (!isPdf) {
    return {
      state: "ready",
      label: "Ready",
      description: "This image is ready and was available to the AI.",
      tone: "success",
    };
  }

  switch (attachment.extractionStatus) {
    case "pending":
      return {
        state: "processing",
        label: "Processing…",
        description: "Text is being extracted from this document.",
        tone: "info",
      };
    case "completed":
      return {
        state: "ready",
        label: "Ready",
        description: "This document was read successfully.",
        tone: "success",
      };
    case "partial":
      return {
        state: "partial",
        label: "Partially readable",
        description: "Only part of this document could be read.",
        tone: "warning",
      };
    case "unsupported":
      return {
        state: "unreadable",
        label: "Unreadable",
        description:
          "No usable text could be extracted. The AI was told not to guess its contents.",
        tone: "danger",
      };
    case "failed":
      return {
        state: "failed",
        label: "Failed",
        description: "Processing failed. Try uploading a clearer copy.",
        tone: "danger",
      };
    default:
      return {
        state: "unknown",
        label: "Attached",
        description: "No extraction status was reported for this attachment.",
        tone: "neutral",
      };
  }
}
