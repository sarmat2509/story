-- Migration: Add description_en and description_language columns to characters
-- Created: 2026-02-06
-- Purpose: Store English translation of character description + original language
--          to enable consistent English descriptions in image generation prompts

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS description_language VARCHAR(10);

-- description_en: English translation of (aiGeneratedDescription || description), populated asynchronously
-- description_language: Language code used when the description was generated (e.g. 'uk', 'en', 'fr', 'de')
