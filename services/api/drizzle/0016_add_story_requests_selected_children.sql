-- Add selected_children column to story_requests table
ALTER TABLE "story_requests" ADD COLUMN "selected_children" jsonb;
