-- Migration: Rename highest-tier plan-facing copy to Story World terminology
-- Created: 2026-07-04

UPDATE plans
SET
  name = 'Світ історій',
  description = 'Безмежний світ історій для всієї родини'
WHERE slug = 'fairyworld';

INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('plan', 'fairyworld', 'uk', 'name', 'Світ історій'),
('plan', 'fairyworld', 'uk', 'description', 'Безмежний світ історій для всієї родини'),
('plan', 'fairyworld', 'ru', 'name', 'Мир историй'),
('plan', 'fairyworld', 'ru', 'description', 'Безграничный мир историй для всей семьи'),
('plan', 'fairyworld', 'en', 'name', 'Story World'),
('plan', 'fairyworld', 'en', 'description', 'An endless world of stories for the whole family'),
('plan', 'fairyworld', 'es', 'name', 'Mundo de historias'),
('plan', 'fairyworld', 'es', 'description', 'Un mundo infinito de historias para toda la familia'),
('plan', 'fairyworld', 'fr', 'name', 'Monde des histoires'),
('plan', 'fairyworld', 'fr', 'description', 'Un monde infini d''histoires pour toute la famille'),
('plan', 'fairyworld', 'de', 'name', 'Geschichtenwelt'),
('plan', 'fairyworld', 'de', 'description', 'Eine grenzenlose Welt von Geschichten für die ganze Familie'),
('plan', 'fairyworld', 'pl', 'name', 'Świat historii'),
('plan', 'fairyworld', 'pl', 'description', 'Nieograniczony świat historii dla całej rodziny')
ON CONFLICT (entity_type, entity_id, locale, field_name) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
