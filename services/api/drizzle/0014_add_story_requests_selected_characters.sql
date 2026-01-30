-- Add selected_characters column to story_requests table
ALTER TABLE "story_requests" ADD COLUMN "selected_characters" jsonb;
