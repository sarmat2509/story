-- Migration: Add scenario_world_rules table for world rules per scenario
-- Created: 2026-03-03

CREATE TABLE IF NOT EXISTS scenario_world_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_card_id VARCHAR(100) NOT NULL REFERENCES scenario_cards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_world_rules_card ON scenario_world_rules(scenario_card_id);
