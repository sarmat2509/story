-- Migration: Add turnaround_sheet column to child_profiles
-- Created: 2026-02-15

ALTER TABLE child_profiles ADD COLUMN IF NOT EXISTS turnaround_sheet JSONB DEFAULT NULL;
