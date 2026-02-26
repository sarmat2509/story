-- Migration: Rename pet → animal for type unification
-- Created: 2026-02-25

-- Update existing records
UPDATE characters 
SET type = 'animal' 
WHERE type = 'pet';

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Characters with type=animal: %', (SELECT COUNT(*) FROM characters WHERE type = 'animal');
  RAISE NOTICE 'Characters with type=pet (should be 0): %', (SELECT COUNT(*) FROM characters WHERE type = 'pet');
END $$;
