-- Migration 0008: Add Voice Catalog and Age Groups Reference System (Modified)
-- This migration adds:
-- 1. age_groups reference table with UUID primary keys
-- 2. voice_age_groups junction table (M2M)
-- 3. New columns to tts_voices (role_type, voice_tags, provider_preview_url)
-- 4. Migration of stories and age_engine_rules to use age_group_id UUID references

-- ========================================
-- Step 1: Create age_groups reference table
-- ========================================

CREATE TABLE IF NOT EXISTS age_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(10) UNIQUE NOT NULL,
  name_key VARCHAR(100) NOT NULL,
  min_months INTEGER NOT NULL,
  max_months INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE age_groups IS 'Reference table for age groups with UUID primary keys';
COMMENT ON COLUMN age_groups.slug IS 'Legacy slug for backward compatibility: 1y, 2-3, 4-5, 6-8, 9-12';
COMMENT ON COLUMN age_groups.name_key IS 'i18n key for age group name (e.g., age_groups.1y.name)';
COMMENT ON COLUMN age_groups.min_months IS 'Minimum age in months (inclusive)';
COMMENT ON COLUMN age_groups.max_months IS 'Maximum age in months (exclusive), NULL for last group';

CREATE UNIQUE INDEX IF NOT EXISTS age_groups_slug_idx ON age_groups(slug);
CREATE INDEX IF NOT EXISTS age_groups_sort_order_idx ON age_groups(sort_order);

-- Insert initial age groups (skip if already exists)
INSERT INTO age_groups (slug, name_key, min_months, max_months, sort_order) 
SELECT '1y', 'age_groups.1y.name', 12, 24, 1
WHERE NOT EXISTS (SELECT 1 FROM age_groups WHERE slug = '1y')
UNION ALL
SELECT '2-3', 'age_groups.2_3.name', 24, 48, 2
WHERE NOT EXISTS (SELECT 1 FROM age_groups WHERE slug = '2-3')
UNION ALL
SELECT '4-5', 'age_groups.4_5.name', 48, 72, 3
WHERE NOT EXISTS (SELECT 1 FROM age_groups WHERE slug = '4-5')
UNION ALL
SELECT '6-8', 'age_groups.6_8.name', 72, 108, 4
WHERE NOT EXISTS (SELECT 1 FROM age_groups WHERE slug = '6-8')
UNION ALL
SELECT '9-12', 'age_groups.9_12.name', 108, NULL, 5
WHERE NOT EXISTS (SELECT 1 FROM age_groups WHERE slug = '9-12');

-- ========================================
-- Step 2: Add columns to tts_voices
-- ========================================

ALTER TABLE tts_voices
  ADD COLUMN IF NOT EXISTS role_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS voice_tags VARCHAR[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS provider_preview_url TEXT;

COMMENT ON COLUMN tts_voices.role_type IS 'Voice role: narrator, character, or both';
COMMENT ON COLUMN tts_voices.voice_tags IS 'Descriptive tags: calm, energetic, wise, storyteller, etc.';
COMMENT ON COLUMN tts_voices.provider_preview_url IS 'Preview URL from provider (ElevenLabs) for admin playback';

-- ========================================
-- Step 3: Create junction table for voice-age relationships
-- ========================================

CREATE TABLE IF NOT EXISTS voice_age_groups (
  voice_id UUID NOT NULL REFERENCES tts_voices(id) ON DELETE CASCADE,
  age_group_id UUID NOT NULL REFERENCES age_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (voice_id, age_group_id)
);

CREATE INDEX IF NOT EXISTS voice_age_groups_voice_id_idx ON voice_age_groups(voice_id);
CREATE INDEX IF NOT EXISTS voice_age_groups_age_group_id_idx ON voice_age_groups(age_group_id);

COMMENT ON TABLE voice_age_groups IS 'Many-to-many relationship between voices and age groups';

-- ========================================
-- Step 4: Update stories table to reference age_groups by UUID
-- ========================================

-- Add new UUID column
ALTER TABLE stories ADD COLUMN IF NOT EXISTS age_group_id UUID;

-- Drop existing constraint if exists
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_age_group_id_fkey;

-- Add foreign key constraint
ALTER TABLE stories ADD CONSTRAINT stories_age_group_id_fkey 
  FOREIGN KEY (age_group_id) REFERENCES age_groups(id);

-- Migrate existing data
UPDATE stories s
SET age_group_id = ag.id
FROM age_groups ag
WHERE s.age_group = ag.slug
AND s.age_group_id IS NULL;

-- Make NOT NULL after migration (only if all rows have values)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stories WHERE age_group_id IS NULL LIMIT 1) THEN
    ALTER TABLE stories ALTER COLUMN age_group_id SET NOT NULL;
  END IF;
END $$;

-- Create index
CREATE INDEX IF NOT EXISTS stories_age_group_id_idx ON stories(age_group_id);

-- Note: Keep age_group (string) column temporarily for backward compatibility
-- Will be dropped in future migration after all code is updated

-- ========================================
-- Step 5: Update age_engine_rules to reference age_groups by UUID
-- ========================================

-- Add new UUID column
ALTER TABLE age_engine_rules ADD COLUMN IF NOT EXISTS age_group_id UUID;

-- Drop existing constraint if exists
ALTER TABLE age_engine_rules DROP CONSTRAINT IF EXISTS age_engine_rules_age_group_id_fkey;

-- Add foreign key constraint
ALTER TABLE age_engine_rules ADD CONSTRAINT age_engine_rules_age_group_id_fkey 
  FOREIGN KEY (age_group_id) REFERENCES age_groups(id);

-- Migrate existing data
UPDATE age_engine_rules aer
SET age_group_id = ag.id
FROM age_groups ag
WHERE aer.age_group = ag.slug
AND aer.age_group_id IS NULL;

-- Make NOT NULL after migration (only if all rows have values)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM age_engine_rules WHERE age_group_id IS NULL LIMIT 1) THEN
    ALTER TABLE age_engine_rules ALTER COLUMN age_group_id SET NOT NULL;
  END IF;
END $$;

-- Note: Keep age_group (string) column as primary key for now
-- Will be migrated in future release after code refactoring

-- ========================================
-- Migration complete
-- ========================================
