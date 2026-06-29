import assert from 'node:assert/strict';
import {
  buildDirectorPrompt,
  buildDirectorPromptCachedPrefix,
  buildMapTileBriefPrompt,
  buildMapTileBriefPromptCachedPrefix,
  DIRECTOR_CACHE_KEY,
  MAP_TILE_BRIEF_CACHE_KEY,
} from '../text';

function testDirectorCachedPrefixContainsImagePromptRules() {
  const cached = buildDirectorPromptCachedPrefix();

  assert.strictEqual(DIRECTOR_CACHE_KEY, 'director_rules_v24');
  assert.ok(cached.includes('CHARACTER DNA:'));
  assert.ok(cached.includes('2-3 memorable visible traits'));
  assert.ok(cached.includes('subject + key visual traits + outfit + emotion + action + setting'));
  assert.ok(cached.includes('Depict exactly one concrete frozen moment'));
  assert.ok(cached.includes('Never describe a sequence of events'));
  assert.ok(cached.includes('Use positive visual phrasing'));
  assert.ok(cached.includes('Write for an image generation system, not for a chat conversation.'));
  assert.ok(cached.includes('Avoid inferred intent wording such as "as if ready to..."'));
  assert.ok(cached.includes('sceneVisual.cameraComposition.characters[].description must stay reference-safe'));
  assert.ok(cached.includes('Bad for reference-grounded characters: "adjusting her high ponytail"'));
  assert.ok(cached.includes('If important information depends on small hand-object contact, object-slot alignment'));
  assert.ok(cached.includes('Do not add secondary composition goals such as "triangle composition"'));
  assert.ok(cached.includes('Do not write pseudo-labels or colon-tagged object lines such as "stone gargoyle:"'));
  assert.ok(cached.includes('VISUAL FOCUS HIERARCHY:'));
  assert.ok(cached.includes('internally choose ONE primary read'));
  assert.ok(cached.includes('This is the ONLY field where you explicitly name the main read in words.'));
  assert.ok(cached.includes('Do not repeat or redefine focus in sceneVisual.setting'));
  assert.ok(cached.includes('Include characters, outfits, environments, mapTile, and illustrations.'));
  assert.ok(cached.includes('Each illustration must include environmentId, primaryRead, and sceneVisual.'));
  assert.ok(cached.includes('environments[].description is a reusable EMPTY LOCATION PLATE'));
  assert.ok(cached.includes('If a location is named after a character or is on/inside a character'));
  assert.ok(cached.includes('Put characters only in illustrations[].sceneVisual.cameraComposition.characters.'));
  assert.ok(cached.includes('CRITICAL - MAP TILE BRIEF:'));
  assert.ok(cached.includes('Create exactly ONE top-level mapTile for the whole story'));
  assert.ok(cached.includes('mapTile.description:'));
  assert.ok(cached.includes('Return one compact English paragraph with drawable visual information only.'));
  assert.ok(cached.includes('Write it like a dry art-director inventory for image generation, not like story prose.'));
  assert.ok(cached.includes('Start with ONE primary visible anchor'));
  assert.ok(cached.includes('Then add 2-4 secondary visible landmarks or environmental features.'));
  assert.ok(cached.includes('Minor details must stay small, sparse, and non-repeating'));
  assert.ok(cached.includes('Keep the priority order, but write normal prose.'));
  assert.ok(cached.includes('Omit meta labels such as primary anchor, main anchor'));
  assert.ok(cached.includes('Each visual idea should appear at only one priority level'));
  assert.ok(cached.includes('do not repeat it in the primary anchor, secondary landmarks, and filler'));
  assert.ok(cached.includes('Use only things an image model can draw directly.'));
  assert.ok(cached.includes('white cloth napkin strip across black ink'));
  assert.ok(cached.includes('closed worn book with gray puffs above the cover'));
  assert.ok(cached.includes('old bookshop aisle with wooden shelf floor'));
  assert.ok(cached.includes('Omit story titles, sensory cues, feelings, emotions'));
  assert.ok(cached.includes('secret, hidden, world, universe, cozy, warm scent'));
  assert.ok(cached.includes('Route geometry is controlled later by a mask'));
  assert.ok(cached.includes('You may name the route surface material or crossing material when it matters'));
  assert.ok(cached.includes('Do not make the route line itself the primary anchor or a secondary landmark'));
  assert.ok(cached.includes('Decorative/background story elements such as a bridge seen through a porthole'));
  assert.ok(cached.includes('describe them as sparse accents around landmarks or across the environment'));
  assert.ok(cached.includes('Do not say north/south/east/west/top/bottom/left/right'));
  assert.ok(cached.includes('river + bridge + portal'));
  assert.ok(cached.includes('requiredFeatures is an exact mask contract'));
  assert.ok(cached.includes('Waterfall must be paired with river'));
  assert.ok(cached.includes('physical mask geometry on the tile surface'));
  assert.ok(cached.includes('Every tile has a road/path as its main connector'));
  assert.ok(cached.includes('Always include path'));
  assert.ok(cached.includes('path, river, waterfall, pond, sea, bridge, portal'));
  assert.ok(cached.includes('Do NOT include bridge for a distant, decorative, symbolic, broken, inaccessible, or background bridge'));
  assert.ok(cached.includes('mask selector will choose geometry only from exact requiredFeatures matches'));
  assert.ok(cached.includes('bridge does not imply river'));
  assert.ok(!cached.includes('Each illustration must include environmentId, primaryRead, sceneVisual, and mapTile.'));
  assert.ok(!cached.includes('connectorIntent'));
  assert.ok(!cached.includes('landscapeLayout'));
}

function testDirectorRuntimePromptKeepsAnchorSceneSingleMomentRules() {
  const prompt = buildDirectorPrompt({
    imagesPerStory: 2,
    blocks: [
      {
        blockIndex: 0,
        sceneStart: 1,
        sceneEnd: 2,
        blockText: 'Scene 1: [excited] Mia opens a red umbrella by the garden gate. Scene 2: She walks to the library.',
      },
      {
        blockIndex: 1,
        sceneStart: 3,
        sceneEnd: 4,
        blockText: 'Scene 3: Mia reads at a cozy table. Scene 4: She waves goodbye at the door.',
      },
    ],
    spec: {
      language: 'en',
      ageGroup: '6-8',
      characters: [],
      imageStyle: 'soft_watercolor',
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
          targetWordsRange: [60, 90],
          dialogRatio: 0.3,
        },
        promptGuidelines: '',
      },
    } as any,
    userCharacters: [{ id: 'u-123', name: 'Mia' }],
  });

  assert.ok(prompt.includes('Each illustration MUST depict the FIRST scene of its block (Scene X).'));
  assert.ok(prompt.includes('could a single photograph capture everything you described?'));
  assert.ok(prompt.includes('would the key plot action still read clearly if this were a single 16:9 illustration viewed small on screen?'));
  assert.ok(prompt.includes('decide the primary read of the image in one short phrase for yourself'));
  assert.ok(prompt.includes('If you find yourself trying to show both a big environment reveal and a tiny decisive action in the same medium-wide frame, choose one as primary and demote the other.'));
  assert.ok(prompt.includes('every illustration MUST include primaryRead: a short English phrase, roughly 3-10 words'));
  assert.ok(prompt.includes('primaryRead is the ONLY explicit focus field.'));
  assert.ok(prompt.includes('must not introduce story-significant props, held items, or costume pieces'));
  assert.ok(prompt.includes('reference-grounded identities in the downstream image pipeline'));
  assert.ok(prompt.includes('do NOT rewrite their full visual identity here'));
  assert.ok(prompt.includes('Do NOT restate, paraphrase, or sneak in stable identity traits there such as hairstyle, ponytail/braid details'));
  assert.ok(prompt.includes('ENVIRONMENT PLATE PURITY:'));
  assert.ok(prompt.includes('If the story location includes a character-owned shell, den, nest, house, or body-adjacent place'));
  assert.ok(prompt.includes('Do not write scale notes like "waist-high to Emilia"'));
  assert.ok(prompt.includes('Bad environment description: "Matilda\'s Shell Forest with waist-high (to Emilia) ferns where snails gather."'));
  assert.ok(prompt.includes('Good environment description: "Miniature moss clearing on a large inert shell-shaped landform'));
  assert.ok(!prompt.includes('eye level, focal point'));
  assert.ok(!prompt.includes('time-of-day atmosphere or specific focus'));
  assert.ok(!prompt.includes('AUDIO TAGS USAGE:'));
  assert.ok(!prompt.includes('[excited] Mia opens'));
  assert.ok(prompt.includes('mapTile MUST be top-level and singular with exactly two conceptual fields: requiredFeatures[] and description.'));
  assert.ok(prompt.includes('Each illustration MUST include: environmentId (string), primaryRead (short English focus phrase), sceneVisual'));
  assert.ok(prompt.includes('mapTile.description:'));
  assert.ok(prompt.includes('mapTile.requiredFeatures:'));
  assert.ok(!prompt.includes('connectorIntent'));
  assert.ok(!prompt.includes('landscapeLayout'));
}

function testMapTileBriefPromptIsLightweightBackfillOnly() {
  const cached = buildMapTileBriefPromptCachedPrefix();
  const prompt = buildMapTileBriefPrompt({
    imagesPerStory: 2,
    blocks: [
      {
        blockIndex: 0,
        sceneStart: 1,
        sceneEnd: 2,
        blockText: 'Scene 1: [whispering] A creek glows beside a mossy cave. Scene 2: A bridge crosses the creek.',
      },
      {
        blockIndex: 1,
        sceneStart: 3,
        sceneEnd: 3,
        blockText: 'Scene 3: Crystal gates shine inside the cavern.',
      },
    ],
    spec: {
      language: 'en',
      ageGroup: '6-8',
      characters: [],
      imageStyle: 'soft_watercolor',
    } as any,
    userCharacters: [],
  });

  assert.strictEqual(MAP_TILE_BRIEF_CACHE_KEY, 'map_tile_brief_rules_v11');
  assert.ok(cached.includes('Return exactly these direct top-level fields: description, requiredFeatures.'));
  assert.ok(cached.includes('Do not wrap the result in a mapTile object.'));
  assert.ok(cached.includes('Return one compact English paragraph with drawable visual information only.'));
  assert.ok(cached.includes('Each visual idea should appear at only one priority level'));
  assert.ok(cached.includes('Route geometry is controlled later by a mask'));
  assert.ok(cached.includes('Use only these exact lowercase tokens'));
  assert.ok(prompt.includes('MAP TILE BRIEF RUNTIME INPUT:'));
  assert.ok(prompt.includes('A creek glows beside a mossy cave.'));
  assert.ok(prompt.includes('Crystal gates shine inside the cavern.'));
  assert.ok(prompt.includes('Return JSON with direct top-level fields only:'));
  assert.ok(!prompt.includes('Include characters, outfits, environments, mapTile, and illustrations.'));
  assert.ok(!prompt.includes('CHARACTER DNA:'));
  assert.ok(!prompt.includes('VISUAL FOCUS HIERARCHY:'));
  assert.ok(!prompt.includes('[whispering]'));
}

testDirectorCachedPrefixContainsImagePromptRules();
testDirectorRuntimePromptKeepsAnchorSceneSingleMomentRules();
testMapTileBriefPromptIsLightweightBackfillOnly();
console.log('directorPromptRules tests passed');
