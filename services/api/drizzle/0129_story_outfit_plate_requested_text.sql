-- Migration: remember requested outfit text for per-story outfit plate mappings
-- Created: 2026-07-09

ALTER TABLE story_outfit_plate_cache
  ADD COLUMN IF NOT EXISTS requested_outfit_text TEXT;
