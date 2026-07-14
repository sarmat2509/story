-- Migration: Add the families and cultures scenario card
-- Created: 2026-07-14
--
-- Adds an inclusive theme for multiracial, multicultural, and multilingual families.
-- Binding guidance carries representation guardrails; plot examples stay loose so the
-- Writer remains free to invent the genre, conflict, events, and resolution.

INSERT INTO scenario_cards (
  id,
  name_key,
  description_key,
  icon,
  prompt_guidance,
  suggested_goals,
  age_groups,
  sort_order,
  is_active
) VALUES (
  'families_cultures',
  'scenario_cards.families_cultures.name',
  'scenario_cards.families_cultures.description',
  '🫶',
  'Stories about children and families whose members may have different skin tones, ethnic or cultural roots, national backgrounds, or home languages. Treat this identity as a natural part of family life and belonging, not as a problem that every story must solve. The story may be magical, adventurous, funny, mysterious, or everyday. Keep named cultures specific, let multiple identities coexist without forcing an either-or choice, and avoid stereotypes, exoticism, colorism, accent jokes, or assumptions about personality and ability.',
  '["empathy", "kindness", "friendship", "adapting_to_new", "respect_elders"]',
  '["4-5", "6-8", "9-12"]',
  17,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name_key = EXCLUDED.name_key,
  description_key = EXCLUDED.description_key,
  icon = EXCLUDED.icon,
  prompt_guidance = EXCLUDED.prompt_guidance,
  suggested_goals = EXCLUDED.suggested_goals,
  age_groups = EXCLUDED.age_groups,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'families_cultures', 'uk', 'name', 'Родини й культури'),
('scenario_card', 'families_cultures', 'uk', 'description', 'Історії про родини з різним корінням, мовами й відтінками шкіри'),
('scenario_card', 'families_cultures', 'ru', 'name', 'Семьи и культуры'),
('scenario_card', 'families_cultures', 'ru', 'description', 'Истории о семьях с разными корнями, языками и оттенками кожи'),
('scenario_card', 'families_cultures', 'en', 'name', 'Families & Cultures'),
('scenario_card', 'families_cultures', 'en', 'description', 'Stories about families with different roots, languages, and skin tones'),
('scenario_card', 'families_cultures', 'es', 'name', 'Familias y culturas'),
('scenario_card', 'families_cultures', 'es', 'description', 'Historias sobre familias con distintas raíces, idiomas y tonos de piel'),
('scenario_card', 'families_cultures', 'de', 'name', 'Familien und Kulturen'),
('scenario_card', 'families_cultures', 'de', 'description', 'Geschichten über Familien mit unterschiedlichen Wurzeln, Sprachen und Hautfarben'),
('scenario_card', 'families_cultures', 'fr', 'name', 'Familles et cultures'),
('scenario_card', 'families_cultures', 'fr', 'description', 'Des histoires de familles aux origines, langues et couleurs de peau différentes'),
('scenario_card', 'families_cultures', 'pl', 'name', 'Rodziny i kultury'),
('scenario_card', 'families_cultures', 'pl', 'description', 'Historie o rodzinach o różnych korzeniach, językach i kolorach skóry')
ON CONFLICT (entity_type, entity_id, locale, field_name) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

DELETE FROM scenario_plot_examples
WHERE scenario_card_id = 'families_cultures';

INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('families_cultures', 'In a family whose members have different skin tones, a child becomes curious about the many ways people can resemble one another.', 1),
('families_cultures', 'A Filipino American child hears one family story told differently by relatives in the Philippines and the United States.', 2),
('families_cultures', 'In a French-Algerian family, one familiar feeling has different names in French and Arabic.', 3),
('families_cultures', 'Two sides of a family pronounce the child''s name differently, and both versions carry affection and history.', 4),
('families_cultures', 'Siblings who do not look alike are mistaken for strangers during an otherwise ordinary day together.', 5),
('families_cultures', 'A family-tree or self-portrait project does not have an obvious place for all of a child''s roots.', 6),
('families_cultures', 'A child and grandparent do not share the same strongest language but want to understand something important about each other.', 7),
('families_cultures', 'Before visiting relatives in another country, a child wonders which parts of home will feel familiar there.', 8),
('families_cultures', 'A casual question about where a child is “really from” opens an unexpected question about belonging.', 9),
('families_cultures', 'Family members with different hair textures turn an everyday getting-ready moment into shared discovery.', 10),
('families_cultures', 'Old family photographs reveal changing countries, languages, and skin tones alongside one small resemblance across generations.', 11),
('families_cultures', 'A child is unsure whether to share a family word, name, or everyday custom that classmates have not encountered before.', 12),
('families_cultures', 'A child moves between two homes or branches of a family that speak, cook, or spend time in different ways.', 13),
('families_cultures', 'A bedtime tale begins collecting words and images from every language spoken in the family.', 14),
('families_cultures', 'In a magical place, different names for the same object reveal different paths without making any one language the correct one.', 15),
('families_cultures', 'An adult is learning another family member''s language, and a small mistake becomes a moment of patience rather than ridicule.', 16),
('families_cultures', 'A multiracial or adoptive family looks for a way to honor a child''s roots without defining the child only by them.', 17),
('families_cultures', 'A family choosing a name for a new baby wants it to carry more than one branch of the family.', 18),
('families_cultures', 'A neighborhood or school activity asks every family to choose one simple label, but one child needs room for several.', 19),
('families_cultures', 'A child imagines an adventure hero who can reflect the many faces, voices, and roots found in one family.', 20);

DELETE FROM scenario_world_rules
WHERE scenario_card_id = 'families_cultures';

INSERT INTO scenario_world_rules (scenario_card_id, name, description, sort_order) VALUES
('families_cultures', 'Identity Is Context Rule', 'A multiracial, multicultural, or multilingual identity is a natural part of the characters'' lives. It does not have to become the story''s problem, lesson, or conflict.', 1),
('families_cultures', 'Self-Identification Rule', 'Characters and families describe their own identities in the terms they use for themselves. The narrator does not assign a label from appearance alone.', 2),
('families_cultures', 'Specific Not Generic Rule', 'When the story names a culture, country, ethnicity, or language, details belong to that specific family context rather than a blended or generic “world culture.”', 3),
('families_cultures', 'No Stereotype Shortcut Rule', 'Skin tone, accent, clothing, food, hair, faith, or nationality never determines personality, intelligence, wealth, behavior, or narrative role.', 4),
('families_cultures', 'No Either-Or Rule', 'A child with several roots never has to reject one identity to prove another. Belonging can be multiple, changing, and personal.', 5),
('families_cultures', 'Family Resemblance Rule', 'Family belonging is shown through care, memory, habits, humor, and shared life as well as appearance or biology.', 6),
('families_cultures', 'Language Dignity Rule', 'Accents, code-switching, forgotten words, and language learning are treated warmly. A child is not made solely responsible for high-stakes adult translation.', 7),
('families_cultures', 'Supported Fairness Rule', 'If prejudice, racism, colorism, or exclusion appears, it is clearly unfair, caring adults or allies provide support, and the child is not required to educate everyone alone.', 8),
('families_cultures', 'Living Culture Rule', 'Culture appears in contemporary everyday life, relationships, choices, and imagination—not only through holidays, costumes, ancient tales, or food.', 9),
('families_cultures', 'Selected Identity Stays Rule', 'Preserve the user-provided characters'' skin tones, features, family relationships, names, and cultural or language details; do not replace them with generic identities.', 10);
