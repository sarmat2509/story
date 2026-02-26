-- Migration: Add user mode preference (instant/artisan)
-- Created: 2026-02-25

-- Add mode column to users table with default 'instant'
ALTER TABLE users ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'instant';

-- Create index for mode filtering
CREATE INDEX idx_users_mode ON users(mode);

-- Add check constraint to ensure only valid modes
ALTER TABLE users ADD CONSTRAINT check_user_mode CHECK (mode IN ('instant', 'artisan'));
