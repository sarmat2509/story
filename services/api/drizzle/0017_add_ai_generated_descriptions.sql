-- Migration: 0017_add_ai_generated_descriptions
-- Add AI-generated description fields to child_profiles and characters
-- All fields are nullable because AI may not be able to determine all values from photos

-- Add columns to child_profiles
ALTER TABLE child_profiles 
  ADD COLUMN IF NOT EXISTS ai_generated_description TEXT NULL,
  ADD COLUMN IF NOT EXISTS clothing JSONB NULL,
  ADD COLUMN IF NOT EXISTS distinctive_features JSONB NULL;

-- Add columns to characters  
ALTER TABLE characters 
  ADD COLUMN IF NOT EXISTS ai_generated_description TEXT NULL,
  ADD COLUMN IF NOT EXISTS clothing JSONB NULL,
  ADD COLUMN IF NOT EXISTS distinctive_features JSONB NULL;

-- Add indexes for faster text search on AI descriptions
CREATE INDEX IF NOT EXISTS idx_child_profiles_ai_description 
  ON child_profiles USING gin(to_tsvector('english', ai_generated_description))
  WHERE ai_generated_description IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_characters_ai_description 
  ON characters USING gin(to_tsvector('english', ai_generated_description))
  WHERE ai_generated_description IS NOT NULL;

-- Add comments explaining nullable design
COMMENT ON COLUMN child_profiles.ai_generated_description IS 
  'AI-generated description from Gemini Vision API. NULL if analysis failed or photo quality insufficient. One-time analysis at profile creation/update.';

COMMENT ON COLUMN child_profiles.clothing IS 
  'Structured clothing data extracted by AI from reference photos. NULL if clothing not visible or unclear in photos. Format: {style, colors, distinctiveItems, accessories}.';

COMMENT ON COLUMN child_profiles.distinctive_features IS 
  'Array of distinctive features detected by AI (e.g., freckles, dimples, glasses). NULL if none detected or photos unclear.';

COMMENT ON COLUMN characters.ai_generated_description IS 
  'AI-generated description from Gemini Vision API. NULL if analysis failed or photo quality insufficient. One-time analysis at character creation/update.';

COMMENT ON COLUMN characters.clothing IS 
  'Structured clothing data extracted by AI from reference photos. NULL if clothing not visible or unclear in photos. Format: {style, colors, distinctiveItems, accessories}.';

COMMENT ON COLUMN characters.distinctive_features IS 
  'Array of distinctive features detected by AI (e.g., collar color for pets, unique markings). NULL if none detected or photos unclear.';
