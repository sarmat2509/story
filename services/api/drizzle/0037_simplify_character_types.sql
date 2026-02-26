-- Migration: Simplify character types to 3 categories + add subtypes
-- Created: 2026-02-25

-- Step 1: Add subtype column
ALTER TABLE characters ADD COLUMN IF NOT EXISTS subtype varchar(50);

-- Step 2: Migrate existing data with subtype mapping
UPDATE characters SET 
  type = 'person',
  subtype = CASE 
    WHEN type = 'family_member' THEN 'other_adult'
    WHEN type = 'friend' THEN 'best_friend'
    WHEN type = 'neighbor' THEN 'neighbor'
  END
WHERE type IN ('family_member', 'friend', 'neighbor');

UPDATE characters SET 
  type = 'imaginary',
  subtype = 'imaginary_friend'
WHERE type = 'imaginary_friend';

UPDATE characters SET 
  type = 'pet',
  subtype = 'other_animal'
WHERE type = 'pet';

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'person count: %', (SELECT COUNT(*) FROM characters WHERE type = 'person');
  RAISE NOTICE 'pet count: %', (SELECT COUNT(*) FROM characters WHERE type = 'pet');
  RAISE NOTICE 'imaginary count: %', (SELECT COUNT(*) FROM characters WHERE type = 'imaginary');
END $$;
