-- Migration: Widen story_characters.role — LLM / UI may supply long role descriptions
-- Created: 2026-03-21

ALTER TABLE story_characters
  ALTER COLUMN role TYPE VARCHAR(255);
