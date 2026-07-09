import assert from 'node:assert/strict';
import {
  buildMixedStoryPrompt,
  buildMixedStoryScriptSchema,
  MIXED_STORY_SCRIPT_SCHEMA,
} from '../text';
import type { StorySpec } from '../../ai/types';

const spec: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  goal: 'courage',
  goalName: 'Courage',
  characters: [
    {
      id: 'char-1',
      name: 'Mira',
      type: 'child',
      role: 'hero',
      referencePhotos: [{ url: 'characters/mira.png' }],
    } as any,
    {
      id: 'char-2',
      name: 'Bolt',
      type: 'animal',
      role: 'friend',
      referencePhotos: [{ url: 'characters/bolt.png' }],
    } as any,
  ],
  imageStyle: 'comic_watercolor',
  policyProfile: {
    ageGroup: '6-8',
    language: 'en',
    allowedConflicts: [],
    constraints: {
      mustHaveHappyEnding: true,
      noShamingLanguage: true,
    },
    readability: {
      maxSentenceLen: 12,
      targetWordsRange: [200, 400],
      dialogRatio: 0.5,
    },
    promptGuidelines: '',
  },
};

const prompt = buildMixedStoryPrompt({
  spec,
  sceneCount: 5,
  comicSceneIds: [1, 3],
  comicBlockCount: 2,
});

assert.match(prompt, /Create exactly 2 comic blocks/);
assert.match(prompt, /Create outfits\[\] once for comic visual wardrobe bindings/);
assert.match(prompt, /OUTFITS:/);
assert.match(prompt, /Detailed wardrobe descriptions are ONLY for child\/person\/human characters/);
assert.match(prompt, /Animal, imaginary, creature, object, vehicle, or environmental characters/);
assert.match(prompt, /Every visual\.sceneVisual\.cameraComposition\.characters\[\] item must include outfitId/);
assert.match(prompt, /non-human characters use a natural-appearance binding/);
assert.match(prompt, /main subject of visual\.primaryRead/);
assert.match(prompt, /visual\.sceneVisual\.setting must be a visual staging delta, not a plot summary/);
assert.match(prompt, /COMIC CAMERA VARIETY/);
assert.match(prompt, /wide\/establishing shot/);
assert.match(prompt, /at least one extreme close-up/);
assert.match(prompt, /far-left zone, far-right zone, central object\/detail, and full wide view/);
assert.match(prompt, /main acted-on subject of primaryRead\/setting counts as a visible character/);
assert.match(prompt, /Object-contact actions require explicit physical staging/);
assert.match(prompt, /body position beside or in front of the fixed object/);

const schema = buildMixedStoryScriptSchema({
  readingBlockCount: 5,
  comicPanelRange: { min: 3, max: 6 },
});
assert.ok((MIXED_STORY_SCRIPT_SCHEMA.required as string[]).includes('outfits'));
assert.ok((schema.required as string[]).includes('outfits'));
assert.strictEqual(schema.properties.readingBlocks.minItems, 5);
assert.strictEqual(schema.properties.readingBlocks.maxItems, 5);

const outfitsSchema = schema.properties.outfits as any;
assert.ok(outfitsSchema.items.required.includes('id'));
assert.ok(outfitsSchema.items.required.includes('characterName'));
assert.ok(outfitsSchema.items.required.includes('description'));
assert.match(
  outfitsSchema.items.properties.description.description,
  /child\/person\/human characters/
);

const panelSchema = schema.properties.readingBlocks.items.properties.panels;
const visualSchema = panelSchema.items.properties.visual;
const cameraCompositionSchema = visualSchema.properties.sceneVisual.properties.cameraComposition;
assert.match(
  visualSchema.properties.sceneVisual.properties.setting.description,
  /visual staging delta, not a plot summary/
);
assert.match(cameraCompositionSchema.properties.shot.description, /environment slice/);
assert.match(cameraCompositionSchema.properties.shot.description, /extreme close-up/);
const characterSchema = cameraCompositionSchema.properties.characters.items;
assert.ok(characterSchema.required.includes('outfitId'));
assert.match(characterSchema.properties.outfitId.description, /child\/person\/human characters/);
assert.match(
  characterSchema.properties.description.description,
  /Object-contact actions require explicit physical staging/
);

console.log('mixedStoryPrompt tests passed');
