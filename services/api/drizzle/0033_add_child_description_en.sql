-- Migration: Add description_en and description_language columns to child_profiles
-- Created: 2026-02-13
-- Purpose: Enable background English translation of child descriptions for better image prompt quality

ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS description_en TEXT DEFAULT NULL;
ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS description_language VARCHAR(10) DEFAULT NULL;
