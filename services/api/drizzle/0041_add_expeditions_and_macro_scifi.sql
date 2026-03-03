-- Migration: Add expeditions_world_travel and macro_scifi scenario cards
-- Created: 2026-03-03
--
-- Adds two new macro-scenarios:
-- 1. expeditions_world_travel - Expeditions & World Travel (mountains, arctic, countries)
-- 2. macro_scifi - Sci-Fi: time, technology, and future

-- ==========================================
-- 1. Scenario cards
-- ==========================================

INSERT INTO scenario_cards (id, name_key, description_key, icon, prompt_guidance, suggested_goals, age_groups, sort_order, is_active)
VALUES
(
  'expeditions_world_travel',
  'scenario_cards.expeditions_world_travel.name',
  'scenario_cards.expeditions_world_travel.description',
  '🗺️',
  'Routes through countries and wild landscapes: mountains, ice, coasts, deserts. Family road trips, cable cars, research stations, glacier walks, train journeys. Navigation challenges, weather windows, local knowledge, and analog tools when signals fail. Style examples: Around the World in 80 Days, Paddington, The Secret of the Old Clock travel sequences.',
  '["courage", "friendship", "adapting_to_new", "persistence"]',
  '["6-8", "9-12"]',
  12,
  true
),
(
  'macro_scifi',
  'scenario_cards.macro_scifi.name',
  'scenario_cards.macro_scifi.description',
  '🤖',
  'Adventures with technology, time jumps, and strange rules of reality. Smart cities, time loops, AI helpers, portals, memory clinics, VR simulations. Time costs, paradox pressure, glitches as clues. Style examples: A Wrinkle in Time, The Time Machine (adapted), Hugo, Meet the Robinsons.',
  '["courage", "persistence", "self_reliance", "adapting_to_new"]',
  '["6-8", "9-12"]',
  13,
  true
);

-- ==========================================
-- 2. Translations (uk, ru, en, es)
-- ==========================================

-- expeditions_world_travel
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'expeditions_world_travel', 'uk', 'name', 'Експедиції та подорожі світом'),
('scenario_card', 'expeditions_world_travel', 'uk', 'description', 'Маршрути через країни й дикі ландшафти: гори, льоди, узбережжя, пустелі'),
('scenario_card', 'expeditions_world_travel', 'ru', 'name', 'Экспедиции и путешествия по миру'),
('scenario_card', 'expeditions_world_travel', 'ru', 'description', 'Маршруты через страны и дикие ландшафты: горы, льды, побережья, пустыни'),
('scenario_card', 'expeditions_world_travel', 'en', 'name', 'Expeditions & World Travel'),
('scenario_card', 'expeditions_world_travel', 'en', 'description', 'Routes through countries and wild landscapes: mountains, ice, coasts, deserts'),
('scenario_card', 'expeditions_world_travel', 'es', 'name', 'Expediciones y viajes por el mundo'),
('scenario_card', 'expeditions_world_travel', 'es', 'description', 'Rutas por países y paisajes salvajes: montañas, hielo, costas, desiertos');

-- macro_scifi
INSERT INTO translations (entity_type, entity_id, locale, field_name, value) VALUES
('scenario_card', 'macro_scifi', 'uk', 'name', 'Фантастика: час, технології та майбутнє'),
('scenario_card', 'macro_scifi', 'uk', 'description', 'Пригоди з технологіями, часовими стрибками та дивними правилами реальності'),
('scenario_card', 'macro_scifi', 'ru', 'name', 'Фантастика: время, технологии и будущее'),
('scenario_card', 'macro_scifi', 'ru', 'description', 'Приключения с технологиями, временными прыжками и странными правилами реальности'),
('scenario_card', 'macro_scifi', 'en', 'name', 'Sci-Fi: Time, Technology & Future'),
('scenario_card', 'macro_scifi', 'en', 'description', 'Adventures with technology, time jumps, and strange rules of reality'),
('scenario_card', 'macro_scifi', 'es', 'name', 'Ciencia ficción: tiempo, tecnología y futuro'),
('scenario_card', 'macro_scifi', 'es', 'description', 'Aventuras con tecnología, saltos en el tiempo y extrañas reglas de la realidad');

-- ==========================================
-- 3. Plot examples (20 per scenario)
-- ==========================================

-- expeditions_world_travel (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('expeditions_world_travel', 'A family road trip map has one blank square. When they reach that spot, the GPS loses signal and a hand-painted sign points to a "short scenic path" that isn''t on any map.', 1),
('expeditions_world_travel', 'A mountain cable car stops mid-route due to wind. The only safe way down is an old maintenance trail with numbered posts—except post #7 is missing.', 2),
('expeditions_world_travel', 'At an Arctic research station, the daily weather log includes a note written in a different handwriting: "Do not open Bay 3 at sunset." Nobody admits writing it.', 3),
('expeditions_world_travel', 'A travel passport gets stamped with a symbol instead of a city name. The symbol matches carvings found on stones along the next hiking route.', 4),
('expeditions_world_travel', 'A guided glacier walk reveals warm footprints leading away from the group. The guide insists that''s impossible—until a hidden steam vent is discovered.', 5),
('expeditions_world_travel', 'In a quiet mountain village, all clocks show the same wrong time. Locals say, "The valley keeps its own hour," and refuse to explain.', 6),
('expeditions_world_travel', 'A train journey across countries includes a mysterious "non-stop" segment. The windows frost over, and when they clear, the landscape has changed to a place no one recognizes.', 7),
('expeditions_world_travel', 'A child collects souvenir magnets, but one magnet keeps sliding on its own. It always points toward the next destination, like a compass.', 8),
('expeditions_world_travel', 'During a desert-to-coast expedition, the team follows an ancient line of stones. Each stone is warm at dawn and cold at midday—opposite of what it should be.', 9),
('expeditions_world_travel', 'A mountain tunnel is closed for repairs, forcing a detour through a cave route. Inside, reflective crystals form arrows that only appear when a flashlight is moved.', 10),
('expeditions_world_travel', 'An icebreaker ship receives a distress signal—using a frequency retired decades ago. The coordinates lead to an area marked "no data" on modern charts.', 11),
('expeditions_world_travel', 'A city museum''s travel exhibit includes a "lost route" challenge. Completing it produces a real ticket with today''s date for a destination that supposedly doesn''t exist.', 12),
('expeditions_world_travel', 'On an island stopover, everyone''s shadow points in a different direction. The compass works, but the sun "feels" wrong, and tides behave oddly.', 13),
('expeditions_world_travel', 'A mountain hut guestbook has entries from tomorrow. The last entry warns: "Do not take the ridge after the third bell."', 14),
('expeditions_world_travel', 'A local festival offers a traditional "pilgrim ribbon" for travelers. The ribbon changes color depending on which path they choose—revealing which routes are safe.', 15),
('expeditions_world_travel', 'A drone used for travel filming keeps detecting a "structure" under snow. The scan outlines a perfect circle with a single entrance facing north.', 16),
('expeditions_world_travel', 'A bridge between two countries is closed, but a seasonal footpath opens at low tide. The tide schedule is written in a code that must be solved before crossing.', 17),
('expeditions_world_travel', 'A mountain lake is said to "return what you lose." After someone drops a small item in, the lake pushes out an object from a different traveler—starting a chain of clues.', 18),
('expeditions_world_travel', 'A travel postcard arrives at the hotel before the travelers do. It describes a problem they haven''t encountered yet—and includes a sketch of a landmark nearby.', 19),
('expeditions_world_travel', 'A multi-country scavenger hunt requires collecting stamps from "three extremes": highest point, coldest place, and farthest shore—each location hides a piece of the same story.', 20);

-- macro_scifi (20)
INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
('macro_scifi', 'A "smart city" crosswalk starts giving personal instructions like "Wait 12 seconds" and "Don''t look up." Following it prevents an accident that hasn''t happened yet.', 1),
('macro_scifi', 'A school project about timelines becomes real when a simple "then/now" slider on a tablet changes objects in the room by one day.', 2),
('macro_scifi', 'A maintenance robot keeps repainting the same wall with tiny symbols that match a future map of the city''s underground.', 3),
('macro_scifi', 'A public transit card scans as "expired in 2089." The system still lets the child board one special train that doesn''t appear on the schedule.', 4),
('macro_scifi', 'A time capsule is opened early by mistake and contains today''s newspaper—with one headline missing and a handwritten warning to "keep the headline blank."', 5),
('macro_scifi', 'A city billboard speaks only to the main character and shows choices as ads: "Take the stairs" / "Take the elevator." One option loops time for 3 minutes.', 6),
('macro_scifi', 'A drone delivery arrives with a package addressed to "You, Yesterday." Inside is a tool that fixes a problem—but only if used at the wrong moment.', 7),
('macro_scifi', 'A museum exhibit of "the future" has one item that''s warm. When touched, it reveals a hidden AR layer showing the building as it will look tomorrow.', 8),
('macro_scifi', 'The family''s home assistant begins to lag—responding 10 seconds late—then 1 minute late—until it starts answering questions that weren''t asked yet.', 9),
('macro_scifi', 'A street in the future city has a "quiet zone." Sound disappears, and messages can only be passed by light reflections and hand signs.', 10),
('macro_scifi', 'A small portal opens in a subway mirror but only when the train passes one specific station. Stepping through swaps the day''s "version" of the city.', 11),
('macro_scifi', 'A "memory clinic" offers to store one worry. After the visit, a small part of the day keeps resetting until the worry is faced instead of stored.', 12),
('macro_scifi', 'A public library''s book scanner prints a receipt listing books that haven''t been written yet—one of them is titled with the child''s name.', 13),
('macro_scifi', 'A future traffic AI reroutes the family repeatedly. The detours draw a perfect shape on the map that matches a code needed to unlock a safe door.', 14),
('macro_scifi', 'A time-travel postcard arrives every morning describing one small mistake to avoid. One day, no postcard arrives—creating the main tension.', 15),
('macro_scifi', 'A "smart park" changes its paths dynamically. The shortest route always leads to a lesson; the longest route leads to a secret that helps someone else.', 16),
('macro_scifi', 'A broken robot asks for help finding its "owner." The owner turns out to be the future version of someone in the present, hiding in plain sight.', 17),
('macro_scifi', 'A virtual reality field trip won''t end. The exit button is missing, and the only way out is to solve a real-world problem inside the simulation''s rules.', 18),
('macro_scifi', 'A time jump happens during a normal elevator ride. Every floor is a different year, and the only stable floor is reached by choosing the "wrong" floor number.', 19),
('macro_scifi', 'A city "update" installs overnight. In the morning, one building is gone, replaced by a park—except one person remembers the building and needs proof.', 20);

-- ==========================================
-- 4. World rules (10 per scenario)
-- ==========================================

-- expeditions_world_travel (10)
INSERT INTO scenario_world_rules (scenario_card_id, name, description, sort_order) VALUES
('expeditions_world_travel', 'Route Marker Rule', 'Safe routes always have a consistent marker system (paint, stones, flags). A broken pattern signals a wrong turn or a new threat.', 1),
('expeditions_world_travel', 'Weather Window Rule', 'Progress depends on short "windows" of stable weather. Missing the window forces a shelter plan and a different strategy.', 2),
('expeditions_world_travel', 'Three-Check Safety Rule', 'Any risky action must be verified in three ways (visual check, tool test, second opinion). Skipping a check triggers consequences.', 3),
('expeditions_world_travel', 'Local Knowledge Rule', 'Locals share guidance indirectly (proverbs, symbols, small rituals). Understanding it unlocks shortcuts and prevents mistakes.', 4),
('expeditions_world_travel', 'Resource Budget Rule', 'Every day has a strict budget: time, energy, water/food, and battery/heat. Overspending one forces a trade-off in another.', 5),
('expeditions_world_travel', 'Signal & Silence Rule', 'Navigation systems can fail in "quiet zones." When signals drop, the story shifts to analog tools: map, landmarks, counting steps, and bearings.', 6),
('expeditions_world_travel', 'Shelter Priority Rule', 'When conditions change suddenly, building or finding shelter becomes the top objective. Moving without shelter preparation is treated as a major risk.', 7),
('expeditions_world_travel', 'Boundary Rule', 'Natural boundaries (ridge lines, ice edges, rivers, borders) are decision points. Crossing requires a clear reason, a plan, and a fallback route.', 8),
('expeditions_world_travel', 'Clue In The Landscape Rule', 'The environment carries readable clues (wind-shaped snow, rock strata, tide lines). Correct interpretation reveals hidden paths and timing.', 9),
('expeditions_world_travel', 'Return Path Rule', 'Every outward move must preserve a return option (breadcrumbs, waypoints, visible markers). Losing the return path creates the main complication.', 10);

-- macro_scifi (10)
INSERT INTO scenario_world_rules (scenario_card_id, name, description, sort_order) VALUES
('macro_scifi', 'Time Cost Rule', 'Every advanced action has a cost measured in time (minutes, hours, days). Gaining time in one place creates a deficit elsewhere.', 1),
('macro_scifi', 'Paradox Pressure Rule', 'Directly changing a known event triggers "pressure" (glitches, repeats, strange coincidences) until the timeline stabilizes.', 2),
('macro_scifi', 'Loop Exit Rule', 'A time loop ends only when the core mistake is identified and corrected, not when someone "tries harder."', 3),
('macro_scifi', 'Future Echo Rule', 'The future can send limited signals (objects, messages, hints), but never full answers. Each echo is partial and must be interpreted.', 4),
('macro_scifi', 'AI Constraint Rule', 'City AIs and robots follow strict constraints (safety, fairness, energy). They can help only within those boundaries, forcing creative solutions.', 5),
('macro_scifi', 'System Glitch Clue Rule', 'Glitches are not random: visual noise, mislabels, and lag always point toward a hidden rule or a blocked path.', 6),
('macro_scifi', 'Identity Verification Rule', 'Access to key locations requires proving identity through behavior patterns (choices, kindness, consistency), not passwords alone.', 7),
('macro_scifi', 'Reality Layer Rule', 'The world may have layers (physical, AR, simulation). A truth can be visible only in one layer, so switching layers is a recurring tactic.', 8),
('macro_scifi', 'Energy Budget Rule', 'Tech depends on limited energy (battery, heat, bandwidth). Running out forces a low-tech fallback and changes the plan.', 9),
('macro_scifi', 'No Free Teleport Rule', 'Instant travel (portals, fast transit) always has a constraint: a fixed schedule, a toll, a single-use token, or a one-way consequence.', 10);
