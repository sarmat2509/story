-- Migration: Add visibility and share_token for publication options (Phase 2)
-- Created: 2026-03-03
-- Run: cd services/api && npx tsx src/scripts/runMigration.ts 0049_add_visibility_and_share_token.sql
--
-- visibility: 'public' = in catalog (publishedSlug), 'unlisted' = by link only (share_token)
-- share_token: for unlisted stories, used in /u/:token URL

ALTER TABLE stories ADD COLUMN IF NOT EXISTS visibility varchar(20) DEFAULT 'public';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS share_token varchar(64) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stories_share_token_idx ON stories (share_token) WHERE share_token IS NOT NULL;

COMMENT ON COLUMN stories.visibility IS 'public = in catalog, unlisted = by link only';
COMMENT ON COLUMN stories.share_token IS 'For unlisted: token for /u/:token URL';
