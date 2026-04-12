import assert from 'node:assert/strict';
import {
  buildDirectorPrompt,
  buildDirectorPromptCachedPrefix,
  DIRECTOR_CACHE_KEY,
} from '../text';

function testDirectorCachedPrefixContainsImagePromptRules() {
  const cached = buildDirectorPromptCachedPrefix();

  assert.strictEqual(DIRECTOR_CACHE_KEY, 'director_rules_v10');
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
  assert.ok(cached.includes('Each illustration must include environmentId, primaryRead, and sceneVisual.'));
  assert.ok(cached.includes('Do not place the primary read in the far background while also expecting strong facial likeness'));
  assert.ok(cached.includes('non-primary characters should usually get simple supporting behavior'));
  assert.ok(cached.includes('If the scene contains both a large location reveal (bridge, ravine, tower, gate, courtyard, cliff, long path) and a small decisive action'));
  assert.ok(cached.includes('If the primary read is an exchange or handoff, the giver, receiver, and object must sit in one clear readable cluster'));
  assert.ok(cached.includes('When an environment image will exist downstream, treat environment layout as a fixed support layer.'));
  assert.ok(cached.includes('For reference-grounded animals or creature companions, prefer morphology-safe wording'));
  assert.ok(cached.includes('If a barrier or depth transition (ravine, river, bridge span, doorway threshold, cliff edge, balcony gap) separates camera from the key action'));
  assert.ok(cached.includes('For handoffs, gifts, exchanges, or receiving moments: one supporting character may witness or present'));
  assert.ok(cached.includes('Avoid extra flourishes like mid-hop comedy beats, tongue-out poses, big wing flourishes, or dramatic hover loops'));
  assert.ok(cached.includes('For non-human sidekicks or creature companions that are reference-grounded but not the primary read, prefer calm, readable poses'));
  assert.ok(cached.includes('keep its silhouette, head shape, ear/wing shape, facial marking pattern, and overall body proportions stable'));
  assert.ok(cached.includes('Avoid bracketed stage-direction tags or meta markers such as "[excited]"'));
  assert.ok(cached.includes('sceneVisual must visually realize primaryRead, not fight it.'));
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
  assert.ok(!prompt.includes('eye level, focal point'));
  assert.ok(!prompt.includes('time-of-day atmosphere or specific focus'));
  assert.ok(!prompt.includes('AUDIO TAGS USAGE:'));
  assert.ok(!prompt.includes('[excited] Mia opens'));
  assert.ok(prompt.includes('Each illustration MUST include: environmentId (string), primaryRead (short English focus phrase), sceneVisual'));
}

testDirectorCachedPrefixContainsImagePromptRules();
testDirectorRuntimePromptKeepsAnchorSceneSingleMomentRules();
console.log('directorPromptRules tests passed');
