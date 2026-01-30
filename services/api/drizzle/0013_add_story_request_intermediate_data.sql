-- Add intermediate_data column to story_requests table for checkpoint-based retry
ALTER TABLE story_requests ADD COLUMN IF NOT EXISTS intermediate_data jsonb;
