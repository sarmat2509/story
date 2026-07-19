import assert from 'node:assert/strict';
import {
  buildGraphicNovelPrompt,
  buildGraphicNovelPageRepairPrompt,
  buildGraphicNovelSafetyFallbackPrompt,
  GRAPHIC_NOVEL_CAPTION_MAX_CHARS,
  GRAPHIC_NOVEL_LINE_MAX_CHARS,
  GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS,
  GRAPHIC_NOVEL_SCRIPT_SCHEMA,
  GRAPHIC_NOVEL_SPEAKER_MAX_CHARS,
} from '../text';
import type { StorySpec } from '../../ai/types';

const spec: StorySpec = {
  language: 'en',
  ageGroup: '6-8',
  goal: 'friendship',
  goalName: 'Friendship',
  characters: [
    {
      id: 'char-1',
      name: 'Mira',
      type: 'child',
      role: 'hero',
      referencePhotos: [{ url: 'characters/mira.png' }],
      description: 'Curious child with bright red glasses.',
    } as any,
  ],
  userNotes: 'Make it mostly dialogue.',
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
      dialogRatio: 0.8,
    },
    promptGuidelines: '',
  },
  scenarioCard: {
    id: 'space-rescue',
    name: 'Space Rescue',
    description: 'A friendly space mission.',
    promptGuidance: 'Keep the adventure hopeful and grounded in cooperative discovery.',
  },
  scenarioGuidance: 'A sleepy comet appears near a family space station before sunrise.',
  worldRule: {
    name: 'Gentle Gravity',
    description: 'Kind words make floating objects drift closer.',
  },
};

const easierPrompt = buildGraphicNovelPrompt({
  spec: { ...spec, storyComplexityAgeGroup: '2-3', storyComplexityAdjustment: -2 },
  pageCount: 5,
});
assert.match(easierPrompt, /Use exactly 2 panels per page/);
assert.doesNotMatch(easierPrompt, /Use 4-6 panels per page/);

const prompt = buildGraphicNovelPrompt({ spec, pageCount: 8 });
const fallbackPrompt = buildGraphicNovelSafetyFallbackPrompt({ spec, pageCount: 8 });
const repairPage = {
  pageNumber: 2,
  pageRole: 'setup',
  panels: [
    {
      panelId: 'p2-1',
      dialogue: [{ speaker: 'Mira', text: 'The storm is here, I will run outside!' }],
      thoughts: [],
      visual: {
        environmentId: 'env_safe_room',
        primaryRead: 'Mira runs into storm',
        sceneVisual: {
          setting: 'Mira starts running into the strong storm.',
          lighting: 'dark storm light',
          cameraComposition: {
            shot: 'medium shot',
            characters: [
              {
                name: 'Mira',
                position: 'center_foreground',
                description: 'running toward the open door',
                outfitId: 'out_mira_default',
              },
            ],
          },
        },
      },
    },
    {
      panelId: 'p2-2',
      dialogue: [{ speaker: 'Mira', text: 'I can fix it by myself.' }],
      thoughts: [],
      visual: {
        environmentId: 'env_safe_room',
        primaryRead: 'Mira reaches the door',
        sceneVisual: {
          setting: 'The door is open to the storm.',
          lighting: 'dark storm light',
          cameraComposition: {
            shot: 'wide shot',
            characters: [
              {
                name: 'Mira',
                position: 'left_foreground',
                description: 'standing by the doorway',
                outfitId: 'out_mira_default',
              },
            ],
          },
        },
      },
    },
  ],
} as any;
const repairPrompt = buildGraphicNovelPageRepairPrompt({
  spec,
  pageCount: 8,
  script: {
    title: 'Safe Storm',
    description: 'A gentle safety repair test.',
    language: 'en',
    characters: [],
    environments: [
      {
        id: 'env_safe_room',
        name: 'Safe Room',
        description: 'A warm room with windows.',
      },
    ],
    outfits: [
      {
        id: 'out_mira_default',
        characterName: 'Mira',
        description: 'yellow hoodie and jeans',
      },
    ],
    pages: [repairPage],
  } as any,
  page: repairPage,
  feedback: [
    {
      category: 'content_policy',
      severity: 'medium',
      message: 'A strong storm is approaching, and the child decides to run outside alone.',
      suggestion: 'Keep the child sheltered and ask for help.',
    },
  ],
});

assert.match(prompt, /Create exactly 8 pages/);
assert.match(
  prompt,
  /Theme guidance \(binding\): Keep the adventure hopeful and grounded in cooperative discovery\./
);
assert.match(
  prompt,
  /Creative seed \(loose direction, not an outline\): A sleepy comet appears near a family space station before sunrise\./
);
assert.match(
  prompt,
  /freely invent the conflict, story events, supporting cast, surprises, and resolution/
);
assert.match(prompt, /ROLE BOUNDARY/);
assert.match(prompt, /not the visual identity director/);
assert.match(prompt, /CONTENT POLICY/);
assert.match(prompt, /GRAPHIC NOVEL SAFETY STAGING/);
assert.match(prompt, /Children must not run into a storm/);
assert.match(prompt, /SAFETY GUIDELINES/);
assert.match(prompt, /Every page MUST have at least 2 panels/);
assert.match(prompt, /Do not write prose paragraphs/);
assert.match(prompt, /mostly dialogue and first-person thoughts/);
assert.match(prompt, /dialogue\/thoughts\/caption and visual/);
assert.match(prompt, /Create outfits\[\] once for canonical wardrobe bindings/);
assert.match(prompt, /OUTFITS:/);
assert.match(prompt, /Detailed wardrobe descriptions are ONLY for child\/person\/human characters/);
assert.match(prompt, /Animal, imaginary, creature, object, vehicle, or environmental characters/);
assert.match(prompt, /Non-human rows are technical natural-appearance bindings only/);
assert.match(prompt, /Use 4-6 panels per page/);
assert.match(
  prompt,
  new RegExp(`text must be ${GRAPHIC_NOVEL_LINE_MAX_CHARS} characters or fewer`)
);
assert.match(prompt, /Do not depend on server shortening text/);
assert.match(prompt, /at least 6 pages must have 4, 5, or 6 panels/);
assert.match(prompt, /Use 3-panel pages at most 2 time\(s\)/);
assert.match(prompt, /Page 1\/opening must have 4, 5, or 6 panels/);
assert.match(prompt, /Do not create 2-panel pages for age 6-8/);
assert.match(prompt, /Most panels must be dialogue exchange panels: at least 60% of all panels/);
assert.match(prompt, /never fewer than 20 panels for this 8-page story/);
assert.match(prompt, /Each dialogue exchange panel must have dialogue array length exactly 2/);
assert.match(prompt, /hard structural requirement/);
assert.match(prompt, /fewer than 20 or fewer than 60% of all panels/);
assert.match(prompt, /A qualifying exchange panel has dialogue array length exactly 2/);
assert.match(prompt, /Spread exchange panels across every page/);
assert.match(prompt, /5-panel pages should usually have at least 3 exchange panels/);
assert.match(prompt, /single-speaker, thought-only, caption-only, or silent panels sparingly/);
assert.match(prompt, /Most dialogue and thought lines should be 40-65 characters/);
assert.match(
  prompt,
  /At least half of all dialogue\/thought lines across the story should be 45 characters or longer/
);
assert.match(prompt, /at least 8 dialogue\/thought lines of 55-75 characters/);
assert.match(
  prompt,
  /For two-speaker exchange panels, each of the 2 lines should usually be 35-65 characters/
);
assert.match(prompt, /Keep spoken dialogue dominant for age 6-8/);
assert.match(prompt, /THOUGHT BUBBLE LOGIC/);
assert.match(prompt, /Include 4-6 thought bubbles across the story/);
assert.match(prompt, /private worry, private doubt, funny contrast/);
assert.match(prompt, /Thought bubbles should reveal inner voice/);
assert.match(prompt, /not already two-speaker exchange panels/);
assert.match(prompt, /spoken two-character dialogue as the dominant mode/);
assert.match(prompt, /Do not combine a caption with dialogue\/thought in the same panel/);
assert.match(
  prompt,
  /Short exclamations under 35 characters are allowed only as occasional reaction beats/
);
assert.match(prompt, /A panel may contain 2 dialogue lines/);
assert.match(prompt, /SPEAKER NAME RULES/);
assert.match(prompt, /must use exact character names from CHARACTERS/);
assert.match(prompt, /Do not mix alphabets inside a speaker name/);
assert.match(prompt, /Speaker names are used for audio, quiz, indexing, and bubble tails/);
assert.match(prompt, /Mira \(person, role: hero, visual reference: yes\)/);
assert.match(prompt, /visual reference: yes/);
assert.match(prompt, /VISUAL CHARACTER REFERENCES/);
assert.match(prompt, /Mira => REF_CH_MIRA_[A-Z0-9]{6}/);
assert.match(prompt, /write its REF_CH_\* label instead of the natural-language character name/);
assert.match(prompt, /If a REF_CH_\* label appears anywhere in a panel visual/);
assert.match(prompt, /Newly invented characters do not have REF_CH labels/);
assert.match(prompt, /Never use REF_CH_\* labels in title, description, prose text/);
assert.match(prompt, /Visual spatial relationships must identify exact subjects/);
assert.match(prompt, /"his friends"/);
assert.match(prompt, /standing between REF_CH_A and REF_CH_B/);
assert.match(prompt, /CAST COVERAGE AND PAGE FOCUS/);
assert.match(prompt, /There is no page-level character-count cap/);
assert.match(prompt, /HARD PANEL LIMIT: each individual panel may use at most 3 unique named characters total/);
assert.match(prompt, /EVERY-PAGE CHILD PROTAGONIST: Mira must appear visibly on every page/);
assert.match(prompt, /not a page-level hard cap/);
assert.match(prompt, /Every child protagonist named in CAST COVERAGE AND PAGE FOCUS must appear/);
assert.match(prompt, /outfitId: exact outfits\[\]\.id for this character in this shot/);
assert.match(prompt, /animals\/imaginary\/creatures use a natural-appearance binding/);
assert.match(prompt, /main acted-on subject of primaryRead\/setting counts as a visible character/);
assert.match(prompt, /REFERENCE-GROUNDED CHARACTER RULES/);
assert.match(prompt, /Their visual identity comes from the reference image/);
assert.match(prompt, /reference-safe: placement, pose, action, emotion, gaze direction, gesture/);
assert.match(prompt, /position is semantic staging only/);
assert.match(prompt, /Good reference-safe staging/);
assert.doesNotMatch(prompt, /\(child[,)]/);
assert.doesNotMatch(prompt, /Bad for a referenced child/);
assert.doesNotMatch(prompt, /Curious child with bright red glasses/);
assert.doesNotMatch(prompt, /face\/mouth\/head/);
assert.doesNotMatch(prompt, /child's face/);
assert.doesNotMatch(prompt, /body\/figure center/);
assert.doesNotMatch(prompt, /facial expression/);
assert.doesNotMatch(prompt, /normalized panel coordinates/);
assert.doesNotMatch(prompt, /anchor/);
assert.doesNotMatch(prompt, /speechTarget/);
assert.match(prompt, /Return 1-3 environments/);
assert.match(prompt, /visual\.environmentId must match environments\[\]\.id/);
assert.match(prompt, /placement, pose, readable expression, gaze direction, gesture/);
assert.match(prompt, /Do not output coordinates or bubble placement metadata/);
assert.match(prompt, /2 dialogue lines from 2 speakers/);
assert.match(prompt, /must not override the downstream reference image/);
assert.match(prompt, /No fixed keepsake artifact is required/);
assert.match(prompt, /A sleepy comet appears near a family space station before sunrise/);
assert.match(prompt, /Gentle Gravity: Kind words make floating objects drift closer/);
assert.match(prompt, /CREATIVE SEED FIDELITY/);
assert.match(prompt, /Treat the creative seed as a thematic direction, not an outline/);
assert.match(prompt, /Do not replace the seed's core direction with an unrelated generic quest/);
assert.match(prompt, /Maintain panel-to-panel continuity/);
assert.match(prompt, /off-screen story\/event that was never shown/);
assert.match(prompt, /Every panel must add a new story beat/);
assert.match(prompt, /Do not repeat the same speaker, same warning, same location update/);
assert.match(prompt, /new reaction, choice, joke, emotional shift, or visible complication/);
assert.match(prompt, /VISUAL ACTION LOGIC/);
assert.match(prompt, /exact visible cause-and-effect mechanism/);
assert.match(prompt, /visual\.primaryRead should name the affected story object or result/);
assert.match(prompt, /visual\.sceneVisual\.setting must be a visual staging delta, not a plot summary/);
assert.match(prompt, /avoid vague wording like "the object is now resting"/);
assert.match(prompt, /COMIC CAMERA VARIETY/);
assert.match(prompt, /wide\/establishing shot/);
assert.match(prompt, /at least one extreme close-up/);
assert.match(prompt, /far-left zone, far-right zone, central object\/detail, and full wide view/);
assert.match(prompt, /RARE DYNAMIC FORESHORTENING OPTION/);
assert.match(prompt, /Use this perspective in at most ONE panel across the entire story/);
assert.match(prompt, /extreme dynamic foreshortening/);
assert.match(prompt, /Preserve the requested imageStyle/);
assert.match(
  prompt,
  /what the rope, vine, lever, bridge, key, light, spell, water, or object is attached to/
);
assert.match(
  prompt,
  /A viewer should understand the physical or magical logic without reading the dialogue/
);
assert.match(
  prompt,
  /same rope\/vine\/lever\/path\/light links the characters to the affected object/
);
assert.match(prompt, /Do not write full dialogue or thought lines in ALL CAPS/);

assert.match(fallbackPrompt, /SAFETY AND TONE/);
assert.match(fallbackPrompt, /Children must not run into a storm/);
assert.match(fallbackPrompt, /Create exactly 8 pages/);
assert.match(fallbackPrompt, /Every page must have at least 2 panels/);
assert.match(fallbackPrompt, /Create outfits\[\] once for canonical wardrobe bindings/);
assert.match(fallbackPrompt, /Detailed wardrobe descriptions are ONLY for child\/person\/human characters/);
assert.match(fallbackPrompt, /Every visual\.sceneVisual\.cameraComposition\.characters\[\] item must include outfitId/);
assert.match(
  fallbackPrompt,
  /dialogue\[\]\.text and thoughts\[\]\.text must be 110 characters or fewer/
);
assert.match(
  fallbackPrompt,
  /For reference-grounded characters, describe only temporary pose\/action\/emotion\/staging/
);
assert.match(
  fallbackPrompt,
  /visible cause\/effect for action, puzzle, rescue, tool-use, or magic-effect panels/
);
assert.match(fallbackPrompt, /visual\.sceneVisual\.setting must be a visual staging delta/);
assert.match(fallbackPrompt, /COMIC CAMERA VARIETY/);
assert.match(fallbackPrompt, /Do not repeat the same shot scale, camera angle, or environment slice/);
assert.doesNotMatch(fallbackPrompt, /RARE DYNAMIC FORESHORTENING OPTION/);
assert.match(
  fallbackPrompt,
  /main acted-on subject of primaryRead\/setting counts as a visible character/
);
assert.match(fallbackPrompt, /Object-contact actions require explicit physical staging/);
assert.match(fallbackPrompt, /body position beside or in front of the fixed object/);
assert.match(fallbackPrompt, /Mira \(person, role: hero\)/);
assert.match(fallbackPrompt, /VISUAL CHARACTER REFERENCES/);
assert.match(fallbackPrompt, /Mira => REF_CH_MIRA_[A-Z0-9]{6}/);
assert.match(fallbackPrompt, /CAST COVERAGE AND PAGE FOCUS/);
assert.match(fallbackPrompt, /There is no page-level character-count cap/);
assert.match(fallbackPrompt, /No panel may contain more than 3 unique named characters total/);
assert.match(fallbackPrompt, /EVERY-PAGE CHILD PROTAGONIST: Mira must appear visibly on every page/);
assert.doesNotMatch(fallbackPrompt, /\(child[,)]/);
assert.doesNotMatch(fallbackPrompt, /normalized/);
assert.doesNotMatch(fallbackPrompt, /anchor/);
assert.doesNotMatch(fallbackPrompt, /speechTarget/);
assert.doesNotMatch(fallbackPrompt, /Bad for a referenced child/);
assert.doesNotMatch(fallbackPrompt, /Their visual identity comes from the reference image/);

assert.match(repairPrompt, /Repair exactly one graphic novel page/);
assert.match(repairPrompt, /Keep page\.pageNumber exactly 2/);
assert.match(repairPrompt, /Return exactly 2 panels/);
assert.match(repairPrompt, /A strong storm is approaching/);
assert.match(repairPrompt, /Directly remove or rewrite the unsafe beat/);
assert.match(repairPrompt, /CURRENT FAILED PAGE JSON/);
assert.match(repairPrompt, /env_safe_room/);

const repairPromptWithArtifact = buildGraphicNovelPageRepairPrompt({
  spec: {
    ...spec,
    closingArtifact: {
      id: 'artifact-1',
      artifactCode: 'STK',
      title: 'Star Key',
      description: 'A tiny key with a star shape.',
      imagePath: '/artifacts/star-key.png',
    },
  },
  pageCount: 8,
  script: {
    title: 'Safe Storm',
    description: 'A gentle safety repair test.',
    language: 'en',
    characters: [],
    environments: [
      {
        id: 'env_safe_room',
        name: 'Safe Room',
        description: 'A warm room with windows.',
      },
    ],
    pages: [repairPage],
  } as any,
  page: repairPage,
  visualArtifactReferenceLabel: 'REF_OBJ_STAR_KEY_TEST01',
  feedback: [{ message: 'Keep the keepsake visible while making the scene safe.' }],
});
assert.match(repairPromptWithArtifact, /CLOSING ARTIFACT/);
assert.match(repairPromptWithArtifact, /Visual artifact reference: REF_OBJ_STAR_KEY_TEST01/);
assert.match(repairPromptWithArtifact, /braced artifact phrase[\s\S]*same panel visual must also include REF_OBJ_STAR_KEY_TEST01/);

const promptWithArtifact = buildGraphicNovelPrompt({
  spec: {
    ...spec,
    closingArtifact: {
      id: 'artifact-1',
      artifactCode: 'STK',
      title: 'Star Key',
      description: 'A tiny key with a star shape.',
      imagePath: '/artifacts/star-key.png',
    },
  },
  pageCount: 8,
  visualArtifactReferenceLabel: 'REF_OBJ_STAR_KEY_TEST01',
});
assert.match(promptWithArtifact, /Closing keepsake artifact: Star Key/);
assert.match(promptWithArtifact, /Artifact identity: A tiny key with a star shape\./);
assert.match(promptWithArtifact, /artifact phrase wrapped in braces/);
assert.match(promptWithArtifact, /do not force Title Case/);
assert.match(promptWithArtifact, /\{star key\}/);
assert.match(promptWithArtifact, /dialogue\[\]\.text, thoughts\[\]\.text, or caption only/);
assert.match(promptWithArtifact, /Visual artifact reference: REF_OBJ_STAR_KEY_TEST01/);
assert.match(promptWithArtifact, /visual\.primaryRead[\s\S]*must name REF_OBJ_STAR_KEY_TEST01/);
assert.match(promptWithArtifact, /first visible appearance[\s\S]*falling object/);
assert.match(promptWithArtifact, /braced artifact phrase[\s\S]*same panel visual must also include REF_OBJ_STAR_KEY_TEST01/);
assert.match(promptWithArtifact, /do not call or depict it as a generic golden instrument/);

const continuationPrompt = buildGraphicNovelPrompt({
  spec,
  pageCount: 8,
  isContinuation: true,
  continuationContext: {
    previousOutlines: [
      {
        title: 'First Mission',
        moral: 'Friends help each other.',
        scenes: [{ setting: 'orbit', goal: 'Mira helped the comet find its path.' }],
      },
    ],
    requiredCharacters: [
      {
        name: 'Mira',
        type: 'child',
        description: 'Curious child with bright red glasses.',
        role: 'hero',
      },
    ],
    optionalCharacters: [],
    usedPlots: [],
  },
});
assert.match(continuationPrompt, /STORY CONTINUATION/);
assert.match(continuationPrompt, /graphic novel script format/);
assert.doesNotMatch(continuationPrompt, /Friends help each other\./);

const pageSchema = (GRAPHIC_NOVEL_SCRIPT_SCHEMA.properties.pages as any).items;
const panelSchema = pageSchema.properties.panels;
const dialogueLineSchema = panelSchema.items.properties.dialogue.items.properties;
const thoughtLineSchema = panelSchema.items.properties.thoughts.items.properties;
const environmentSchema = (GRAPHIC_NOVEL_SCRIPT_SCHEMA.properties.environments as any).items;
const outfitsSchema = GRAPHIC_NOVEL_SCRIPT_SCHEMA.properties.outfits as any;
assert.equal(panelSchema.minItems, 2);
assert.ok((GRAPHIC_NOVEL_SCRIPT_SCHEMA.required as string[]).includes('environments'));
assert.ok((GRAPHIC_NOVEL_SCRIPT_SCHEMA.required as string[]).includes('outfits'));
assert.ok(environmentSchema.required.includes('id'));
assert.ok(environmentSchema.required.includes('description'));
assert.ok(outfitsSchema.items.required.includes('id'));
assert.ok(outfitsSchema.items.required.includes('characterName'));
assert.ok(outfitsSchema.items.required.includes('description'));
assert.match(
  outfitsSchema.items.properties.description.description,
  /child\/person\/human characters/
);
assert.equal(dialogueLineSchema.speaker.maxLength, GRAPHIC_NOVEL_SPEAKER_MAX_CHARS);
assert.equal(dialogueLineSchema.text.maxLength, GRAPHIC_NOVEL_LINE_MAX_CHARS);
assert.equal(thoughtLineSchema.text.maxLength, GRAPHIC_NOVEL_LINE_MAX_CHARS);
assert.equal(panelSchema.items.properties.caption.maxLength, GRAPHIC_NOVEL_CAPTION_MAX_CHARS);
const visualSchema = panelSchema.items.properties.visual;
const cameraCompositionSchema = visualSchema.properties.sceneVisual.properties.cameraComposition;
assert.ok(visualSchema.required.includes('environmentId'));
assert.ok(visualSchema.required.includes('primaryRead'));
assert.ok(visualSchema.required.includes('sceneVisual'));
assert.ok(visualSchema.properties.sceneVisual.required.includes('cameraComposition'));
assert.ok(cameraCompositionSchema.required.includes('characters'));
assert.match(cameraCompositionSchema.properties.shot.description, /environment slice/);
assert.match(cameraCompositionSchema.properties.shot.description, /extreme close-up/);
assert.equal(
  cameraCompositionSchema.properties.characters.maxItems,
  GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS
);
assert.ok(
  cameraCompositionSchema.properties.characters.items.required.includes(
    'description'
  )
);
assert.ok(
  cameraCompositionSchema.properties.characters.items.required.includes(
    'position'
  )
);
assert.ok(
  cameraCompositionSchema.properties.characters.items.required.includes(
    'outfitId'
  )
);
assert.ok(
  !cameraCompositionSchema.properties.characters.items.required.includes(
    'anchor'
  )
);
assert.ok(
  !cameraCompositionSchema.properties.characters.items.required.includes(
    'speechTarget'
  )
);
assert.equal(
  cameraCompositionSchema.properties.characters.items.properties.anchor,
  undefined
);
assert.equal(
  cameraCompositionSchema.properties.characters.items.properties.speechTarget,
  undefined
);
assert.match(
  cameraCompositionSchema.properties.characters.items.properties.description.description,
  /do not override stable identity/
);
assert.match(
  cameraCompositionSchema.properties.characters.items.properties.outfitId.description,
  /child\/person\/human characters/
);
assert.match(visualSchema.properties.primaryRead.description, /affected object\/result/);
assert.match(visualSchema.properties.primaryRead.description, /REF_OBJ_\*/);
assert.match(
  visualSchema.properties.sceneVisual.properties.setting.description,
  /visible cause\/effect/
);
assert.match(
  visualSchema.properties.sceneVisual.properties.setting.description,
  /visual staging delta, not a plot summary/
);
assert.match(visualSchema.properties.sceneVisual.properties.setting.description, /REF_OBJ_\*/);
assert.match(
  cameraCompositionSchema.properties.characters.items.properties.description.description,
  /Object-contact actions require explicit physical staging/
);
assert.equal(GRAPHIC_NOVEL_LINE_MAX_CHARS, 110);
assert.equal(GRAPHIC_NOVEL_CAPTION_MAX_CHARS, 90);
assert.ok(panelSchema.items.required.includes('dialogue'));
assert.ok(panelSchema.items.required.includes('thoughts'));
assert.ok(panelSchema.items.required.includes('visual'));
assert.ok(!panelSchema.items.required.includes('visualAction'));
assert.ok(!panelSchema.items.required.includes('panelVisual'));
assert.ok(!panelSchema.items.required.includes('artPrompt'));

console.log('graphicNovelPrompt tests passed');
