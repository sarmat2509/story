-- Migration: Add sports competitions and science facts scenario cards
-- Created: 2026-07-05
--
-- Adds two story themes plus their plot examples, world rules, translations,
-- and light artifact affinities for more relevant closing keepsakes.

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
) VALUES
(
  'sports_competitions',
  'scenario_cards.sports_competitions.name',
  'scenario_cards.sports_competitions.description',
  '🏆',
  'Sports-centered adventures: tournaments, races, relays, obstacle courses, boxing-style training, team matches, and personal records. Build competitive spirit, discipline, fair play, courage, resilience, and respect for rivals. Keep contact sports age-safe: training, padded practice, strategy, and controlled challenge, never injury spectacle.',
  '["courage", "persistence", "self_reliance", "responsibility", "friendship"]',
  '["4-5", "6-8", "9-12"]',
  14,
  true
),
(
  'science_facts',
  'scenario_cards.science_facts.name',
  'scenario_cards.science_facts.description',
  '🌍',
  'Educational adventures that explain real-world processes and factual how-things-work questions: photosynthesis, Earth''s rotation and orbit around the Sun, weather, space, age-safe human body facts, household machines such as microwaves, materials, and how everyday products like spoons are made. When the selected plot slot asks the model to choose a concrete object or process, pick one age-appropriate example and build the story around it. Weave facts into action, observation, measurement, and discovery. Prefer clear cause-and-effect over fantasy; avoid sexual detail entirely, and keep body or birth topics gentle, factual, and age-appropriate.',
  '["persistence", "self_reliance", "adapting_to_new", "responsibility"]',
  '["4-5", "6-8", "9-12"]',
  15,
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
-- sports_competitions
('scenario_card', 'sports_competitions', 'uk', 'name', 'Спорт і змагання'),
('scenario_card', 'sports_competitions', 'uk', 'description', 'Історії про турніри, перегони, командний дух і чесну конкуренцію'),
('scenario_card', 'sports_competitions', 'ru', 'name', 'Спорт и соревнования'),
('scenario_card', 'sports_competitions', 'ru', 'description', 'Истории о турнирах, гонках, командном духе и честной конкуренции'),
('scenario_card', 'sports_competitions', 'en', 'name', 'Sports & Competitions'),
('scenario_card', 'sports_competitions', 'en', 'description', 'Stories about tournaments, races, team spirit, and fair competition'),
('scenario_card', 'sports_competitions', 'es', 'name', 'Deportes y competiciones'),
('scenario_card', 'sports_competitions', 'es', 'description', 'Historias sobre torneos, carreras, trabajo en equipo y competencia justa'),
('scenario_card', 'sports_competitions', 'de', 'name', 'Sport und Wettbewerbe'),
('scenario_card', 'sports_competitions', 'de', 'description', 'Geschichten über Turniere, Rennen, Teamgeist und fairen Wettbewerb'),
('scenario_card', 'sports_competitions', 'fr', 'name', 'Sports et compétitions'),
('scenario_card', 'sports_competitions', 'fr', 'description', 'Histoires de tournois, courses, esprit d''équipe et compétition équitable'),
('scenario_card', 'sports_competitions', 'pl', 'name', 'Sport i zawody'),
('scenario_card', 'sports_competitions', 'pl', 'description', 'Historie o turniejach, wyścigach, duchu zespołu i uczciwej rywalizacji'),
-- science_facts
('scenario_card', 'science_facts', 'uk', 'name', 'Наукові факти'),
('scenario_card', 'science_facts', 'uk', 'description', 'Пізнавальні пригоди про Землю, космос, природу і те, як усе працює'),
('scenario_card', 'science_facts', 'ru', 'name', 'Научные факты'),
('scenario_card', 'science_facts', 'ru', 'description', 'Познавательные приключения о Земле, космосе, природе и том, как всё работает'),
('scenario_card', 'science_facts', 'en', 'name', 'Science Facts'),
('scenario_card', 'science_facts', 'en', 'description', 'Educational adventures about Earth, space, nature, and how things work'),
('scenario_card', 'science_facts', 'es', 'name', 'Datos científicos'),
('scenario_card', 'science_facts', 'es', 'description', 'Aventuras educativas sobre la Tierra, el espacio, la naturaleza y cómo funcionan las cosas'),
('scenario_card', 'science_facts', 'de', 'name', 'Wissenschaftliche Fakten'),
('scenario_card', 'science_facts', 'de', 'description', 'Lernabenteuer über Erde, Weltraum, Natur und wie Dinge funktionieren'),
('scenario_card', 'science_facts', 'fr', 'name', 'Faits scientifiques'),
('scenario_card', 'science_facts', 'fr', 'description', 'Aventures éducatives sur la Terre, l''espace, la nature et le fonctionnement des choses'),
('scenario_card', 'science_facts', 'pl', 'name', 'Fakty naukowe'),
('scenario_card', 'science_facts', 'pl', 'description', 'Edukacyjne przygody o Ziemi, kosmosie, przyrodzie i działaniu rzeczy')
ON CONFLICT (entity_type, entity_id, locale, field_name) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

DELETE FROM scenario_plot_examples
WHERE scenario_card_id IN ('sports_competitions', 'science_facts');

INSERT INTO scenario_plot_examples (scenario_card_id, setting, sort_order) VALUES
-- sports_competitions (20)
('sports_competitions', 'Template: choose one race format such as a relay, sprint, bicycle race, soapbox car race, go-kart lap, sled route, or trail run. Build the plot around speed versus control, with a rule that rewards steady technique and honest effort.', 1),
('sports_competitions', 'Template: choose a safe combat-sport or martial-arts training challenge such as padded boxing drills, footwork, blocking, kata, or balance forms. Points come from discipline, breathing, respect, and controlled movement, never from injury.', 2),
('sports_competitions', 'Template: choose one team sport such as soccer, basketball, hockey, volleyball, rowing, or a relay game. The team starts disorganized, then improves by listening, passing, covering roles, and supporting the quietest member.', 3),
('sports_competitions', 'Template: design an obstacle-course championship with three to five age-safe stations. One station should look physical at first but actually reward patience, planning, rhythm, or helping another participant.', 4),
('sports_competitions', 'Template: choose a personal-best event such as running, jumping, swimming, climbing, throwing, skating, or gymnastics. The hero may not take first place, but must clearly beat a previous attempt through practice.', 5),
('sports_competitions', 'Template: choose a sport where equipment matters, such as cycling, skating, climbing, rowing, tennis, karting, or sledding. A small check of brakes, laces, grip, balance, or fit changes the outcome.', 6),
('sports_competitions', 'Template: choose a tournament bracket or festival with several rounds. Each round should test a different skill: focus, strategy, stamina, teamwork, precision, or fair play.', 7),
('sports_competitions', 'Template: choose an outdoor contest affected by weather, wind, mud, rain, snow, heat, or bright sun. The hero adapts safely instead of blaming conditions.', 8),
('sports_competitions', 'Template: choose a race or match where the obvious fastest route is not best. The winning strategy comes from reading the field, timing a move, choosing position, or saving energy.', 9),
('sports_competitions', 'Template: choose any age-safe sports event where the hero loses the first round or makes an early mistake. The story follows how they reset, learn one concrete cue, and return with better form.', 10),
('sports_competitions', 'Template: choose a captain or leader moment in any team game. The hero must notice an overlooked teammate and change the plan so the group works as one unit.', 11),
('sports_competitions', 'Template: choose a rhythm-based sport or event such as rowing, swimming, running, jump rope, dance-gymnastics, or synchronized drills. Success depends on shared timing more than raw strength.', 12),
('sports_competitions', 'Template: choose a balance or precision challenge such as climbing, gymnastics, skateboarding, table tennis, archery-style foam targets, or careful ball control. The hero learns that a clean stop or controlled pause can score as much as a bold move.', 13),
('sports_competitions', 'Template: choose an endurance challenge such as a trail run, long swim, hike race, multi-lap course, or family sports quest. The plot should show pacing, recovery, hydration, and teamwork.', 14),
('sports_competitions', 'Template: choose a precision contest such as shooting hoops, serving a ball, beanbag toss, mini golf, bowling, or target throwing. The hero improves by measuring stance, breath, and repeatable motion.', 15),
('sports_competitions', 'Template: choose a fast-reaction game such as table tennis, badminton, dodge-and-catch foam ball, goalie practice, or quick-start races. The turning point is anticipation and calm eyes, not panic speed.', 16),
('sports_competitions', 'Template: choose an inclusive relay or mixed-skill challenge where every participant has a useful strength. The rules should make cooperation necessary for the final score.', 17),
('sports_competitions', 'Template: choose a fair-play dilemma during any competition: a tempting shortcut, a hidden foul, a scoring mistake, or a rival needing help. The story rewards honesty and respect without making the contest feel easy.', 18),
('sports_competitions', 'Template: choose a sport that requires practice over several days. Show one small skill repeated correctly until it unlocks a larger move during the final event.', 19),
('sports_competitions', 'Template: choose a respectful rival in any sport. The rival demonstrates a missing skill, and the hero grows by observing, adapting, and competing with dignity instead of trying to humiliate them.', 20),
-- science_facts (20)
('science_facts', 'Template: explain how one familiar machine works. Choose a concrete object such as a refrigerator, vacuum cleaner, microwave, washing machine, elevator, electric kettle, or car engine, then make the plot depend on understanding its real mechanism and safe use.', 1),
('science_facts', 'Template: explain how one natural cycle or space process happens. Choose a process such as Earth rotation, Earth orbit around the Sun, day and night, seasons, Moon phases, tides, or clouds and rain, then use a model or observation to solve the story problem.', 2),
('science_facts', 'Template: explain how one plant process works. Choose photosynthesis, flowering, seeds sprouting, roots drinking water, leaves turning color, fruit ripening, or tree rings, then show the characters testing light, water, air, time, or temperature.', 3),
('science_facts', 'Template: explain how one animal or insect process works. Choose bees making honey, butterflies changing form, birds migrating, spiders making webs, ants cooperating, or animals leaving tracks, then connect the fact to a practical discovery in the plot.', 4),
('science_facts', 'Template: explain one gentle human-body process. Choose breathing, heartbeat, digestion, muscles, senses, sleep, growing, or, only for children age 6+, where babies grow before birth. If birth is chosen, keep it strictly factual and age-safe: uterus, umbilical cord, doctors or caring adults, and no sexual details. For younger children, choose a different body process.', 5),
('science_facts', 'Template: explain how one everyday product is made. Choose a spoon, pencil, crayon, glass jar, paper sheet, shoe, book, toy, or lunchbox, then follow raw material, shaping, finishing, and quality checking as part of the adventure.', 6),
('science_facts', 'Template: explain how one food is made or transformed. Choose bread, yogurt, cheese, chocolate, jam, soup, ice cream, or honey, then use heat, cooling, mixing, cultures, time, or careful measuring as the fact that changes the outcome.', 7),
('science_facts', 'Template: compare materials to solve a problem. Choose materials such as metal, wood, plastic, glass, fabric, rubber, paper, stone, or clay, then show how weight, heat transfer, flexibility, absorbency, texture, or transparency matters.', 8),
('science_facts', 'Template: explain a safe electricity or circuit question. Choose a lamp, battery toy, doorbell, traffic light model, flashlight, or classroom circuit board, then make completing the path of electricity the key to the plot.', 9),
('science_facts', 'Template: explain motion, force, or mechanical advantage. Choose gears, wheels, pulleys, levers, brakes, springs, a bicycle, a wind-up toy, or a simple engine model, then show how pushing, pulling, friction, or stored energy works.', 10),
('science_facts', 'Template: explain heat, cold, or insulation. Choose melting ice, freezing water, a thermos, a refrigerator, warm clothes, cooking soup, or cooling glass, then follow where heat moves and how characters control it safely.', 11),
('science_facts', 'Template: explain sound as vibration. Choose drums, strings, bells, echoes, loudspeakers, whispers, or animal calls, then make the characters notice what shakes, carries, or blocks sound.', 12),
('science_facts', 'Template: explain light, color, or shadows. Choose mirrors, lenses, rainbows, shadow size, colored filters, sunlight through leaves, or a camera obscura, then solve the plot through how light travels.', 13),
('science_facts', 'Template: explain water, weather, or land change. Choose rain runoff, rivers carving valleys, waves sorting stones, snowflakes, evaporation, condensation, wind, or erosion, then make the characters measure or model the change.', 14),
('science_facts', 'Template: explain one space-scale idea with a small model. Choose gravity, satellites, rocket launch, constellations, planets, asteroids, or why stars seem to move, then keep the facts realistic even if the framing feels adventurous.', 15),
('science_facts', 'Template: reveal a tiny world normally hard to see. Choose cells, pond life, pollen, germs, crystals, grains of sand, fibers, or mold on old food, then use a microscope, magnifier, or safe model to explain the hidden details.', 16),
('science_facts', 'Template: explain magnets or sorting. Choose magnets, compasses, recycling metal, magnetic and non-magnetic objects, fridge magnets, or a simple motor model, then make testing different objects more useful than guessing.', 17),
('science_facts', 'Template: explain how one household or city system works. Choose tap water, sewage treatment in a non-graphic way, mail delivery, traffic lights, internet cables, a library sorting system, or electricity reaching a home, then show the steps in order.', 18),
('science_facts', 'Template: explain time, measurement, or navigation. Choose clocks, calendars, maps, thermometers, scales, measuring cups, speed, distance, or star directions, then make careful measurement change the decision characters make.', 19),
('science_facts', 'Template: explain a cause-and-effect mystery from everyday life. Choose any concrete question like why socks stick together, why windows fog, why popcorn pops, why soap makes bubbles, why metal gets hot, or why plants lean to light; the story must answer it through observation and one simple test.', 20);

DELETE FROM scenario_world_rules
WHERE scenario_card_id IN ('sports_competitions', 'science_facts');

INSERT INTO scenario_world_rules (scenario_card_id, name, description, sort_order) VALUES
-- sports_competitions (10)
('sports_competitions', 'Rhythm Beats Force Rule', 'Performance improves when movement follows a steady rhythm; rushing breaks form and creates mistakes even for strong competitors.', 1),
('sports_competitions', 'Recovery Window Rule', 'After a hard effort, a short breath, stretch, or reset restores control. Ignoring recovery makes the next attempt worse.', 2),
('sports_competitions', 'Fair Play Score Rule', 'The contest rewards honesty, clean technique, and respect for rivals. A shortcut may look faster but costs progress or trust.', 3),
('sports_competitions', 'Team Link Rule', 'A team advances only as smoothly as its least-supported member. Helping one teammate raises the whole group performance.', 4),
('sports_competitions', 'Practice Pattern Rule', 'Repeating one small skill correctly three times unlocks a larger move later; random effort does not build reliable progress.', 5),
('sports_competitions', 'Strategy Over Speed Rule', 'The direct route is not always best. Reading the field, timing, and choosing position can beat raw speed.', 6),
('sports_competitions', 'Pressure Reveals Habit Rule', 'Under crowd noise or time pressure, old habits appear. The hero succeeds by returning to one practiced cue.', 7),
('sports_competitions', 'Equipment Check Rule', 'Small gear details such as laces, brakes, balance, grip, or fit change the outcome. Checking early prevents trouble later.', 8),
('sports_competitions', 'Respectful Rival Rule', 'A rival can reveal the missing skill through contrast. The hero grows by observing and adapting, not by humiliating the opponent.', 9),
('sports_competitions', 'Personal Best Rule', 'A true win is measured against the hero''s previous attempt as well as the scoreboard. Improvement can matter even without first place.', 10),
-- science_facts (10)
('science_facts', 'Observe Before Explaining Rule', 'The story must first show a concrete observation, then a careful test, and only then a simple explanation of the fact.', 1),
('science_facts', 'One Variable Rule', 'When testing a question, change only one thing at a time. Changing many things makes the result confusing.', 2),
('science_facts', 'Measure It Rule', 'A guess becomes useful when characters measure, count, compare, or record what they see in an age-appropriate way.', 3),
('science_facts', 'Cause And Effect Rule', 'Every science fact must affect the plot through a visible cause and result, not appear as a lecture or trivia aside.', 4),
('science_facts', 'Scale Shift Rule', 'Small things can explain big effects: tiny bubbles, grains, cells, or droplets can change what characters see at normal size.', 5),
('science_facts', 'Energy Transfer Rule', 'Heat, light, motion, sound, or electricity moves from one place or form to another, and following that transfer reveals the answer.', 6),
('science_facts', 'Cycle Rule', 'Natural systems often cycle: water, seasons, day and night, growth, decay, or recycling. The plot should reveal one step leading to the next.', 7),
('science_facts', 'Material Properties Rule', 'Different materials behave differently because of properties such as weight, magnetism, texture, absorbency, flexibility, or transparency.', 8),
('science_facts', 'Model Helps Rule', 'A safe model, diagram, shadow, map, or miniature experiment can explain something too large, small, fast, or slow to see directly.', 9),
('science_facts', 'Fact Stays Real Rule', 'Scientific facts stay realistic and age-appropriate. Wonder and imagination may frame the adventure, but the explanation must not depend on magic; human-body or birth facts must avoid sexual detail.', 10);

UPDATE story_artifacts
SET
  scenario_affinities = CASE
    WHEN scenario_affinities ? 'sports_competitions' THEN scenario_affinities
    ELSE scenario_affinities || '["sports_competitions"]'::jsonb
  END,
  updated_at = NOW()
WHERE artifact_code IN ('111', '129', '130', '286', '296', '305');

UPDATE story_artifacts
SET
  scenario_affinities = CASE
    WHEN scenario_affinities ? 'science_facts' THEN scenario_affinities
    ELSE scenario_affinities || '["science_facts"]'::jsonb
  END,
  updated_at = NOW()
WHERE artifact_code IN ('057', '062', '067', '073', '087', '088', '089', '176', '178', '289', '298', '304');
