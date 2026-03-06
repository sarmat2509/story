-- Migration: Add alignments table for forced alignment data (Phase 2)
-- Created: 2026-03-03
-- Run: cd services/api && npx tsx src/scripts/runMigration.ts 0048_add_alignments_table.sql
--
-- Moves alignment from stories.audio_metadata into dedicated table.
-- One alignment per story (1:1). Enables caching and separate endpoints.

-- Create alignments table
CREATE TABLE IF NOT EXISTS alignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  data jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  UNIQUE(story_id)
);

CREATE INDEX IF NOT EXISTS alignments_story_id_idx ON alignments(story_id);
CREATE INDEX IF NOT EXISTS alignments_asset_id_idx ON alignments(asset_id);

COMMENT ON TABLE alignments IS 'Forced alignment (word-level timestamps) for story audio. One per story.';
COMMENT ON COLUMN alignments.data IS 'AlignmentData: characters, words, averageConfidence, provider, language, generatedAt';

-- Migrate existing alignment from stories.audio_metadata
INSERT INTO alignments (story_id, data, created_at, updated_at)
SELECT
  id,
  audio_metadata->'alignment',
  now(),
  now()
FROM stories
WHERE audio_metadata IS NOT NULL
  AND audio_metadata->'alignment' IS NOT NULL
  AND jsonb_typeof(audio_metadata->'alignment') = 'object'
ON CONFLICT (story_id) DO NOTHING;
