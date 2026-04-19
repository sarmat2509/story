-- Migration: Add users.theme_palette for per-user theme palette personalization
-- Created: 2026-04-19

ALTER TABLE users
ADD COLUMN IF NOT EXISTS theme_palette varchar(32) NOT NULL DEFAULT 'dusk_lavender';
