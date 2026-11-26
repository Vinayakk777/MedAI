-- Migration: add observability metadata to consultation_analytics
-- Idempotent. Adds columns for recording response validation outcome and
-- retrieval configuration per consultation, without dropping or altering
-- existing data. No destructive operations.

ALTER TABLE IF EXISTS consultation_analytics
  ADD COLUMN IF NOT EXISTS validation_outcome text,
  ADD COLUMN IF NOT EXISTS retrieval_config jsonb NOT NULL DEFAULT '{}'::jsonb;
