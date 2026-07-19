import assert from 'node:assert/strict';
import { IMAGE_STYLES, LOCALE_IDS } from '@wondertales/shared';
import {
  PRESENTATION_CONTROL_STORY_IDS,
  PRESENTATION_STORY_MANIFEST,
} from '../presentationStoryManifest';

const expectedScenarioCards = new Set([
  'magic_wizards',
  'fantasy_creatures',
  'mysteries_detectives',
  'space_odyssey',
  'medieval_heroes',
  'sea_treasures',
  'super_powers',
  'enchanted_forest',
  'inventors',
  'jungle_adventures',
  'scary_stories',
  'expeditions_world_travel',
  'macro_scifi',
  'sports_competitions',
  'science_facts',
  'holidays_traditions',
  'families_cultures',
]);

assert.equal(PRESENTATION_STORY_MANIFEST.length, 21);
assert.equal(new Set(PRESENTATION_STORY_MANIFEST.map((entry) => entry.id)).size, 21);
assert.equal(new Set(PRESENTATION_STORY_MANIFEST.map((entry) => entry.title)).size, 21);

for (const format of ['story', 'graphic_novel', 'mixed_story'] as const) {
  const entries = PRESENTATION_STORY_MANIFEST.filter((entry) => entry.format === format);
  assert.equal(entries.length, 7, `${format} must have one entry per locale`);
  assert.deepEqual(
    new Set(entries.map((entry) => entry.language)),
    new Set(LOCALE_IDS),
    `${format} must cover all locales`
  );
}

assert.deepEqual(
  new Set(
    PRESENTATION_STORY_MANIFEST.flatMap((entry) =>
      entry.scenarioCardId ? [entry.scenarioCardId] : []
    )
  ),
  expectedScenarioCards,
  'all 17 production scenario cards must be represented'
);

assert.equal(
  PRESENTATION_STORY_MANIFEST.filter((entry) => !entry.scenarioCardId).length,
  3,
  'the three 1y/2-3 stories use precise notes instead of incompatible scenario cards'
);

for (const entry of PRESENTATION_STORY_MANIFEST) {
  assert.ok(IMAGE_STYLES.includes(entry.imageStyle));
  assert.ok(entry.userNotes.length <= 500, `${entry.id} notes exceed the public contract`);
  assert.ok(entry.characterNames.length >= 1 && entry.characterNames.length <= 2);
  assert.ok(entry.userNotes.includes(entry.title), `${entry.id} notes must pin the title`);
}

assert.equal(PRESENTATION_CONTROL_STORY_IDS.length, 3);
assert.deepEqual(
  new Set(
    PRESENTATION_STORY_MANIFEST.filter((entry) =>
      PRESENTATION_CONTROL_STORY_IDS.includes(entry.id as never)
    ).map((entry) => entry.format)
  ),
  new Set(['story', 'graphic_novel', 'mixed_story'])
);

console.log('presentation story manifest tests passed');
