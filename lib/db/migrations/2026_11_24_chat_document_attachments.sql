-- Migration: chat PDF attachments + user_documents table split
--
-- Background
-- ----------
-- `medical_documents` was declared twice in the Drizzle schema:
--   * lib/db/src/schema/medical_knowledge.ts  (knowledge-base shape)
--   * lib/db/src/schema/medical_documents.ts  (user-upload shape)
-- A single physical table cannot satisfy both. User uploads now use
-- `user_documents`; the knowledge base keeps `medical_documents`.
--
-- This migration is idempotent and does not delete data:
--   1. If `medical_documents` has the upload shape (has `user_id`, no
--      `source_id`) and `user_documents` does not exist yet, rename it.
--      Renaming preserves every row and every existing index.
--   2. Add PDF/OCR metadata to `chat_attachments`.
--   3. Create `chat_attachment_pages` for page-level provenance.
--
-- Run `pnpm --filter db push` afterwards to create/align the knowledge-base
-- `medical_documents` table and its foreign keys. This migration deliberately
-- does not drop or recreate constraints.

DO $$
BEGIN
  IF to_regclass('public.user_documents') IS NULL
     AND to_regclass('public.medical_documents') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'medical_documents'
         AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'medical_documents'
         AND column_name = 'source_id'
     )
  THEN
    ALTER TABLE public.medical_documents RENAME TO user_documents;
  END IF;
END $$;

ALTER TABLE IF EXISTS chat_attachments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS page_count integer,
  ADD COLUMN IF NOT EXISTS extraction_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_error text,
  ADD COLUMN IF NOT EXISTS sha256 text;

CREATE TABLE IF NOT EXISTS chat_attachment_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES chat_attachments(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  text text NOT NULL,
  char_count integer DEFAULT 0,
  extraction_method text NOT NULL DEFAULT 'pdf_text',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_attachment_pages_attachment_id_idx
  ON chat_attachment_pages (attachment_id);
