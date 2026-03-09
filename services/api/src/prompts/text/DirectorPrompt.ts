/**
 * Director Prompt — visual descriptions for N illustrations only
 * Used by Director flow (plain text + separate visual pass)
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';

export interface DirectorPromptParams {
  blocks: Array<{ blockIndex: number; sceneStart: number; sceneEnd: number; blockText: string }>;
  imagesPerStory: number;
  spec: StorySpec;
  /** User characters with IDs — same format as main flow for reliable matching */
  userCharacters: Array<{ id?: string; name: string }>;
}

const DIRECTOR_SYSTEM_PROMPT = `You are the visual director for a children's story. Your role is to translate the story text into visual descriptions for illustrations: describe characters (appearance, clothing), environments (locations, setting), and the composition of each image (camera angle, character placement, lighting). You do not write the story text — it is already written. You are responsible only for how the story will look in illustrations: what to draw, where to place elements, what angle to show. Your descriptions go to an image generation system, so they must be concrete, visual, and in English.

The story text may lack visual details (e.g. character appearance, room layout). You may invent such details yourself — but never contradict what is explicitly stated in the text.`;

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
  });

  const blocksText =
    imagesPerStory === 1
      ? blocks.map(b => `STORY (all scenes):\n${b.blockText}`).join('\n\n')
      : blocks
          .map(b =>
            b.sceneStart === b.sceneEnd
              ? `BLOCK ${b.blockIndex + 1} — ILLUSTRATION ${b.blockIndex + 1} = Scene ${b.sceneStart}:\n${b.blockText}`
              : `BLOCK ${b.blockIndex + 1} — ILLUSTRATION ${b.blockIndex + 1} MUST depict Scene ${b.sceneStart}. Scenes ${b.sceneStart + 1}-${b.sceneEnd} are CONTEXT:\n${b.blockText}`
          )
          .join('\n\n---\n\n');

  let instructionBlock: string;
  if (imagesPerStory === 1) {
    instructionBlock = `Create ONE summary illustration that captures the most important moments of the story. Do not tie it to a single scene — show the essence of the whole story.`;
  } else {
    instructionBlock = `Create one illustration per block. Each illustration MUST depict the FIRST scene of its block (Scene X). The other scenes in the block are CONTEXT: use them for continuity (e.g. if a character gets glasses in scene 2, consider including them in scene 1 if they had them all along), but the illustration itself shows only what happens in Scene X.

CRITICAL - INTERNAL CONSISTENCY (all fields must describe the SAME place and moment):
- setting, cameraComposition.shot, cameraComposition.characters, and lighting MUST all refer to ONE location and ONE moment in time — the moment of Scene X.
- If Scene X is in a car, setting must describe the car interior — never a later location from the context scenes.
- Before outputting, verify: could a single photograph capture everything you described? If not, fix the inconsistency.

CONSISTENCY ACROSS ILLUSTRATIONS: Scan all blocks before creating each illustration. If an accessory, prop, or detail (backpack, glasses, hat) appears in a later block, include it in earlier illustrations when it makes narrative sense. Exception: when the story explicitly introduces a new item (e.g. a gift received in block 2), do not add it to block 1.

STATIC OBJECTS CONSISTENCY: Key static objects (tree, building, path, bushes, flower, rock) MUST be in environments[].description with fixed position and mutual layout. Across all illustrations in the same environment, objects stay in the same positions relative to each other. No new static objects in sceneVisual — only state changes (bloomed, lit up) for objects from environment. The object must appear on the environment image.`;
  }

  return helpers.cleanTemplate`
${DIRECTOR_SYSTEM_PROMPT}

CONTENT POLICY (MUST follow):
${contentPolicy.textPromptSection}

VISUAL RULES:
${visualRules}

${userCharacters.length > 0 ? `USER-SELECTED CHARACTERS (must appear in story): ${helpers.formatUserCharactersWithIds(userCharacters)}

IMPORTANT: When referencing these user characters in your output (characters array and cameraComposition.characters), use the exact format with ID: "Name [ID: uuid]". This preserves identity for image generation.` : ''}

STORY BLOCKS (one block per illustration):
${blocksText}

${instructionBlock}

Return JSON with: characters (array), environments (array), illustrations (array of ${imagesPerStory} items).
Each illustration: environmentId, sceneVisual (setting, cameraComposition, lighting).
All descriptions must be IN ENGLISH.

CHARACTERS ARRAY: Include all characters who appear. User-selected characters (from context) — use their existing descriptions. NEW characters introduced in the story — add to characters array with DETAILED visual description (appearance, colors, size, distinctive features) for image generation.
`;
}
