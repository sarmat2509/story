-- Migration: Add public_render_version for SSR cache invalidation
-- Created: 2026-03-03
-- Run: cd services/api && npx tsx src/scripts/runMigration.ts 0047_add_public_render_version.sql

ALTER TABLE stories
ADD COLUMN IF NOT EXISTS public_render_version integer DEFAULT 1 NOT NULL;

COMMENT ON COLUMN stories.public_render_version IS 'Incremented on publish/unpublish/audio/alignment/theme - used in SSR cache key';
