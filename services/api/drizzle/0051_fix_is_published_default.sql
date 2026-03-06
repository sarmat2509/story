-- Migration: Fix is_published default to false
-- Created: 2026-03-03
--
-- Root cause: schema had is_published DEFAULT true; story creation also set isPublished: true.
-- New stories should be drafts (unpublished) until user explicitly publishes.
--
-- 1. Fix rows: stories without published_slug AND without share_token are drafts
-- 2. Change default for new rows

UPDATE stories
SET is_published = false
WHERE published_slug IS NULL AND share_token IS NULL;

ALTER TABLE stories ALTER COLUMN is_published SET DEFAULT false;
