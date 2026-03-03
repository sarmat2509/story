-- Migration: Remove story_tones table and tone columns
-- Created: 2026-03-03
--
-- Drops story_tones table and removes tone from stories, story_requests, story_series.
-- Deletes story_tone translations.

-- Drop FK constraints (stories, story_requests reference story_tones)
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_tone_story_tones_slug_fk;
ALTER TABLE story_requests DROP CONSTRAINT IF EXISTS story_requests_tone_story_tones_slug_fk;

-- Drop tone columns
ALTER TABLE stories DROP COLUMN IF EXISTS tone;
ALTER TABLE story_requests DROP COLUMN IF EXISTS tone;
ALTER TABLE story_series DROP COLUMN IF EXISTS tone;

-- Delete translations for story_tone
DELETE FROM translations WHERE entity_type = 'story_tone';

-- Drop table
DROP TABLE IF EXISTS story_tones;
