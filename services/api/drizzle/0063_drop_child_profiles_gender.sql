-- Migration: Drop gender column from child_profiles
-- Created: 2026-03-16
-- Description: Gender field was optional and unused in prompts/story generation; removing for simplification.

ALTER TABLE child_profiles DROP COLUMN IF EXISTS gender;
