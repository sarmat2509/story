-- Migration: Add holidays and traditions scenario card
-- Created: 2026-07-14
--
-- Adds a culturally grounded story theme with plot examples, world rules,
-- and translations for every supported UI locale.

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
  'holidays_traditions',
  'scenario_cards.holidays_traditions.name',
  'scenario_cards.holidays_traditions.description',
  '🎊',
  'Celebration stories about Christmas, Easter, New Year, and holidays from specific cultures and communities. Ground each story in one named tradition and show its meaning through family, preparation, generosity, remembrance, gratitude, or renewal. Respect religious and cultural practices, acknowledge family variation, and never blend unrelated customs into a generic exotic festival.',
  '["kindness", "empathy", "friendship", "responsibility", "adapting_to_new"]',
  '["4-5", "6-8", "9-12"]',
  16,
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
('scenario_card', 'holidays_traditions', 'uk', 'name', 'Свята й традиції'),
('scenario_card', 'holidays_traditions', 'uk', 'description', 'Історії про Різдво, Великдень, Новий рік і свята народів світу'),
('scenario_card', 'holidays_traditions', 'ru', 'name', 'Праздники и традиции'),
('scenario_card', 'holidays_traditions', 'ru', 'description', 'Истории о Рождестве, Пасхе, Новом годе и праздниках народов мира'),
('scenario_card', 'holidays_traditions', 'en', 'name', 'Holidays & Traditions'),
('scenario_card', 'holidays_traditions', 'en', 'description', 'Stories about Christmas, Easter, New Year, and celebrations around the world'),
('scenario_card', 'holidays_traditions', 'es', 'name', 'Fiestas y tradiciones'),
('scenario_card', 'holidays_traditions', 'es', 'description', 'Historias sobre Navidad, Pascua, Año Nuevo y celebraciones de todo el mundo'),
('scenario_card', 'holidays_traditions', 'de', 'name', 'Feste und Traditionen'),
('scenario_card', 'holidays_traditions', 'de', 'description', 'Geschichten über Weihnachten, Ostern, Neujahr und Feste aus aller Welt'),
('scenario_card', 'holidays_traditions', 'fr', 'name', 'Fêtes et traditions'),
('scenario_card', 'holidays_traditions', 'fr', 'description', 'Histoires de Noël, de Pâques, du Nouvel An et de célébrations du monde entier'),
('scenario_card', 'holidays_traditions', 'pl', 'name', 'Święta i tradycje'),
('scenario_card', 'holidays_traditions', 'pl', 'description', 'Historie o Bożym Narodzeniu, Wielkanocy, Nowym Roku i świętach z całego świata')
ON CONFLICT (entity_type, entity_id, locale, field_name) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

DELETE FROM scenario_plot_examples
WHERE scenario_card_id = 'holidays_traditions';

INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('holidays_traditions', 'Christmas: choose one family or community tradition, such as decorating a tree, preparing a Nativity play, singing carols, sharing a meal, or delivering a gift anonymously. A missing preparation becomes an opportunity for generosity and cooperation. Keep religious and secular observances distinct according to the chosen family.', 1),
('holidays_traditions', 'Easter: choose a tradition practiced by the specific family, such as decorating pysanky or other eggs, preparing a basket, baking festive bread, attending a service, or holding a spring egg hunt. The plot turns on patience, renewal, or sharing; do not assume every family observes Easter in the same way.', 2),
('holidays_traditions', 'New Year: preparations for a countdown, first sunrise, family meal, or local custom go off schedule. The characters learn that different places welcome the new year at different times and create one thoughtful hope or responsibility for the year ahead.', 3),
('holidays_traditions', 'Lunar New Year: choose one specific community—for example Chinese New Year, Vietnamese Tết, or Korean Seollal—and use customs accurate to that community, such as reunion, cleaning, greetings, food, envelopes, lanterns, or honoring elders. Do not merge the three celebrations.', 4),
('holidays_traditions', 'Diwali: choose a Hindu, Jain, or Sikh family context and portray customs appropriate to it, such as cleaning, rangoli, diyas, prayer, visiting, sweets, or giving. A small act of care helps the celebration express light, welcome, or renewal without turning sacred symbols into magic props.', 5),
('holidays_traditions', 'Eid al-Fitr: a family completes Ramadan and prepares for Eid through charity, prayer, greetings, new or best clothes, visiting, and a shared meal. The child helps solve a practical preparation problem and learns why generosity and community matter; keep fasting expectations age-appropriate.', 6),
('holidays_traditions', 'Hanukkah: a Jewish family prepares to light the hanukkiah, share food, play dreidel, or visit relatives. The plot uses patience, memory, and family participation, while the historical or religious meaning is explained simply and ritual objects are treated respectfully.', 7),
('holidays_traditions', 'Nowruz: an Iranian, Persian, Kurdish, Central Asian, or other specific observing family prepares for the spring new year. Choose customs accurate to that family, such as spring cleaning, a Haft-Seen table, visits, music, or outdoor time, and make renewal or reconciliation drive the story.', 8),
('holidays_traditions', 'Día de Muertos: in a specific Mexican family or community, characters prepare an ofrenda, flowers, food, photographs, or a cemetery visit to remember loved ones. A missing memory is recovered through a relative’s story; keep the tone warm and reflective, not spooky.', 9),
('holidays_traditions', 'Mid-Autumn Festival: choose a Chinese, Vietnamese, or other specific observing community and follow its own traditions of moon viewing, lanterns, mooncakes, stories, or family reunion. A handmade lantern or shared message helps someone far away feel included.', 10),
('holidays_traditions', 'Holi: in a specific Hindu family or community, preparations for the spring festival include color, music, visiting, food, or a local religious observance. The story makes consent, eye safety, and respect part of joyful color play, and explains the chosen tradition without stereotypes.', 11),
('holidays_traditions', 'Saint Nicholas Day: choose a Ukrainian or another specific European family tradition involving Saint Nicholas, small gifts, kindness, or helping neighbors. The hero discovers that a secret good deed matters more than receiving the expected treat.', 12),
('holidays_traditions', 'Carnival: choose one clearly named tradition—such as Brazilian Carnaval, a Caribbean carnival, or Venetian Carnevale—and portray its own music, craft, costume, and community context without mixing them. A group must finish one parade element by sharing different skills.', 13),
('holidays_traditions', 'Harvest or thanksgiving celebration: choose a specific local, national, religious, or family observance centered on gratitude and shared food. The characters trace who grew, transported, cooked, or served one dish and find a concrete way to thank or support them; avoid simplified colonial myths.', 14),
('holidays_traditions', 'Midsummer celebration: choose one named Nordic, Baltic, Slavic, or other local tradition and accurately use its flowers, songs, dancing, outdoor meal, or seasonal light. Keep fire and water activities supervised and age-safe, and do not present folklore as a fact shared by every community.', 15),
('holidays_traditions', 'Songkran: in a Thai family or community, characters prepare for the traditional new year through cleaning, respectful water traditions, visiting elders or temples, and community celebration. The plot distinguishes gentle blessing from water play and makes consent and safety part of the solution.', 16),
('holidays_traditions', 'Obon: in a Japanese family or community, lanterns, family stories, a visit, cleaning, food, or Bon Odori help honor ancestors. A child learns a dance or restores a family object with an elder; remembrance stays caring rather than frightening.', 17),
('holidays_traditions', 'Kwanzaa: an African American family focuses on one of the seven principles through lighting the kinara, storytelling, art, music, gifts, or community work. The plot puts that principle into action and does not describe Kwanzaa as a generic African holiday.', 18),
('holidays_traditions', 'Cultural sharing day: several children bring one tradition from their own families or communities. Each custom is introduced by someone who practices it, questions are asked respectfully, and the group presents the traditions side by side instead of blending sacred objects and symbols together.', 19),
('holidays_traditions', 'A family creates or adapts a tradition after moving, welcoming a new relative, or combining households. They speak with parents, grandparents, or community members about what must stay intact, then add one new personal ritual that honors rather than replaces its roots.', 20);

DELETE FROM scenario_world_rules
WHERE scenario_card_id = 'holidays_traditions';

INSERT INTO scenario_world_rules (scenario_card_id, name, description, sort_order) VALUES
('holidays_traditions', 'One Cultural Anchor Rule', 'Every story names and follows one specific family, culture, faith, country, or community. It never mixes unrelated customs into a generic festival.', 1),
('holidays_traditions', 'Meaning Before Spectacle Rule', 'Food, lights, clothes, gifts, music, and decorations connect to the celebration’s meaning or relationships instead of appearing only as exotic scenery.', 2),
('holidays_traditions', 'Family Variation Rule', 'Characters may explain that families and communities observe the same holiday differently. The story never claims that everyone from a country or faith follows one custom.', 3),
('holidays_traditions', 'Sacred Stays Sacred Rule', 'Prayer, ritual objects, ancestors, scripture, and sacred spaces are treated respectfully and never become magical weapons, comic props, or obstacles to defeat.', 4),
('holidays_traditions', 'Learn From Participants Rule', 'When a character is new to a tradition, they listen to a family member, elder, host, or community participant rather than guessing or taking over.', 5),
('holidays_traditions', 'Contribution Creates Belonging Rule', 'Belonging grows through an age-appropriate contribution such as preparing, helping, welcoming, making, remembering, thanking, or sharing.', 6),
('holidays_traditions', 'Calendar And Season Rule', 'The story respects the holiday’s real calendar and local season. Lunar dates and opposite-hemisphere seasons may differ from the character’s assumptions.', 7),
('holidays_traditions', 'No Costume Shortcut Rule', 'Culture is shown through people, meaning, language, memory, and action, not reduced to an accent, outfit, food joke, or visual stereotype.', 8),
('holidays_traditions', 'Welcome With Boundaries Rule', 'Guests ask before touching sacred objects, joining rituals, photographing people, using color or water, or changing a family practice.', 9),
('holidays_traditions', 'Tradition Can Grow Rule', 'Traditions can be preserved, adapted, or newly created through thoughtful family and community choices, while their origins are acknowledged honestly.', 10);
