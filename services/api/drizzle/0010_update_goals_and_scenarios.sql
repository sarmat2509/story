-- ==========================================
-- Migration 0010: Update Goals and Scenario Cards
-- ==========================================
-- This migration:
-- 1. Adds 5 new moral Goals extracted from old scenario cards
-- 2. Deletes old scenario cards (life situations)
-- 3. Adds new scenario cards (plot themes/genres)
-- 4. Updates all translations accordingly

-- ==========================================
-- PART 1: Add 5 New Goals
-- ==========================================

INSERT INTO story_goals (slug, name, description, prompt_guidance, min_age, sort_order) VALUES
('overcoming_fears', 'Overcoming Fears', 'Learning to face and overcome fears with courage and support', 'Show character experiencing fear (age-appropriate), finding support from family/friends, trying gradual steps, and feeling proud. Never minimize the fear - validate it first, then show gentle path forward.', 4, 12),
('responsibility', 'Responsibility', 'Learning to take care of others and fulfill commitments', 'Show character taking on age-appropriate responsibility (pet, younger sibling, task), experiencing challenges, learning through gentle mistakes, and feeling proud of caring for others.', 4, 13),
('respect_elders', 'Respect for Elders', 'Showing respect and appreciation for older family members', 'Show warm intergenerational relationships, child learning from elders'' wisdom and stories, helping elderly with respect, and appreciating their experience and love.', 2, 14),
('adapting_to_new', 'Adapting to New Situations', 'Learning to adjust to new environments and experiences', 'Show character facing new situation (school, home, activity), initial nervousness, finding familiar elements, making connections, and discovering new experiences can be positive.', 4, 15),
('persistence', 'Persistence', 'Learning to keep trying despite challenges', 'Show character facing challenge, experiencing frustration, trying different approaches, perhaps asking for help, continuing effort, and achieving goal or learning from attempt.', 4, 16);

-- ==========================================
-- PART 2: Add Translations for New Goals
-- ==========================================

-- overcoming_fears
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'overcoming_fears', 'uk', 'name', 'Подолання страхів'),
('story_goal', 'overcoming_fears', 'uk', 'description', 'Навчання долати страхи зі сміливістю та підтримкою'),
('story_goal', 'overcoming_fears', 'ru', 'name', 'Преодоление страхов'),
('story_goal', 'overcoming_fears', 'ru', 'description', 'Обучение преодолевать страхи с храбростью и поддержкой'),
('story_goal', 'overcoming_fears', 'en', 'name', 'Overcoming Fears'),
('story_goal', 'overcoming_fears', 'en', 'description', 'Learning to face and overcome fears with courage and support'),
('story_goal', 'overcoming_fears', 'es', 'name', 'Superación de miedos'),
('story_goal', 'overcoming_fears', 'es', 'description', 'Aprender a enfrentar y superar los miedos con valentía y apoyo');

-- responsibility
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'responsibility', 'uk', 'name', 'Відповідальність'),
('story_goal', 'responsibility', 'uk', 'description', 'Навчання піклуватися про інших та виконувати зобов''язання'),
('story_goal', 'responsibility', 'ru', 'name', 'Ответственность'),
('story_goal', 'responsibility', 'ru', 'description', 'Обучение заботиться о других и выполнять обязательства'),
('story_goal', 'responsibility', 'en', 'name', 'Responsibility'),
('story_goal', 'responsibility', 'en', 'description', 'Learning to take care of others and fulfill commitments'),
('story_goal', 'responsibility', 'es', 'name', 'Responsabilidad'),
('story_goal', 'responsibility', 'es', 'description', 'Aprender a cuidar de otros y cumplir compromisos');

-- respect_elders
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'respect_elders', 'uk', 'name', 'Повага до старших'),
('story_goal', 'respect_elders', 'uk', 'description', 'Прояв поваги та вдячності до старших членів сім''ї'),
('story_goal', 'respect_elders', 'ru', 'name', 'Уважение к старшим'),
('story_goal', 'respect_elders', 'ru', 'description', 'Проявление уважения и благодарности к старшим членам семьи'),
('story_goal', 'respect_elders', 'en', 'name', 'Respect for Elders'),
('story_goal', 'respect_elders', 'en', 'description', 'Showing respect and appreciation for older family members'),
('story_goal', 'respect_elders', 'es', 'name', 'Respeto a los mayores'),
('story_goal', 'respect_elders', 'es', 'description', 'Mostrar respeto y aprecio por los miembros mayores de la familia');

-- adapting_to_new
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'adapting_to_new', 'uk', 'name', 'Адаптація до нового'),
('story_goal', 'adapting_to_new', 'uk', 'description', 'Навчання пристосовуватися до нових середовищ та досвіду'),
('story_goal', 'adapting_to_new', 'ru', 'name', 'Адаптация к новому'),
('story_goal', 'adapting_to_new', 'ru', 'description', 'Обучение приспосабливаться к новым средам и опыту'),
('story_goal', 'adapting_to_new', 'en', 'name', 'Adapting to New Situations'),
('story_goal', 'adapting_to_new', 'en', 'description', 'Learning to adjust to new environments and experiences'),
('story_goal', 'adapting_to_new', 'es', 'name', 'Adaptación a lo nuevo'),
('story_goal', 'adapting_to_new', 'es', 'description', 'Aprender a adaptarse a nuevos entornos y experiencias');

-- persistence
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('story_goal', 'persistence', 'uk', 'name', 'Наполегливість'),
('story_goal', 'persistence', 'uk', 'description', 'Навчання продовжувати намагатися, незважаючи на труднощі'),
('story_goal', 'persistence', 'ru', 'name', 'Настойчивость'),
('story_goal', 'persistence', 'ru', 'description', 'Обучение продолжать попытки несмотря на трудности'),
('story_goal', 'persistence', 'en', 'name', 'Persistence'),
('story_goal', 'persistence', 'en', 'description', 'Learning to keep trying despite challenges'),
('story_goal', 'persistence', 'es', 'name', 'Perseverancia'),
('story_goal', 'persistence', 'es', 'description', 'Aprender a seguir intentando a pesar de los desafíos');

-- ==========================================
-- PART 3: Delete Old Scenario Cards
-- ==========================================

-- Delete translations for old scenario cards
DELETE FROM translations WHERE entity_type = 'scenario_card';

-- Delete old scenario cards
DELETE FROM scenario_cards;

-- ==========================================
-- PART 4: Add New Scenario Cards (Plot Themes)
-- ==========================================

INSERT INTO scenario_cards (id, name_key, description_key, icon, suggested_goals, age_groups, sort_order, is_active) VALUES
('magic_wizards', 'scenario_cards.magic_wizards.name', 'scenario_cards.magic_wizards.description', '🧙', '["courage", "friendship", "persistence"]', '["4-5", "6-8", "9-12"]', 1, true),
('fantasy_creatures', 'scenario_cards.fantasy_creatures.name', 'scenario_cards.fantasy_creatures.description', '🐉', '["kindness", "empathy", "courage"]', '["4-5", "6-8", "9-12"]', 2, true),
('mysteries_detectives', 'scenario_cards.mysteries_detectives.name', 'scenario_cards.mysteries_detectives.description', '🔍', '["persistence", "self_reliance", "adapting_to_new"]', '["6-8", "9-12"]', 3, true),
('space_odyssey', 'scenario_cards.space_odyssey.name', 'scenario_cards.space_odyssey.description', '🚀', '["courage", "friendship", "self_reliance"]', '["6-8", "9-12"]', 4, true),
('medieval_heroes', 'scenario_cards.medieval_heroes.name', 'scenario_cards.medieval_heroes.description', '⚔️', '["courage", "friendship", "responsibility"]', '["6-8", "9-12"]', 5, true),
('sea_treasures', 'scenario_cards.sea_treasures.name', 'scenario_cards.sea_treasures.description', '🏴‍☠️', '["courage", "friendship", "persistence"]', '["6-8", "9-12"]', 6, true),
('super_powers', 'scenario_cards.super_powers.name', 'scenario_cards.super_powers.description', '🦸', '["courage", "responsibility", "kindness"]', '["6-8", "9-12"]', 7, true),
('enchanted_forest', 'scenario_cards.enchanted_forest.name', 'scenario_cards.enchanted_forest.description', '🌲', '["courage", "friendship", "overcoming_fears"]', '["4-5", "6-8", "9-12"]', 8, true),
('inventors', 'scenario_cards.inventors.name', 'scenario_cards.inventors.description', '🔬', '["persistence", "self_reliance", "adapting_to_new"]', '["6-8", "9-12"]', 9, true),
('jungle_adventures', 'scenario_cards.jungle_adventures.name', 'scenario_cards.jungle_adventures.description', '🌴', '["courage", "friendship", "adapting_to_new"]', '["6-8", "9-12"]', 10, true);

-- ==========================================
-- PART 5: Add Translations for New Scenario Cards
-- ==========================================

-- magic_wizards
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'magic_wizards', 'uk', 'name', 'Магія і чарівники'),
('scenario_card', 'magic_wizards', 'uk', 'description', 'Чаклунські пригоди з магічними заклинаннями'),
('scenario_card', 'magic_wizards', 'ru', 'name', 'Магия и волшебники'),
('scenario_card', 'magic_wizards', 'ru', 'description', 'Волшебные приключения с магическими заклинаниями'),
('scenario_card', 'magic_wizards', 'en', 'name', 'Magic and Wizards'),
('scenario_card', 'magic_wizards', 'en', 'description', 'Magical adventures with spells and wizardry'),
('scenario_card', 'magic_wizards', 'es', 'name', 'Magia y magos'),
('scenario_card', 'magic_wizards', 'es', 'description', 'Aventuras mágicas con hechizos y brujería');

-- fantasy_creatures
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'fantasy_creatures', 'uk', 'name', 'Фантастичні створіння'),
('scenario_card', 'fantasy_creatures', 'uk', 'description', 'Зустріч з казковими істотами'),
('scenario_card', 'fantasy_creatures', 'ru', 'name', 'Фантастические существа'),
('scenario_card', 'fantasy_creatures', 'ru', 'description', 'Встреча со сказочными существами'),
('scenario_card', 'fantasy_creatures', 'en', 'name', 'Fantasy Creatures'),
('scenario_card', 'fantasy_creatures', 'en', 'description', 'Meeting mythical and fantasy beings'),
('scenario_card', 'fantasy_creatures', 'es', 'name', 'Criaturas fantásticas'),
('scenario_card', 'fantasy_creatures', 'es', 'description', 'Encuentro con criaturas míticas y fantásticas');

-- mysteries_detectives
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'mysteries_detectives', 'uk', 'name', 'Таємниці і детективи'),
('scenario_card', 'mysteries_detectives', 'uk', 'description', 'Розкриття загадок та секретів'),
('scenario_card', 'mysteries_detectives', 'ru', 'name', 'Тайны и детективы'),
('scenario_card', 'mysteries_detectives', 'ru', 'description', 'Раскрытие загадок и секретов'),
('scenario_card', 'mysteries_detectives', 'en', 'name', 'Mysteries and Detectives'),
('scenario_card', 'mysteries_detectives', 'en', 'description', 'Solving mysteries and uncovering secrets'),
('scenario_card', 'mysteries_detectives', 'es', 'name', 'Misterios y detectives'),
('scenario_card', 'mysteries_detectives', 'es', 'description', 'Resolviendo misterios y descubriendo secretos');

-- space_odyssey
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'space_odyssey', 'uk', 'name', 'Космічна одіссея'),
('scenario_card', 'space_odyssey', 'uk', 'description', 'Подорожі між зірками та планетами'),
('scenario_card', 'space_odyssey', 'ru', 'name', 'Космическая одиссея'),
('scenario_card', 'space_odyssey', 'ru', 'description', 'Путешествия между звёздами и планетами'),
('scenario_card', 'space_odyssey', 'en', 'name', 'Space Odyssey'),
('scenario_card', 'space_odyssey', 'en', 'description', 'Journeys between stars and planets'),
('scenario_card', 'space_odyssey', 'es', 'name', 'Odisea espacial'),
('scenario_card', 'space_odyssey', 'es', 'description', 'Viajes entre estrellas y planetas');

-- medieval_heroes
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'medieval_heroes', 'uk', 'name', 'Середньовічні герої'),
('scenario_card', 'medieval_heroes', 'uk', 'description', 'Пригоди лицарів та принцес'),
('scenario_card', 'medieval_heroes', 'ru', 'name', 'Средневековые герои'),
('scenario_card', 'medieval_heroes', 'ru', 'description', 'Приключения рыцарей и принцесс'),
('scenario_card', 'medieval_heroes', 'en', 'name', 'Medieval Heroes'),
('scenario_card', 'medieval_heroes', 'en', 'description', 'Knights and princesses adventures'),
('scenario_card', 'medieval_heroes', 'es', 'name', 'Héroes medievales'),
('scenario_card', 'medieval_heroes', 'es', 'description', 'Aventuras de caballeros y princesas');

-- sea_treasures
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'sea_treasures', 'uk', 'name', 'Морські скарби'),
('scenario_card', 'sea_treasures', 'uk', 'description', 'Пошук скарбів на морі'),
('scenario_card', 'sea_treasures', 'ru', 'name', 'Морские сокровища'),
('scenario_card', 'sea_treasures', 'ru', 'description', 'Поиск сокровищ на море'),
('scenario_card', 'sea_treasures', 'en', 'name', 'Sea Treasures'),
('scenario_card', 'sea_treasures', 'en', 'description', 'Searching for treasures at sea'),
('scenario_card', 'sea_treasures', 'es', 'name', 'Tesoros del mar'),
('scenario_card', 'sea_treasures', 'es', 'description', 'Búsqueda de tesoros en el mar');

-- super_powers
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'super_powers', 'uk', 'name', 'Надзвичайні сили'),
('scenario_card', 'super_powers', 'uk', 'description', 'Герої з суперздібностями'),
('scenario_card', 'super_powers', 'ru', 'name', 'Сверхспособности'),
('scenario_card', 'super_powers', 'ru', 'description', 'Герои со сверхспособностями'),
('scenario_card', 'super_powers', 'en', 'name', 'Super Powers'),
('scenario_card', 'super_powers', 'en', 'description', 'Heroes with superpowers'),
('scenario_card', 'super_powers', 'es', 'name', 'Superpoderes'),
('scenario_card', 'super_powers', 'es', 'description', 'Héroes con superpoderes');

-- enchanted_forest
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'enchanted_forest', 'uk', 'name', 'Чарівний ліс'),
('scenario_card', 'enchanted_forest', 'uk', 'description', 'Пригоди в зачарованому лісі'),
('scenario_card', 'enchanted_forest', 'ru', 'name', 'Волшебный лес'),
('scenario_card', 'enchanted_forest', 'ru', 'description', 'Приключения в заколдованном лесу'),
('scenario_card', 'enchanted_forest', 'en', 'name', 'Enchanted Forest'),
('scenario_card', 'enchanted_forest', 'en', 'description', 'Adventures in an enchanted forest'),
('scenario_card', 'enchanted_forest', 'es', 'name', 'Bosque encantado'),
('scenario_card', 'enchanted_forest', 'es', 'description', 'Aventuras en un bosque encantado');

-- inventors
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'inventors', 'uk', 'name', 'Винахідники'),
('scenario_card', 'inventors', 'uk', 'description', 'Наукові відкриття та експерименти'),
('scenario_card', 'inventors', 'ru', 'name', 'Изобретатели'),
('scenario_card', 'inventors', 'ru', 'description', 'Научные открытия и эксперименты'),
('scenario_card', 'inventors', 'en', 'name', 'Inventors'),
('scenario_card', 'inventors', 'en', 'description', 'Scientific discoveries and experiments'),
('scenario_card', 'inventors', 'es', 'name', 'Inventores'),
('scenario_card', 'inventors', 'es', 'description', 'Descubrimientos científicos y experimentos');

-- jungle_adventures
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'jungle_adventures', 'uk', 'name', 'Пригоди у джунглях'),
('scenario_card', 'jungle_adventures', 'uk', 'description', 'Дослідження екзотичних місць'),
('scenario_card', 'jungle_adventures', 'ru', 'name', 'Приключения в джунглях'),
('scenario_card', 'jungle_adventures', 'ru', 'description', 'Исследование экзотических мест'),
('scenario_card', 'jungle_adventures', 'en', 'name', 'Jungle Adventures'),
('scenario_card', 'jungle_adventures', 'en', 'description', 'Exploring exotic places'),
('scenario_card', 'jungle_adventures', 'es', 'name', 'Aventuras en la jungla'),
('scenario_card', 'jungle_adventures', 'es', 'description', 'Explorando lugares exóticos');
