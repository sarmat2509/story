-- Migration: Update macro_scifi icon to 🤖
-- Created: 2026-03-03

UPDATE scenario_cards SET icon = '🤖' WHERE id = 'macro_scifi';
