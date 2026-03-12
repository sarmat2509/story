-- Migration: Add llm_turnaround_cache for LLM character turnaround reuse
-- Created: 2026-03-12
-- Embedding-based cache: store description + embedding, search with 95% similarity, reuse instead of generating

CREATE TABLE IF NOT EXISTS llm_turnaround_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  description_embedding JSONB NOT NULL,
  storage_path TEXT NOT NULL,
  front_storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
