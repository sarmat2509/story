-- ==========================================
-- Migration 0013: Add Scary Stories Theme
-- ==========================================
-- This migration adds a new scenario card theme "Scary Stories"
-- with age-appropriate scary content for children 4-12 years.
-- Detailed age-specific requirements are handled by contentPolicy.ts (getContentPolicy / buildTextPromptSection).

-- Add scary stories scenario card
INSERT INTO scenario_cards (id, name_key, description_key, icon, prompt_guidance, suggested_goals, age_groups, sort_order, is_active) 
VALUES (
  'scary_stories',
  'scenario_cards.scary_stories.name',
  'scenario_cards.scary_stories.description',
  '👻',
  'Spooky stories with mysteries, gentle scares, and positive endings. Include age-appropriate supernatural elements, problem-solving, and overcoming fears. The story should have a mysterious atmosphere but always end with fears overcome, mysteries solved, and friendships formed. Book style examples: Goosebumps series, Coraline, Scary Stories to Tell in the Dark (age-adapted), Monster House, Room on the Broom.',
  '["courage", "overcoming_fears", "friendship", "persistence"]',
  '["4-5", "6-8", "9-12"]',
  11,
  true
);

-- Add translations for all languages

-- Ukrainian
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'scary_stories', 'uk', 'name', 'Страшилки'),
('scenario_card', 'scary_stories', 'uk', 'description', 'Моторошні історії та загадки з добрим кінцем');

-- Russian
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'scary_stories', 'ru', 'name', 'Страшилки'),
('scenario_card', 'scary_stories', 'ru', 'description', 'Жуткие истории и загадки с хорошим концом');

-- English
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'scary_stories', 'en', 'name', 'Scary Stories'),
('scenario_card', 'scary_stories', 'en', 'description', 'Spooky tales and mysteries with happy endings');

-- Spanish
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'scary_stories', 'es', 'name', 'Historias de miedo'),
('scenario_card', 'scary_stories', 'es', 'description', 'Cuentos espeluznantes y misterios con finales felices');
