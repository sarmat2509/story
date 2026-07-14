-- Migration: Separate holiday theme guardrails from loose creative premise seeds
-- Created: 2026-07-14
--
-- Keep durable cultural guidance on the scenario card and preserve existing plot-example
-- UUIDs while replacing mini-synopses with open-ended directions for the Writer.

UPDATE scenario_cards
SET prompt_guidance = 'Choose one specifically named holiday or tradition and one family or community context. Show its meaning through relationships and lived participation. Treat observances as family-specific; keep religious and secular practices distinct, avoid mixing unrelated customs or stereotypes, and never turn sacred elements into magical props or comic obstacles.'
WHERE id = 'holidays_traditions';

UPDATE scenario_plot_examples AS example
SET setting = replacement.setting
FROM (VALUES
  (1, 'Christmas: a child joins one tradition practiced by their family or community, but an unexpected change makes the familiar celebration feel new.'),
  (2, 'Easter: during one tradition chosen for this family, a small preparation does not go as expected and brings different generations together.'),
  (3, 'New Year: a family is preparing to welcome the year in its own way when one important plan must suddenly change.'),
  (4, 'Lunar New Year: in one specifically named community, a child takes part in a family tradition and notices something they had never understood before.'),
  (5, 'Diwali: in one specifically identified family or faith context, a child wants to contribute but is unsure where their help truly belongs.'),
  (6, 'Eid al-Fitr: as a family prepares for the celebration, a child''s small responsibility connects them with someone they did not expect to meet.'),
  (7, 'Hanukkah: a familiar family object or story raises a question that sends a child looking for an answer across generations.'),
  (8, 'Nowruz: while preparing for the new year, a child discovers that one familiar family custom carries different meanings for different relatives.'),
  (9, 'Día de Muertos: while a family prepares to remember loved ones, a photograph or story prompts a child''s unexpected question.'),
  (10, 'Mid-Autumn Festival: in one specifically named community, a child looks for a way to feel close to a relative who is far away.'),
  (11, 'Holi: at a family or community celebration, a child and a friend discover they have different ideas about how they want to take part.'),
  (12, 'Saint Nicholas Day: before the celebration, a child becomes curious about a small act of kindness happening secretly in their neighborhood.'),
  (13, 'Carnival: while preparing for one specifically named carnival tradition, several children disagree about what their shared contribution should become.'),
  (14, 'Harvest or thanksgiving celebration: at one specifically named observance, a shared dish makes a child curious about the many people and places behind it.'),
  (15, 'Midsummer: during one named local tradition, a change in weather or plans leads a child to notice the season in a new way.'),
  (16, 'Songkran: a child encounters two very different ways water is used during the celebration and becomes curious about their meanings.'),
  (17, 'Obon: while a family prepares for the observance, a lantern, dance, object, or story makes a child curious about a relative they never knew.'),
  (18, 'Kwanzaa: one of the seven principles unexpectedly connects a family celebration with a small challenge in the child''s everyday life.'),
  (19, 'Cultural sharing day: several children want to share family traditions, but a simple question reveals that not every custom fits neatly on display.'),
  (20, 'A family that has moved or welcomed a new relative wonders how a beloved tradition can make room for change without losing its roots.')
) AS replacement(sort_order, setting)
WHERE example.scenario_card_id = 'holidays_traditions'
  AND example.sort_order = replacement.sort_order;
