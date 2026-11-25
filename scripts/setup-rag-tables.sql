-- RAG Database Setup for MedAI — Step 1: Create tables
-- Run this in Neon SQL Editor first

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  organization TEXT NOT NULL,
  website TEXT,
  api_endpoint TEXT,
  api_key TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  source_type TEXT DEFAULT 'guideline',
  retrieval_method TEXT DEFAULT 'ingested',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS medical_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  document_type TEXT DEFAULT 'text',
  url TEXT,
  publication_date TIMESTAMP,
  version TEXT,
  organization TEXT NOT NULL,
  author TEXT,
  language TEXT DEFAULT 'en',
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  raw_content TEXT,
  chunk_count INTEGER DEFAULT 0,
  is_indexed BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  checksum TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_preview TEXT,
  section TEXT,
  subsection TEXT,
  heading TEXT,
  word_count INTEGER DEFAULT 0,
  page_number INTEGER,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS retrieval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  query_embedding vector(1536),
  retrieval_type TEXT DEFAULT 'semantic',
  matched_chunk_ids JSONB DEFAULT '[]',
  result_count INTEGER DEFAULT 0,
  latency_ms INTEGER,
  pipeline_stage TEXT,
  context_used BOOLEAN DEFAULT FALSE,
  was_fallback BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS citation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retrieval_log_id UUID REFERENCES retrieval_logs(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL,
  conversation_id UUID,
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
  source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL,
  organization TEXT NOT NULL,
  guideline_name TEXT,
  publication_date TIMESTAMP,
  evidence_text TEXT,
  confidence TEXT DEFAULT 'moderate',
  relevance_score REAL,
  pipeline_stage TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_hash TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  embedding vector(1536),
  model TEXT DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_medical_documents_checksum ON medical_documents(checksum);
CREATE INDEX IF NOT EXISTS idx_medical_documents_archived ON medical_documents(is_archived);
CREATE INDEX IF NOT EXISTS idx_retrieval_logs_user_id ON retrieval_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_citation_records_user_id ON citation_records(user_id);
CREATE INDEX IF NOT EXISTS idx_citation_records_document_id ON citation_records(document_id);
