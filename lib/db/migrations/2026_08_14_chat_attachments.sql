-- Migration: multimodal chat attachments
-- Adds attachment metadata to messages and introduces chat_attachments for
-- secure, user-owned image storage tracking. Idempotent.
-- Preserves all existing data; adds columns/tables only.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  message_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  name text NOT NULL,
  size integer,
  width integer,
  height integer,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_attachments_user_id_idx ON chat_attachments (user_id);
CREATE INDEX IF NOT EXISTS chat_attachments_message_id_idx ON chat_attachments (message_id);
CREATE INDEX IF NOT EXISTS chat_attachments_conversation_id_idx ON chat_attachments (conversation_id);