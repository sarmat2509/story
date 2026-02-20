-- Migration: Add turnaround_sheet JSONB column to characters table
-- Created: 2026-02-06
-- Purpose: Store generated turnaround model sheets for imaginary characters
-- Structure: { "url": "...", "generatedAt": "...", "sourcePhotoUrl": "..." }

ALTER TABLE characters ADD COLUMN IF NOT EXISTS turnaround_sheet JSONB DEFAULT NULL;
