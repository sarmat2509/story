/**
 * Seed scenario_world_rules table with 130 world rules (13 scenarios × 10 rules each).
 * Run after migration 0040_add_scenario_world_rules.sql.
 * Note: New scenarios (expeditions_world_travel, macro_scifi) are added via migration 0041.
 *
 * Usage:
 *   npx tsx src/scripts/seedWorldRules.ts
 *   # On droplet host (postgres via localhost):
 *   DATABASE_URL=$(grep '^DATABASE_URL=' ../../.env.production | cut -d= -f2- | sed 's/postgres:5432/localhost:5432/') npx tsx src/scripts/seedWorldRules.ts
 */

import { config } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

const projectRoot = resolve(__dirname, '../../../../');
for (const name of ['.env.production', '.env']) {
  const p = join(projectRoot, name);
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}
// When running from host, postgres hostname doesn't resolve - use localhost
if (process.env.DATABASE_URL?.includes('postgres:5432')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace('postgres:5432', 'localhost:5432');
}

import { db } from '../db';
import { scenarioWorldRules } from '../db/schema';
import { sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

const WORLD_RULES_DATA: Array<{ scenarioCardId: string; name: string; description: string; sortOrder: number }> = [
  // magic_wizards (10)
  { scenarioCardId: 'magic_wizards', name: 'Intent Rule', description: 'A spell works only after the caster states a clear one-sentence intent out loud.', sortOrder: 1 },
  { scenarioCardId: 'magic_wizards', name: 'Precision Rule', description: 'Extra words cause harmless side effects until the spell is shortened to the exact phrase.', sortOrder: 2 },
  { scenarioCardId: 'magic_wizards', name: 'Three-Try Rule', description: 'Magic stabilizes on the third attempt (1st weak, 2nd shaky, 3rd correct).', sortOrder: 3 },
  { scenarioCardId: 'magic_wizards', name: 'Calm-Breath Rule', description: 'Enchanted items respond to emotions but become reliable only when the caster breathes slowly.', sortOrder: 4 },
  { scenarioCardId: 'magic_wizards', name: 'Kind Exchange Rule', description: 'Strong magic requires giving something small and kind (help, honesty, time) first.', sortOrder: 5 },
  { scenarioCardId: 'magic_wizards', name: 'Opposite Word Rule', description: 'Some spells activate only when one key word is spoken as its opposite (e.g., "open"→"close") to unlock a hidden meaning.', sortOrder: 6 },
  { scenarioCardId: 'magic_wizards', name: 'Wand Angle Rule', description: 'The wand must be held at a specific angle; the correct angle is hinted by a symbol nearby.', sortOrder: 7 },
  { scenarioCardId: 'magic_wizards', name: 'Circle Rule', description: 'Spells become safe and strong inside a drawn circle; outside it, they flicker.', sortOrder: 8 },
  { scenarioCardId: 'magic_wizards', name: 'Name-Calling Rule', description: 'A creature or object reveals its true function only when called by its true name (found as a clue).', sortOrder: 9 },
  { scenarioCardId: 'magic_wizards', name: 'Echo Rule', description: 'A spell must be repeated in a whisper immediately after speaking it normally to "seal" it.', sortOrder: 10 },
  // fantasy_creatures (10)
  { scenarioCardId: 'fantasy_creatures', name: 'Trust Distance Rule', description: 'A creature approaches only if the hero keeps a respectful distance for 10 seconds.', sortOrder: 1 },
  { scenarioCardId: 'fantasy_creatures', name: 'Mirror Mood Rule', description: 'Creatures mirror the hero\'s emotion; calming down calms them.', sortOrder: 2 },
  { scenarioCardId: 'fantasy_creatures', name: 'Offering Rule', description: 'A small non-food offering (song, shiny pebble, flower) unlocks cooperation.', sortOrder: 3 },
  { scenarioCardId: 'fantasy_creatures', name: 'No Sudden Moves Rule', description: 'Fast movements make creatures vanish; slow steps make them visible.', sortOrder: 4 },
  { scenarioCardId: 'fantasy_creatures', name: 'One Honest Question Rule', description: 'A creature answers exactly one truly honest question per meeting.', sortOrder: 5 },
  { scenarioCardId: 'fantasy_creatures', name: 'Footprint Trail Rule', description: 'Invisible creatures leave visible prints only on a specific surface (sand, dew, mud).', sortOrder: 6 },
  { scenarioCardId: 'fantasy_creatures', name: 'Gentle Voice Rule', description: 'Only a quiet voice can be understood by the creature; shouting turns words into noise.', sortOrder: 7 },
  { scenarioCardId: 'fantasy_creatures', name: 'Shared Task Rule', description: 'Friendship forms only after completing one small task together (carry, build, find).', sortOrder: 8 },
  { scenarioCardId: 'fantasy_creatures', name: 'Safe Signal Rule', description: 'A simple signal (hand to heart, bow, blink twice) means "I\'m safe," and the creature responds.', sortOrder: 9 },
  { scenarioCardId: 'fantasy_creatures', name: 'Return Favor Rule', description: 'If the hero helps first, the creature must return one helpful favor before leaving.', sortOrder: 10 },
  // mysteries_detectives (10)
  { scenarioCardId: 'mysteries_detectives', name: 'Two-Clue Confirmation Rule', description: 'A conclusion is valid only if supported by two independent clues.', sortOrder: 1 },
  { scenarioCardId: 'mysteries_detectives', name: 'Timeline Rule', description: 'The key clue is always about when something happened, not what happened.', sortOrder: 2 },
  { scenarioCardId: 'mysteries_detectives', name: 'Contradiction Rule', description: 'The solution hides in the first small contradiction that doesn\'t fit the story.', sortOrder: 3 },
  { scenarioCardId: 'mysteries_detectives', name: 'One Red Herring Rule', description: 'Exactly one clue seems important but is irrelevant; it must be eliminated logically.', sortOrder: 4 },
  { scenarioCardId: 'mysteries_detectives', name: 'Map It Rule', description: 'Drawing a simple map/diagram reveals the missing link.', sortOrder: 5 },
  { scenarioCardId: 'mysteries_detectives', name: 'Ask Three People Rule', description: 'Three short interviews (or notes) always reveal one consistent fact.', sortOrder: 6 },
  { scenarioCardId: 'mysteries_detectives', name: 'Reverse Order Rule', description: 'Events must be reconstructed backwards to see the cause.', sortOrder: 7 },
  { scenarioCardId: 'mysteries_detectives', name: 'Pattern Rule', description: 'The answer is a repeated pattern (numbers, colors, positions) disguised as "random."', sortOrder: 8 },
  { scenarioCardId: 'mysteries_detectives', name: 'Quiet Observation Rule', description: 'The best clue appears only when the hero stops and watches for 10 seconds.', sortOrder: 9 },
  { scenarioCardId: 'mysteries_detectives', name: 'Single Change Rule', description: 'Only one thing was moved/changed; finding it unlocks the solution.', sortOrder: 10 },
  // space_odyssey (10)
  { scenarioCardId: 'space_odyssey', name: 'Oxygen/Power Budget Rule', description: 'Every action spends a limited resource; smart planning saves the day.', sortOrder: 1 },
  { scenarioCardId: 'space_odyssey', name: 'Zero-G Drift Rule', description: 'Anything released keeps drifting; you must anchor or tether to control it.', sortOrder: 2 },
  { scenarioCardId: 'space_odyssey', name: 'Signal Delay Rule', description: 'Messages arrive late; decisions must be made with incomplete info.', sortOrder: 3 },
  { scenarioCardId: 'space_odyssey', name: 'Orbit Window Rule', description: 'A task works only during a short timing window (alignment/pass).', sortOrder: 4 },
  { scenarioCardId: 'space_odyssey', name: 'Magnetic Interference Rule', description: 'Some areas scramble electronics; analog methods still work.', sortOrder: 5 },
  { scenarioCardId: 'space_odyssey', name: 'Light vs Shadow Rule', description: 'Temperature changes drastically between sunlight and shade; switching zones matters.', sortOrder: 6 },
  { scenarioCardId: 'space_odyssey', name: 'Translate by Context Rule', description: 'Alien "words" are understood only by observing actions and repeating them.', sortOrder: 7 },
  { scenarioCardId: 'space_odyssey', name: 'Navigation by Landmarks Rule', description: 'You can\'t rely on GPS; you must navigate by visible markers.', sortOrder: 8 },
  { scenarioCardId: 'space_odyssey', name: 'Docking Alignment Rule', description: 'Two objects connect only when aligned by shape/color cues.', sortOrder: 9 },
  { scenarioCardId: 'space_odyssey', name: 'Cosmic Pattern Rule', description: 'A star/planet pattern is a readable code (route, warning, invitation).', sortOrder: 10 },
  // medieval_heroes (10)
  { scenarioCardId: 'medieval_heroes', name: 'Honor Rule', description: 'A promise made must be kept; breaking it blocks progress (socially, not magically violent).', sortOrder: 1 },
  { scenarioCardId: 'medieval_heroes', name: 'Three Trials Rule', description: 'The hero must pass three small tests (kindness, courage, cleverness).', sortOrder: 2 },
  { scenarioCardId: 'medieval_heroes', name: 'Gate Riddle Rule', description: 'A door/path opens only after answering a simple riddle tied to a clue nearby.', sortOrder: 3 },
  { scenarioCardId: 'medieval_heroes', name: 'Banner Signal Rule', description: 'Raising the correct banner/symbol calls allies or reveals safe passage.', sortOrder: 4 },
  { scenarioCardId: 'medieval_heroes', name: 'Knight\'s Code Rule', description: 'Helping the weaker earns the key help needed later.', sortOrder: 5 },
  { scenarioCardId: 'medieval_heroes', name: 'Castle Map Rule', description: 'Hidden routes are found by matching wall symbols to a simple map.', sortOrder: 6 },
  { scenarioCardId: 'medieval_heroes', name: 'Day/Night Watch Rule', description: 'Guards rotate; the safe moment is during the shift change.', sortOrder: 7 },
  { scenarioCardId: 'medieval_heroes', name: 'Tournament Rule', description: 'You can win without fighting by choosing skill challenges (aiming, balancing, puzzles).', sortOrder: 8 },
  { scenarioCardId: 'medieval_heroes', name: 'Secret Phrase Rule', description: 'A respectful phrase grants entry where force would fail.', sortOrder: 9 },
  { scenarioCardId: 'medieval_heroes', name: 'Shared Feast Rule', description: 'Sharing food/water creates trust and unlocks information.', sortOrder: 10 },
  // sea_treasures (10)
  { scenarioCardId: 'sea_treasures', name: 'Tide Window Rule', description: 'The next clue appears only at low tide or high tide.', sortOrder: 1 },
  { scenarioCardId: 'sea_treasures', name: 'Compass Lie Rule', description: 'The compass points wrong near metal; the true direction is found by the sun/stars.', sortOrder: 2 },
  { scenarioCardId: 'sea_treasures', name: 'Map Overlay Rule', description: 'Two half-maps must be overlapped to reveal the full route.', sortOrder: 3 },
  { scenarioCardId: 'sea_treasures', name: 'Bottle Message Rule', description: 'Clues appear in reflections on water or glass, not in direct view.', sortOrder: 4 },
  { scenarioCardId: 'sea_treasures', name: 'Sounding Rule', description: 'The "right spot" is found by listening for a hollow echo (cave, chest) safely.', sortOrder: 5 },
  { scenarioCardId: 'sea_treasures', name: 'Knot Code Rule', description: 'Rope knots encode a message; decoding them reveals the next step.', sortOrder: 6 },
  { scenarioCardId: 'sea_treasures', name: 'Island Pattern Rule', description: 'Rock/shell arrangements form a recognizable pattern (arrow, numbers).', sortOrder: 7 },
  { scenarioCardId: 'sea_treasures', name: 'Trade Not Take Rule', description: 'Treasure is earned by exchanging or returning something, not by grabbing.', sortOrder: 8 },
  { scenarioCardId: 'sea_treasures', name: 'Storm Calm Rule', description: 'After a squall, floating items form a trail pointing to a clue.', sortOrder: 9 },
  { scenarioCardId: 'sea_treasures', name: 'Captain\'s Rule', description: 'Only the person who admits fear and asks for help can read the final clue clearly.', sortOrder: 10 },
  // super_powers (10)
  { scenarioCardId: 'super_powers', name: 'Control Rule', description: 'Powers work only when the hero names the feeling they\'re having.', sortOrder: 1 },
  { scenarioCardId: 'super_powers', name: 'Responsibility Rule', description: 'Using power to help others makes it stronger; using it selfishly makes it flicker.', sortOrder: 2 },
  { scenarioCardId: 'super_powers', name: 'Focus Object Rule', description: 'A small object (bracelet, badge) helps aim the power accurately.', sortOrder: 3 },
  { scenarioCardId: 'super_powers', name: 'Energy Limit Rule', description: 'Power has a daily limit; smart choices matter.', sortOrder: 4 },
  { scenarioCardId: 'super_powers', name: 'Mistake-Safe Rule', description: 'First use is clumsy but safe; practice improves precision.', sortOrder: 5 },
  { scenarioCardId: 'super_powers', name: 'Team Combo Rule', description: 'Two small abilities combined solve what one alone can\'t.', sortOrder: 6 },
  { scenarioCardId: 'super_powers', name: 'Non-Verbal Rule', description: 'Sometimes the power responds to gestures, not words.', sortOrder: 7 },
  { scenarioCardId: 'super_powers', name: 'Shadow/Light Rule', description: 'Power behaves differently in bright light vs shade; the hero must choose location.', sortOrder: 8 },
  { scenarioCardId: 'super_powers', name: 'Truth Rule', description: 'Powers reveal hidden things only when the hero is honest.', sortOrder: 9 },
  { scenarioCardId: 'super_powers', name: 'Cooldown Rule', description: 'After a big use, a short rest is required before the next attempt.', sortOrder: 10 },
  // enchanted_forest (10)
  { scenarioCardId: 'enchanted_forest', name: 'Path Listening Rule', description: 'The correct path is found by listening (birdsong, wind) rather than looking.', sortOrder: 1 },
  { scenarioCardId: 'enchanted_forest', name: 'Respect Rule', description: 'The forest responds kindly only after the hero asks permission (out loud).', sortOrder: 2 },
  { scenarioCardId: 'enchanted_forest', name: 'No Harm Rule', description: 'If the hero damages plants, the trail closes; gentle behavior opens it.', sortOrder: 3 },
  { scenarioCardId: 'enchanted_forest', name: 'Lantern Plant Rule', description: 'A glowing plant lights up only when fear is acknowledged calmly.', sortOrder: 4 },
  { scenarioCardId: 'enchanted_forest', name: 'Circle of Stones Rule', description: 'Standing inside a stone circle makes hidden things visible.', sortOrder: 5 },
  { scenarioCardId: 'enchanted_forest', name: 'Animal Guide Rule', description: 'One chosen animal leads only if the hero follows at its pace.', sortOrder: 6 },
  { scenarioCardId: 'enchanted_forest', name: 'Echo Name Rule', description: 'Calling a name softly makes the forest "echo" the right direction.', sortOrder: 7 },
  { scenarioCardId: 'enchanted_forest', name: 'Scent Clue Rule', description: 'The next clue is found by smell (mint, pine, honey) linked to a plant.', sortOrder: 8 },
  { scenarioCardId: 'enchanted_forest', name: 'Season Switch Rule', description: 'A spot looks different depending on time of day; returning later reveals the clue.', sortOrder: 9 },
  { scenarioCardId: 'enchanted_forest', name: 'Gift Back Rule', description: 'Taking something requires giving something back (water, seed, cleanup).', sortOrder: 10 },
  // inventors (10)
  { scenarioCardId: 'inventors', name: 'Calibration Rule', description: 'The device works only after a simple 3-step calibration.', sortOrder: 1 },
  { scenarioCardId: 'inventors', name: 'Threshold Rule', description: 'The effect appears only after crossing a measurable threshold (heat, frequency, distance).', sortOrder: 2 },
  { scenarioCardId: 'inventors', name: 'Noise-Is-Signal Rule', description: '"Static" contains the message; filtering/reversing reveals it.', sortOrder: 3 },
  { scenarioCardId: 'inventors', name: 'Inversion Rule', description: 'The output must be read inverted (mirror, reverse order, flipped graph).', sortOrder: 4 },
  { scenarioCardId: 'inventors', name: 'Resource Limit Rule', description: 'Power/time is limited; planning and prioritizing matter.', sortOrder: 5 },
  { scenarioCardId: 'inventors', name: 'Repeatability Rule', description: 'A result is "true" only if it repeats twice under the same conditions.', sortOrder: 6 },
  { scenarioCardId: 'inventors', name: 'Hidden Variable Rule', description: 'One unnoticed variable (angle, material, humidity) changes everything; spotting it solves the mystery.', sortOrder: 7 },
  { scenarioCardId: 'inventors', name: 'Pattern Extraction Rule', description: 'Data looks random until plotted; the plot reveals a clear pattern.', sortOrder: 8 },
  { scenarioCardId: 'inventors', name: 'Proximity Rule', description: 'The device spikes only within a certain radius; triangulation finds the source.', sortOrder: 9 },
  { scenarioCardId: 'inventors', name: 'Safe Fail Rule', description: 'Early prototypes fail in harmless ways that give clues for the next iteration.', sortOrder: 10 },
  // jungle_adventures (10)
  { scenarioCardId: 'jungle_adventures', name: 'Trail Mark Rule', description: 'Safe paths are marked by subtle natural signs (scratches, stacked stones).', sortOrder: 1 },
  { scenarioCardId: 'jungle_adventures', name: 'Heat/Rain Rhythm Rule', description: 'Movement must follow the jungle\'s weather rhythm (rest at midday heat, move after rain).', sortOrder: 2 },
  { scenarioCardId: 'jungle_adventures', name: 'Echo Location Rule', description: 'Sounds bounce; the true source is found by listening from two points.', sortOrder: 3 },
  { scenarioCardId: 'jungle_adventures', name: 'Bridge Rule', description: 'A crossing is safe only if tested in three steps (shake, weight shift, slow pace).', sortOrder: 4 },
  { scenarioCardId: 'jungle_adventures', name: 'Animal Alarm Rule', description: 'When animals go silent, danger is near; when they return, it\'s safe.', sortOrder: 5 },
  { scenarioCardId: 'jungle_adventures', name: 'Sun Compass Rule', description: 'Direction is found by sun + shadows when tools fail.', sortOrder: 6 },
  { scenarioCardId: 'jungle_adventures', name: 'Ruins Sequence Rule', description: 'Temple/ruin puzzles require steps in a specific order; skipping resets progress.', sortOrder: 7 },
  { scenarioCardId: 'jungle_adventures', name: 'Water Clue Rule', description: 'Streams carry clues downstream; following the flow leads to answers.', sortOrder: 8 },
  { scenarioCardId: 'jungle_adventures', name: 'Respect Local Rule', description: 'Asking permission (to enter ruins / take artifacts) brings help; disrespect brings setbacks.', sortOrder: 9 },
  { scenarioCardId: 'jungle_adventures', name: 'Buddy Tether Rule', description: 'The team stays connected by a simple "buddy rule" to avoid separation in thick foliage.', sortOrder: 10 },
  // scary_stories (10)
  { scenarioCardId: 'scary_stories', name: 'Fear Brightness Rule', description: 'The scarier it feels, the more it reacts to fear; calm breathing makes it quieter/brighter (safer).', sortOrder: 1 },
  { scenarioCardId: 'scary_stories', name: 'Name-Your-Fear Rule', description: 'The mystery softens when the hero names what they\'re afraid of out loud.', sortOrder: 2 },
  { scenarioCardId: 'scary_stories', name: 'Three Safe Checks Rule', description: 'Any spooky sign must be checked with 3 safe tests (light, sound, distance).', sortOrder: 3 },
  { scenarioCardId: 'scary_stories', name: 'Friendly Cause Rule', description: 'The "monster" is always a friendly cause (lost creature, wind, harmless gadget) revealed by clues.', sortOrder: 4 },
  { scenarioCardId: 'scary_stories', name: 'Stay Together Rule', description: 'No long separation; staying close unlocks the solution faster.', sortOrder: 5 },
  { scenarioCardId: 'scary_stories', name: 'Light Pattern Rule', description: 'Flickering lights follow a pattern; decoding it leads to the reveal.', sortOrder: 6 },
  { scenarioCardId: 'scary_stories', name: 'Whisper Clue Rule', description: 'A quiet whispering sound is actually a message hidden in wind/water pipes; listening carefully helps.', sortOrder: 7 },
  { scenarioCardId: 'scary_stories', name: 'Safe Boundary Rule', description: 'There is always a safe boundary (doorway, circle, porch); crossing is optional and brave.', sortOrder: 8 },
  { scenarioCardId: 'scary_stories', name: 'Kindness Unlock Rule', description: 'A kind action (returning an item, apologizing) ends the haunting immediately.', sortOrder: 9 },
  { scenarioCardId: 'scary_stories', name: 'Proof Token Rule', description: 'The spooky world leaves a small harmless proof (warm pebble, tiny star) at the end.', sortOrder: 10 },
  // expeditions_world_travel (10)
  { scenarioCardId: 'expeditions_world_travel', name: 'Route Marker Rule', description: 'Safe routes always have a consistent marker system (paint, stones, flags). A broken pattern signals a wrong turn or a new threat.', sortOrder: 1 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Weather Window Rule', description: 'Progress depends on short "windows" of stable weather. Missing the window forces a shelter plan and a different strategy.', sortOrder: 2 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Three-Check Safety Rule', description: 'Any risky action must be verified in three ways (visual check, tool test, second opinion). Skipping a check triggers consequences.', sortOrder: 3 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Local Knowledge Rule', description: 'Locals share guidance indirectly (proverbs, symbols, small rituals). Understanding it unlocks shortcuts and prevents mistakes.', sortOrder: 4 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Resource Budget Rule', description: 'Every day has a strict budget: time, energy, water/food, and battery/heat. Overspending one forces a trade-off in another.', sortOrder: 5 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Signal & Silence Rule', description: 'Navigation systems can fail in "quiet zones." When signals drop, the story shifts to analog tools: map, landmarks, counting steps, and bearings.', sortOrder: 6 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Shelter Priority Rule', description: 'When conditions change suddenly, building or finding shelter becomes the top objective. Moving without shelter preparation is treated as a major risk.', sortOrder: 7 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Boundary Rule', description: 'Natural boundaries (ridge lines, ice edges, rivers, borders) are decision points. Crossing requires a clear reason, a plan, and a fallback route.', sortOrder: 8 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Clue In The Landscape Rule', description: 'The environment carries readable clues (wind-shaped snow, rock strata, tide lines). Correct interpretation reveals hidden paths and timing.', sortOrder: 9 },
  { scenarioCardId: 'expeditions_world_travel', name: 'Return Path Rule', description: 'Every outward move must preserve a return option (breadcrumbs, waypoints, visible markers). Losing the return path creates the main complication.', sortOrder: 10 },
  // macro_scifi (10)
  { scenarioCardId: 'macro_scifi', name: 'Time Cost Rule', description: 'Every advanced action has a cost measured in time (minutes, hours, days). Gaining time in one place creates a deficit elsewhere.', sortOrder: 1 },
  { scenarioCardId: 'macro_scifi', name: 'Paradox Pressure Rule', description: 'Directly changing a known event triggers "pressure" (glitches, repeats, strange coincidences) until the timeline stabilizes.', sortOrder: 2 },
  { scenarioCardId: 'macro_scifi', name: 'Loop Exit Rule', description: 'A time loop ends only when the core mistake is identified and corrected, not when someone "tries harder."', sortOrder: 3 },
  { scenarioCardId: 'macro_scifi', name: 'Future Echo Rule', description: 'The future can send limited signals (objects, messages, hints), but never full answers. Each echo is partial and must be interpreted.', sortOrder: 4 },
  { scenarioCardId: 'macro_scifi', name: 'AI Constraint Rule', description: 'City AIs and robots follow strict constraints (safety, fairness, energy). They can help only within those boundaries, forcing creative solutions.', sortOrder: 5 },
  { scenarioCardId: 'macro_scifi', name: 'System Glitch Clue Rule', description: 'Glitches are not random: visual noise, mislabels, and lag always point toward a hidden rule or a blocked path.', sortOrder: 6 },
  { scenarioCardId: 'macro_scifi', name: 'Identity Verification Rule', description: 'Access to key locations requires proving identity through behavior patterns (choices, kindness, consistency), not passwords alone.', sortOrder: 7 },
  { scenarioCardId: 'macro_scifi', name: 'Reality Layer Rule', description: 'The world may have layers (physical, AR, simulation). A truth can be visible only in one layer, so switching layers is a recurring tactic.', sortOrder: 8 },
  { scenarioCardId: 'macro_scifi', name: 'Energy Budget Rule', description: 'Tech depends on limited energy (battery, heat, bandwidth). Running out forces a low-tech fallback and changes the plan.', sortOrder: 9 },
  { scenarioCardId: 'macro_scifi', name: 'No Free Teleport Rule', description: 'Instant travel (portals, fast transit) always has a constraint: a fixed schedule, a toll, a single-use token, or a one-way consequence.', sortOrder: 10 },
];

async function seedWorldRules() {
  if (!process.env.DATABASE_URL) {
    logger.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const existing = await db.select({ count: sql<number>`count(*)::int` }).from(scenarioWorldRules);
  const count = existing[0]?.count ?? 0;

  if (count > 0) {
    logger.info({ existingCount: count }, 'World rules already seeded, skipping');
    console.log(`✅ World rules already seeded (${count} rules). Skipping.`);
    process.exit(0);
  }

  let inserted = 0;
  for (const rule of WORLD_RULES_DATA) {
    await db.insert(scenarioWorldRules).values({
      scenarioCardId: rule.scenarioCardId,
      name: rule.name,
      description: rule.description,
      sortOrder: rule.sortOrder,
      isActive: true,
    });
    inserted++;
  }

  logger.info({ inserted, total: WORLD_RULES_DATA.length }, 'World rules seeded');
  console.log(`✅ Seeded ${inserted} world rules.`);
  process.exit(0);
}

seedWorldRules().catch((err) => {
  logger.error({ err }, 'Seed failed');
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
