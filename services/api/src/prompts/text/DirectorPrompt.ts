/**
 * Director Prompt — visual descriptions for N illustrations only
 * Used by Director flow (plain text + separate visual pass)
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';
import { stripAllTags } from '../../utils/audioTags';
import { MAX_SCENE_IMAGE_CHARACTERS } from '../../domain/story/sceneCharacterLimits';

export interface DirectorPromptParams {
  blocks: Array<{ blockIndex: number; sceneStart: number; sceneEnd: number; blockText: string }>;
  imagesPerStory: number;
  spec: StorySpec;
  /** Existing identities. Names are localized display values; characterRef is authoritative. */
  userCharacters: Array<{
    id?: string;
    characterRef?: string;
    name: string;
    canonicalName?: string;
    nameAliases?: string[];
  }>;
}

/** Stable opt-in rate: retries for the same story keep the same camera-variation decision. */
export const DIRECTOR_DYNAMIC_FORESHORTENING_PERCENT = 20;

function stableDirectorVariationHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shouldEnableDirectorDynamicForeshortening(params: DirectorPromptParams): boolean {
  if (params.imagesPerStory <= 0 || params.blocks.length === 0) return false;

  const seed = [
    params.imagesPerStory,
    params.spec.language,
    params.spec.ageGroup,
    params.spec.imageStyle ?? '',
    ...params.blocks.map(
      (block) => `${block.blockIndex}:${block.sceneStart}:${block.sceneEnd}:${block.blockText}`
    ),
  ].join('\u241e');

  return stableDirectorVariationHash(seed) % 100 < DIRECTOR_DYNAMIC_FORESHORTENING_PERCENT;
}

export const DIRECTOR_CACHE_KEY = 'director_rules_v31_environment_viewpoint_kind';
export const MAP_TILE_BRIEF_CACHE_KEY = 'map_tile_brief_rules_v11';

const DIRECTOR_SYSTEM_PROMPT = `You are the visual director for a children's story. Your role is to translate the story text into visual descriptions for illustrations: describe characters (appearance, clothing), environments (locations, setting), and the composition of each image (camera angle, character placement, lighting). You do not write the story text — it is already written. You are responsible only for how the story will look in illustrations: what to draw, where to place elements, what angle to show. Your descriptions go to an image generation system, so they must be concrete, visual, and in English.

The story text may lack visual details (e.g. character appearance, room layout). You may invent such details yourself — but never contradict what is explicitly stated in the text.`;

const MAP_TILE_BRIEF_SYSTEM_PROMPT = `You create only the story-level reward map tile brief for a children's story. The brief is used later by a deterministic mask selector and an image generator to create one modular board-game tile for the whole story.

You do not create illustration prompts, characters, outfits, environments, scene visuals, or image composition data. You return only the compact map tile brief fields needed for existing-story backfill.`;

export function buildDirectorPromptCachedPrefix(): string {
  const imagePromptRules = helpers.formatDirectorImagePromptRules();
  const mapTileRules = helpers.formatDirectorMapTileRules();
  return `${DIRECTOR_SYSTEM_PROMPT}

General Director rules:
- Output visual descriptions only, never rewrite story text.
- All descriptions must be in English.
- Keep illustrations faithful to the anchor scene.
- Maintain consistency of characters, wardrobe, props, and environments across illustrations.
- sceneVisual fields must describe one place and one moment only.
- Describe character staging literally and observably: pose, direction, contact, and movement. Never use similes, metaphors, species comparisons, or transformation language as shorthand for an action. For example, write "swimming horizontally in the current, arms extended" instead of "swimming like a mermaid". Such comparisons can cause the image model to invent anatomy.
- Choose environmentId and environments[].viewpointKind for the physical volume the camera is actually inside, not merely the story's broad place name. viewpointKind must be exactly exterior, interior, submerged, or enclosed. When a scene crosses a structural viewpoint boundary — for example exterior vs interior, shore vs fully underwater, or outside a fountain vs inside its water-filled basin — create a distinct environmentId, viewpointKind, and empty environment plate. Do not reuse an exterior or side-view plate for a fully immersed/interior camera view.
- mapTile must be one top-level story reward tile brief that combines key visible landmarks from all planned illustrations.

Output contract:
- Return JSON only.
- Include characters, outfits, environments, mapTile, and illustrations.
- Each illustration must include environmentId, primaryRead, and sceneVisual. Every environments[] row must include id, name, viewpointKind, and description.
- Each cameraComposition.characters row must include characterRef, name, description, and outfitId.
- Every named character mentioned anywhere in sceneVisual.setting, cameraComposition.shot,
  cameraComposition.characters[].description, or lighting MUST also have exactly one row in
  cameraComposition.characters. If the character limit is already reached, rewrite the visual
  staging to omit the extra character completely; never leave a name only inside prose.
- New characters must receive detailed visual descriptions for image generation.
- environments[].description is a reusable EMPTY LOCATION PLATE, not a scene illustration. It must describe only stable terrain, architecture, furniture, plants, props, weather, time of day, and fixed object layout. Do not include people, animals, creatures, character poses/actions, story beats, or scale comparisons to named characters. If a location is named after a character or is on/inside a character's shell/house/den/nest, describe the visible place as inert terrain/architecture only, with no head, eyes, limbs, face, body, or living creature anatomy. Put characters only in illustrations[].sceneVisual.cameraComposition.characters.

${imagePromptRules}

${mapTileRules}`;
}

export function buildMapTileBriefPromptCachedPrefix(): string {
  const mapTileRules = helpers.formatDirectorMapTileRules();
  return `${MAP_TILE_BRIEF_SYSTEM_PROMPT}

General map tile backfill rules:
- Output JSON only.
- Return exactly these direct top-level fields: description, requiredFeatures.
- Do not wrap the result in a mapTile object.
- All description text must be in English.
- Do not generate characters, outfits, environments, illustrations, sceneVisual, primaryRead, cameraComposition, or image prompts.
- Do not choose geometry, orientation, side directions, connector directions, mask ids, or exact placement.
- Where the shared rules say mapTile.description or mapTile.requiredFeatures, fill the direct top-level JSON fields description and requiredFeatures.

${mapTileRules}`;
}

export function buildMapTileBriefPrompt(params: DirectorPromptParams): string {
  const { blocks, imagesPerStory, spec } = params;

  const blocksText =
    imagesPerStory === 1
      ? blocks.map((b) => `STORY (all scenes):\n${stripAllTags(b.blockText)}`).join('\n\n')
      : blocks
          .map((b) =>
            b.sceneStart === b.sceneEnd
              ? `BLOCK ${b.blockIndex + 1} — planned illustration ${b.blockIndex + 1} = Scene ${b.sceneStart}:\n${stripAllTags(b.blockText)}`
              : `BLOCK ${b.blockIndex + 1} — planned illustration ${b.blockIndex + 1} would depict Scene ${b.sceneStart}. Scenes ${b.sceneStart + 1}-${b.sceneEnd} are context:\n${stripAllTags(b.blockText)}`
          )
          .join('\n\n---\n\n');

  const scenarioContext = spec.scenarioCard
    ? `SCENARIO CONTEXT:\n${spec.scenarioCard.name}${spec.scenarioCard.description ? ` - ${spec.scenarioCard.description}` : ''}`
    : '';

  return helpers.cleanTemplate`
MAP TILE BRIEF RUNTIME INPUT:
Use the cached map tile brief rules above. Create only the direct JSON fields description and requiredFeatures.

${scenarioContext}

STORY BLOCKS:
${blocksText}

TASK:
Create one compact story-level reward tile brief for the whole story. Consider all story blocks together. If different planned illustrations contain compatible landmarks, combine them into the same tile brief.

Return JSON with direct top-level fields only:
- description: one compact English paragraph of drawable visual inventory only. Name the largest visible place first, then secondary visible landmarks, sparse small details, and broad physical filler surfaces. Use normal prose without labels like primary anchor, main anchor, secondary landmarks, minor details, or filler surfaces. Use concrete visible nouns/materials/shapes/colors/states only. Name environments as physical places/surfaces, not abstract worlds. Omit story titles, smells, feelings, mood, narrative meaning, quoted nickname labels, and abstract words such as enchanted/magical/mysterious unless converted to visible light/color/shape.
- requiredFeatures: array of exact lowercase mask-selection tokens. Allowed tokens only: path, river, waterfall, pond, sea, bridge, portal. Always include path.

Do not return characters, outfits, environments, illustrations, sceneVisual, cameraComposition, primaryRead, mapTile wrapper, geometry, orientation, connector sides, or directions.
`;
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
      ? blocks.map((b) => `STORY (all scenes):\n${stripAllTags(b.blockText)}`).join('\n\n')
      : blocks
          .map((b) =>
            b.sceneStart === b.sceneEnd
              ? `BLOCK ${b.blockIndex + 1} — ILLUSTRATION ${b.blockIndex + 1} = Scene ${b.sceneStart}:\n${stripAllTags(b.blockText)}`
              : `BLOCK ${b.blockIndex + 1} — ILLUSTRATION ${b.blockIndex + 1} MUST depict Scene ${b.sceneStart}. Scenes ${b.sceneStart + 1}-${b.sceneEnd} are CONTEXT:\n${stripAllTags(b.blockText)}`
          )
          .join('\n\n---\n\n');

  const physicalReadability = helpers.formatDirectorPhysicalReadabilityRules();
  const deicticActions = helpers.formatDirectorDeicticActionsRules();
  const functionalDeviceComposition = helpers.formatDirectorFunctionalDeviceCompositionRules();
  const mapTileRules = helpers.formatDirectorMapTileRules();
  const dynamicForeshorteningRules = shouldEnableDirectorDynamicForeshortening(params)
    ? `DYNAMIC FORESHORTENING VARIATION: ENABLED FOR THIS STORY\n${helpers.formatDynamicForeshorteningRules({ unit: 'illustration' })}`
    : 'DYNAMIC FORESHORTENING VARIATION: DISABLED FOR THIS STORY. Use normal readable camera composition.';

  let instructionBlock: string;
  const costumeRules = helpers.formatDirectorCostumeContinuityRules();
  const wardrobeContract = helpers.formatDirectorWardrobeContract({ imagesPerStory });
  const selectedCharacterCoverageRules =
    userCharacters.length === 0
      ? ''
      : imagesPerStory === 1
        ? `SELECTED CHARACTER IMAGE COVERAGE — HARD REQUIREMENT:
- The single illustration MUST visibly include EVERY USER-SELECTED CHARACTER listed above, using its exact characterRef in cameraComposition.characters[].characterRef.
- USER-SELECTED CHARACTERS take priority over invented, supporting, and background characters. The camera roster allows at most ${MAX_SCENE_IMAGE_CHARACTERS} characters, so omit or replace non-selected characters before omitting any selected character.
- Before returning JSON, verify that every selected characterRef appears in the single cameraComposition.characters roster.`
        : `SELECTED CHARACTER IMAGE COVERAGE — HARD REQUIREMENT:
- EVERY USER-SELECTED CHARACTER listed above MUST visibly appear in at least one illustration, using its exact characterRef in cameraComposition.characters[].characterRef.
- Distribute selected characters across illustrations when needed; never exceed ${MAX_SCENE_IMAGE_CHARACTERS} visible characters in one illustration.
- USER-SELECTED CHARACTERS take priority over invented, supporting, and background characters. Before returning JSON, verify that every selected characterRef appears in at least one cameraComposition.characters roster.`;

  if (imagesPerStory === 1) {
    instructionBlock = `Create ONE summary illustration that captures the most important moments of the story. Do not tie it to a single scene — show the essence of the whole story.

ANCHOR / STORY FIDELITY: Do not add story-significant props, held items, or costume on characters that are not supported by the written story for the moments you depict. Generic background and atmosphere are fine.

${costumeRules}

${wardrobeContract}`;
  } else {
    instructionBlock = `Create one illustration per block. Each illustration MUST depict the FIRST scene of its block (Scene X). The other scenes in the block are CONTEXT: use them for continuity (e.g. if a character gets glasses in scene 2, consider including them in scene 1 if they had them all along), but the illustration itself shows only what happens in Scene X.

CRITICAL - INTERNAL CONSISTENCY (all fields must describe the SAME place and moment):
- setting, cameraComposition.shot, cameraComposition.characters, and lighting MUST all refer to ONE location and ONE moment in time — the moment of Scene X.
- CAMERA ROSTER IS BINDING: every named character mentioned anywhere in setting, cameraComposition.shot, any cameraComposition.characters[].description, or lighting MUST have exactly one cameraComposition.characters[] row. Never mention a fourth character only inside another character's action/relationship text. If the ${MAX_SCENE_IMAGE_CHARACTERS}-character limit is reached, remove the extra character from every sceneVisual field and simplify the staging.
- If Scene X is in a car, setting must describe the car interior — never a later location from the context scenes.
- If a scene is fully inside a medium or enclosure (underwater, inside a container, cave, vehicle, tunnel, room, or similar), environmentId and environments[].description MUST describe that camera-accessible interior volume. State the visible enclosing surfaces and the camera boundary: what is in frame and which mutually exclusive exterior view is outside the frame. For full underwater scenes, explicitly state that both camera and characters are submerged, specify whether the water surface is visible, and never let an exterior rim, plaza, shore, sky, or top-down overview appear unless the shot intentionally looks toward it. Example: use an environment such as "underwater_fountain_basin" with submerged curved stone floor and basin walls, water volume and bubbles; keep the fountain rim and courtyard outside the frame for a level side view.
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

ENVIRONMENT PLATE PURITY: environments[].description is used to generate a reusable empty background/reference image before characters are added. It must not contain any visible people, animals, creatures, named character actions, or living extras. If the story location includes a character-owned shell, den, nest, house, or body-adjacent place, describe only the inert visible terrain/architecture (for example: "a large shell-shaped mound under leaves", "rough brown shell rim as a terrain edge"), never the character's body, face, limbs, eyes, or implied presence. Do not write scale notes like "waist-high to Emilia"; use neutral scale such as "small-story-scale" or concrete object sizes. If animals would gather there, omit them from the environment and reserve them for sceneVisual.cameraComposition.characters only when they are actual scene characters.
Bad environment description: "Matilda's Shell Forest with waist-high (to Emilia) ferns where snails gather."
Good environment description: "Miniature moss clearing on a large inert shell-shaped landform, small-story-scale fern thickets on the left, shallow reflective dew spring center-right, rounded gray boulder on the right, trickling stream along the foreground, rough brown shell rim as the far terrain edge."

${costumeRules}

${wardrobeContract}`;
  }

  return helpers.cleanTemplate`
${DIRECTOR_SYSTEM_PROMPT}

CONTENT POLICY (MUST follow):
${contentPolicy.textPromptSection}

VISUAL RULES:
${visualRules}

${
  userCharacters.length > 0
    ? `CHARACTER IDENTITY REGISTRY:
${helpers.formatCharacterIdentityRegistry(userCharacters)}

IMPORTANT: characterRef is structural identity. Copy the exact existing UUID into characters[].characterRef, outfits[].characterRef, and cameraComposition.characters[].characterRef. A title, family form, translation, or display-name change never creates another identity. For a genuinely new character, allocate one NEW_CH_n value in characters[] and reuse that exact value everywhere.
USER-SELECTED CHARACTERS are reference-grounded identities in the downstream image pipeline. Do NOT invent or overwrite a new canonical face, hair, body, skin-tone, or default-clothing specification for them in characters[].description.
For these user-selected characters, keep characters[].description minimal and reference-compatible. Use it only for a short neutral anchor when required by the schema. In sceneVisual.cameraComposition.characters[].description, describe only the frozen-moment information: pose, expression, gaze, head turn, hand use, action, placement, and temporary visibility/occlusion. Use literal observable language only; never use a simile, metaphor, species comparison, or transformation wording to describe movement. Spell out the real human pose instead (for example, "swimming horizontally in the current, arms extended" rather than "swimming like a mermaid"). Do NOT restate, paraphrase, or sneak in stable identity traits there such as hairstyle, ponytail/braid details, hair color, eye color, freckles, face shape, skin tone, body build, age markers, or other enduring appearance details. If you catch yourself naming a permanent face/hair feature from the sheet, remove it and replace it with a neutral visible action description. Put wardrobe only in outfits[].description.`
    : ''
}

${selectedCharacterCoverageRules}

STORY BLOCKS (one block per illustration):
${blocksText}

${physicalReadability}

${deicticActions}

${functionalDeviceComposition}

${dynamicForeshorteningRules}

${mapTileRules}

${instructionBlock}

OUTPUT JSON — order helps you satisfy dependencies: (1) characters, (2) outfits (define every id you will use), (3) environments (one row per unique environmentId referenced below), (4) mapTile (one story-level reward tile), (5) illustrations (length ${imagesPerStory}).
mapTile MUST be top-level and singular with exactly two conceptual fields: requiredFeatures[] and description. It must combine key compatible visible landmarks from all planned illustrations, but must not choose geometry, orientation, connector sides, or exact placement.
Each illustration MUST include: environmentId (string), primaryRead (short English focus phrase), sceneVisual (setting, cameraComposition with shot + characters[], lighting).
Each cameraComposition.characters[] row MUST include: characterRef, name, description, outfitId (exact outfits[].id for that character in this shot). Each outfits[] row must carry the same characterRef as its character. Non-empty characters array; outfitId is a technical binding enforced like environmentId. Detailed wardrobe descriptions are only for child/person/human characters; animals, creatures, objects, vehicles, and environmental beings use "natural appearance".
Wardrobe descriptions must match weather, season, and indoor/outdoor context of the anchor moment.
All descriptions must be IN ENGLISH.

CHARACTERS ARRAY: Include all characters who appear. User-selected characters (from context) are reference-defined identities downstream, so do NOT rewrite their full visual identity here; keep their characters[].description brief, neutral, and non-conflicting. NEW characters introduced in the story — add to characters array with DETAILED visual description (appearance, colors, size, distinctive features) for image generation.
`;
}

export function buildDirectorSelectedCharacterCoverageRetryPrompt(params: {
  originalPrompt: string;
  missingCharacters: string[];
  imagesPerStory: number;
}): string {
  const placementRule =
    params.imagesPerStory === 1
      ? 'Put every missing selected character into the single illustration camera roster.'
      : 'Put every missing selected character into at least one illustration camera roster, distributing them across images when needed.';

  return helpers.cleanTemplate`
${params.originalPrompt}

CORRECTION REQUIRED — SELECTED CHARACTERS WERE OMITTED FROM THE IMAGE PLAN:
The previous result omitted these required selected identities: ${params.missingCharacters.join(', ')}.
Regenerate the entire JSON result. ${placementRule}
Use each exact missing structural ref in cameraComposition.characters[].characterRef. Keep the localized display name separately in name. Keep at most ${MAX_SCENE_IMAGE_CHARACTERS} visible characters per illustration. Remove invented or supporting characters when necessary; never remove a user-selected character to make room.
Do not return the previous invalid roster.
`;
}
