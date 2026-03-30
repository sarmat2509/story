-- Migration: Promote specific user to admin
-- Created: 2026-03-24

UPDATE users
SET role = 'admin'
WHERE email = 'sarmat2509@gmail.com';
