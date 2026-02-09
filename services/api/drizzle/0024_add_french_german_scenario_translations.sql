-- Migration: Add French and German translations for scenario cards
-- Created: 2026-02-04

-- French translations
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
-- magic_wizards
('scenario_card', 'magic_wizards', 'fr', 'name', 'Magie et sorciers'),
('scenario_card', 'magic_wizards', 'fr', 'description', 'Aventures magiques avec sorts et sorcellerie'),

-- fantasy_creatures
('scenario_card', 'fantasy_creatures', 'fr', 'name', 'Créatures fantastiques'),
('scenario_card', 'fantasy_creatures', 'fr', 'description', 'Rencontre avec des créatures mythiques et fantastiques'),

-- mysteries_detectives
('scenario_card', 'mysteries_detectives', 'fr', 'name', 'Mystères et détectives'),
('scenario_card', 'mysteries_detectives', 'fr', 'description', 'Résolution de mystères et découverte de secrets'),

-- space_odyssey
('scenario_card', 'space_odyssey', 'fr', 'name', 'Odyssée spatiale'),
('scenario_card', 'space_odyssey', 'fr', 'description', 'Voyages entre les étoiles et les planètes'),

-- medieval_heroes
('scenario_card', 'medieval_heroes', 'fr', 'name', 'Héros médiévaux'),
('scenario_card', 'medieval_heroes', 'fr', 'description', 'Aventures de chevaliers et de princesses'),

-- sea_treasures
('scenario_card', 'sea_treasures', 'fr', 'name', 'Trésors de la mer'),
('scenario_card', 'sea_treasures', 'fr', 'description', 'Recherche de trésors en mer'),

-- super_powers
('scenario_card', 'super_powers', 'fr', 'name', 'Super pouvoirs'),
('scenario_card', 'super_powers', 'fr', 'description', 'Héros avec des super pouvoirs'),

-- enchanted_forest
('scenario_card', 'enchanted_forest', 'fr', 'name', 'Forêt enchantée'),
('scenario_card', 'enchanted_forest', 'fr', 'description', 'Aventures dans une forêt enchantée'),

-- inventors
('scenario_card', 'inventors', 'fr', 'name', 'Inventeurs'),
('scenario_card', 'inventors', 'fr', 'description', 'Découvertes scientifiques et expériences'),

-- jungle_adventures
('scenario_card', 'jungle_adventures', 'fr', 'name', 'Aventures dans la jungle'),
('scenario_card', 'jungle_adventures', 'fr', 'description', 'Explorer des lieux exotiques'),

-- scary_stories
('scenario_card', 'scary_stories', 'fr', 'name', 'Histoires effrayantes'),
('scenario_card', 'scary_stories', 'fr', 'description', 'Contes effrayants et mystères avec des fins heureuses');


-- German translations
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
-- magic_wizards
('scenario_card', 'magic_wizards', 'de', 'name', 'Magie und Zauberer'),
('scenario_card', 'magic_wizards', 'de', 'description', 'Magische Abenteuer mit Zaubersprüchen und Hexerei'),

-- fantasy_creatures
('scenario_card', 'fantasy_creatures', 'de', 'name', 'Fantastische Kreaturen'),
('scenario_card', 'fantasy_creatures', 'de', 'description', 'Begegnung mit mythischen und fantastischen Wesen'),

-- mysteries_detectives
('scenario_card', 'mysteries_detectives', 'de', 'name', 'Geheimnisse und Detektive'),
('scenario_card', 'mysteries_detectives', 'de', 'description', 'Rätsel lösen und Geheimnisse aufdecken'),

-- space_odyssey
('scenario_card', 'space_odyssey', 'de', 'name', 'Weltraum-Odyssee'),
('scenario_card', 'space_odyssey', 'de', 'description', 'Reisen zwischen Sternen und Planeten'),

-- medieval_heroes
('scenario_card', 'medieval_heroes', 'de', 'name', 'Mittelalterliche Helden'),
('scenario_card', 'medieval_heroes', 'de', 'description', 'Abenteuer von Rittern und Prinzessinnen'),

-- sea_treasures
('scenario_card', 'sea_treasures', 'de', 'name', 'Meeresschätze'),
('scenario_card', 'sea_treasures', 'de', 'description', 'Auf der Suche nach Schätzen auf See'),

-- super_powers
('scenario_card', 'super_powers', 'de', 'name', 'Superkräfte'),
('scenario_card', 'super_powers', 'de', 'description', 'Helden mit Superkräften'),

-- enchanted_forest
('scenario_card', 'enchanted_forest', 'de', 'name', 'Verzauberter Wald'),
('scenario_card', 'enchanted_forest', 'de', 'description', 'Abenteuer in einem verzauberten Wald'),

-- inventors
('scenario_card', 'inventors', 'de', 'name', 'Erfinder'),
('scenario_card', 'inventors', 'de', 'description', 'Wissenschaftliche Entdeckungen und Experimente'),

-- jungle_adventures
('scenario_card', 'jungle_adventures', 'de', 'name', 'Dschungelabenteuer'),
('scenario_card', 'jungle_adventures', 'de', 'description', 'Erkundung exotischer Orte'),

-- scary_stories
('scenario_card', 'scary_stories', 'de', 'name', 'Gruselgeschichten'),
('scenario_card', 'scary_stories', 'de', 'description', 'Gruselige Geschichten und Rätsel mit gutem Ende');
