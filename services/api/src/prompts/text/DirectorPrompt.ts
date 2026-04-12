/**
 * Director Prompt — visual descriptions for N illustrations only
 * Used by Director flow (plain text + separate visual pass)
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';
import { stripAllTags } from '../../utils/audioTags';

export interface DirectorPromptParams {
  blocks: Array<{ blockIndex: number; sceneStart: number; sceneEnd: number; blockText: string }>;
  imagesPerStory: number;
  spec: StorySpec;
  /** User characters with IDs — same format as main flow for reliable matching */
  userCharacters: Array<{ id?: string; name: string }>;
}

export const DIRECTOR_CACHE_KEY = 'director_rules_v10';

const DIRECTOR_SYSTEM_PROMPT = `You are the visual director for a children's story. Your role is to translate the story text into visual descriptions for illustrations: describe characters (appearance, clothing), environments (locations, setting), and the composition of each image (camera angle, character placement, lighting). You do not write the story text — it is already written. You are responsible only for how the story will look in illustrations: what to draw, where to place elements, what angle to show. Your descriptions go to an image generation system, so they must be concrete, visual, and in English.

The story text may lack visual details (e.g. character appearance, room layout). You may invent such details yourself — but never contradict what is explicitly stated in the text.`;

export function buildDirectorPromptCachedPrefix(): string {
  const imagePromptRules = helpers.formatDirectorImagePromptRules();
  return `${DIRECTOR_SYSTEM_PROMPT}

General Director rules:
- Output visual descriptions only, never rewrite story text.
- All descriptions must be in English.
- Keep illustrations faithful to the anchor scene.
- Maintain consistency of characters, wardrobe, props, and environments across illustrations.
- sceneVisual fields must describe one place and one moment only.

Output contract:
- Return JSON only.
- Include characters, outfits, environments, and illustrations.
- Each illustration must include environmentId, primaryRead, and sceneVisual.
- Each cameraComposition.characters row must include name, description, and outfitId.
- New characters must receive detailed visual descriptions for image generation.

${imagePromptRules}`;
}

export function buildDirectorPrompt(params: DirectorPromptParams): string {
  const { blocks, imagesPerStory, spec, userCharacters } = params;

  const contentPolicy = getContentPolicy({
    policyProfile: spec.policyProfile,
    scenarioCardId: spec.scenarioCard?.id,
  });

  const visualRules = helpers.formatVisualStoryRules({
    imageStyle: spec.imageStyle,
    scenarioCardId: spec.scenarioCard?.id,
    policyProfile: spec.policyProfile,
    includeAudioTagsRules: false,
  });

  const blocksText =
    imagesPerStory === 1
      ? blocks.map(b => `STORY (all scenes):\n${stripAllTags(b.blockText)}`).join('\n\n')
      : blocks
          .map(b =>
            b.sceneStart === b.sceneEnd
              ? `BLOCK ${b.blockIndex + 1} — ILLUSTRATION ${b.blockIndex + 1} = Scene ${b.sceneStart}:\n${stripAllTags(b.blockText)}`
              : `BLOCK ${b.blockIndex + 1} — ILLUSTRATION ${b.blockIndex + 1} MUST depict Scene ${b.sceneStart}. Scenes ${b.sceneStart + 1}-${b.sceneEnd} are CONTEXT:\n${stripAllTags(b.blockText)}`
          )
          .join('\n\n---\n\n');

  const physicalReadability = helpers.formatDirectorPhysicalReadabilityRules();
  const deicticActions = helpers.formatDirectorDeicticActionsRules();
  const functionalDeviceComposition = helpers.formatDirectorFunctionalDeviceCompositionRules();

  let instructionBlock: string;
  const costumeRules = helpers.formatDirectorCostumeContinuityRules();
  const wardrobeContract = helpers.formatDirectorWardrobeContract({ imagesPerStory });

  if (imagesPerStory === 1) {
    instructionBlock = `Create ONE summary illustration that captures the most important moments of the story. Do not tie it to a single scene — show the essence of the whole story.

ANCHOR / STORY FIDELITY: Do not add story-significant props, held items, or costume on characters that are not supported by the written story for the moments you depict. Generic background and atmosphere are fine.

${costumeRules}

${wardrobeContract}`;
  } else {
    instructionBlock = `Create one illustration per block. Each illustration MUST depict the FIRST scene of its block (Scene X). The other scenes in the block are CONTEXT: use them for continuity (e.g. if a character gets glasses in scene 2, consider including them in scene 1 if they had them all along), but the illustration itself shows only what happens in Scene X.

CRITICAL - INTERNAL CONSISTENCY (all fields must describe the SAME place and moment):
- setting, cameraComposition.shot, cameraComposition.characters, and lighting MUST all refer to ONE location and ONE moment in time — the moment of Scene X.
- If Scene X is in a car, setting must describe the car interior — never a later location from the context scenes.
- Before outputting, verify: could a single photograph capture everything you described? If not, fix the inconsistency.
- Also verify renderability: would the key plot action still read clearly if this were a single 16:9 illustration viewed small on screen? If not, simplify the moment or choose a closer shot.
- Before outputting, decide the primary read of the image in one short phrase for yourself. Then make every other detail support that read instead of competing with it.
- If you find yourself trying to show both a big environment reveal and a tiny decisive action in the same medium-wide frame, choose one as primary and demote the other.
- In your JSON, every illustration MUST include primaryRead: a short English phrase, roughly 3-10 words, naming the main visual read. Example: "Emilia receives the clay pot". This field is for focus discipline; sceneVisual must obey it.
- primaryRead is the ONLY explicit focus field. Do not write a second focus declaration elsewhere in sceneVisual such as "the focal point is...", "the focus is...", or another competing statement of what matters most.

ANCHOR SCENE FIDELITY: For each illustration, sceneVisual for the anchor scene must not introduce story-significant props, held items, or costume pieces that are not supported by that scene's text for that moment. Generic background and setting detail are allowed.

CONSISTENCY ACROSS ILLUSTRATIONS: Scan all blocks before creating each illustration. If an accessory, prop, or detail (backpack, glasses, hat) appears in a later block, include it in earlier illustrations when it makes narrative sense. Exception: when the story explicitly introduces a new item (e.g. a gift received in block 2), do not add it to block 1.

CARRIED ITEMS ACROSS ILLUSTRATIONS: When the same story segment implies a character repeatedly keeps the same portable gear, reflect it consistently in outfits[].description (as worn/carried wardrobe items only), reuse the same outfitId on that character's cameraComposition row, and show it in illustrations for that segment unless the text explicitly removes or exchanges it. Do not show new portable gear only in a late illustration without support in the story text.

STATIC OBJECTS CONSISTENCY: Key static objects (tree, building, path, bushes, flower, rock) MUST be in environments[].description with fixed position and mutual layout. Across all illustrations in the same environment, objects stay in the same positions relative to each other. No new static objects in sceneVisual — only state changes (bloomed, lit up) for objects from environment. The object must appear on the environment image.

${costumeRules}

${wardrobeContract}`;
  }

  return helpers.cleanTemplate`
${DIRECTOR_SYSTEM_PROMPT}

CONTENT POLICY (MUST follow):
${contentPolicy.textPromptSection}

VISUAL RULES:
${visualRules}

${userCharacters.length > 0 ? `USER-SELECTED CHARACTERS (must appear in story): ${helpers.formatUserCharactersWithIds(userCharacters)}

IMPORTANT: When referencing these user characters in your output (characters array and cameraComposition.characters), use the exact format with ID: "Name [ID: uuid]". This preserves identity for image generation.
USER-SELECTED CHARACTERS are reference-grounded identities in the downstream image pipeline. Do NOT invent or overwrite a new canonical face, hair, body, skin-tone, or default-clothing specification for them in characters[].description.
For these user-selected characters, keep characters[].description minimal and reference-compatible. Use it only for a short neutral anchor when required by the schema. In sceneVisual.cameraComposition.characters[].description, describe only the frozen-moment information: pose, expression, gaze, head turn, hand use, action, placement, and temporary visibility/occlusion. Do NOT restate, paraphrase, or sneak in stable identity traits there such as hairstyle, ponytail/braid details, hair color, eye color, freckles, face shape, skin tone, body build, age markers, or other enduring appearance details. If you catch yourself naming a permanent face/hair feature from the sheet, remove it and replace it with a neutral visible action description. Put wardrobe only in outfits[].description.` : ''}

STORY BLOCKS (one block per illustration):
${blocksText}

${physicalReadability}

${deicticActions}

${functionalDeviceComposition}

${instructionBlock}

OUTPUT JSON — order helps you satisfy dependencies: (1) characters, (2) outfits (define every id you will use), (3) environments (one row per unique environmentId referenced below), (4) illustrations (length ${imagesPerStory}).
Each illustration MUST include: environmentId (string), primaryRead (short English focus phrase), sceneVisual (setting, cameraComposition with shot + characters[], lighting).
Each cameraComposition.characters[] row MUST include: name, description, outfitId (exact outfits[].id for that character in this shot). Non-empty characters array; every person in the frame must have outfitId set — the schema enforces this like environmentId.
Wardrobe descriptions must match weather, season, and indoor/outdoor context of the anchor moment.
All descriptions must be IN ENGLISH.

CHARACTERS ARRAY: Include all characters who appear. User-selected characters (from context) are reference-defined identities downstream, so do NOT rewrite their full visual identity here; keep their characters[].description brief, neutral, and non-conflicting. NEW characters introduced in the story — add to characters array with DETAILED visual description (appearance, colors, size, distinctive features) for image generation.
`;
}
