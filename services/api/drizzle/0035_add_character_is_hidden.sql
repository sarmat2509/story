-- Migration: Add is_hidden and description_embedding columns to characters
-- Created: 2026-02-15
--
-- is_hidden: hides LLM-generated characters from the UI character list
-- description_embedding: stores Gemini text-embedding-004 vector for similarity matching

ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS description_embedding JSONB;
