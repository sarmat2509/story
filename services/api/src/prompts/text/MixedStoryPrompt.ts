import type { StorySpec } from '../../ai/types';
import type { JsonSchema } from '../../providers/base/JsonSchema';
import {
  formatContinuationLocationMemory,
  formatContinuationOutfitMemory,
  formatContinuationStoryContext,
  formatContactGeometryWriterRule,
  formatContentPolicySection,
  formatReferenceGroundedCharacterRules,
  formatSceneVisualStagingDeltaRule,
  formatStoryTitleSection,
  formatStructuredEnvironmentRules,
  formatStructuredOutfitRules,
  formatStructuredSpeakerNameRules,
  formatStructuredStoryInputSection,
  structuredCameraCharacterOutfitIdJsonSchema,
  structuredOutfitsJsonSchema,
  type ContinuationPromptContext,
} from '../helpers';
import {
  closingArtifactRules,
  comicPanelCameraVarietyRules,
  COMIC_OVERLAY_TEXT_SEPARATION_RULE,
  dialogueRhythmRules,
  ageRules,
  graphicNovelPanelCountRange,
  graphicNovelCharacterList,
  graphicNovelStructuralIdentitySection,
  graphicNovelVisualReferenceLabelSection,
  panelDensityRules,
  GRAPHIC_NOVEL_CAPTION_MAX_CHARS,
  GRAPHIC_NOVEL_LINE_MAX_CHARS,
  GRAPHIC_NOVEL_SPEAKER_MAX_CHARS,
  thoughtBubbleRules,
} from './GraphicNovelPrompt';
import type { VisualCharacterReferenceLabel } from '../visualReferenceLabels';

const MIXED_STORY_PANEL_VISUAL_STAGING_RULE = formatSceneVisualStagingDeltaRule(
  'visual.sceneVisual.setting'
);

function mixedComicPanelRule(ageGroup: string): string {
  const range = graphicNovelPanelCountRange(ageGroup);
  return range.min === range.max
    ? `Hard panel-count range for this age: exactly ${range.min} panels per comic page.`
    : `Hard panel-count range for this age: ${range.min}-${range.max} panels per comic page. Follow the density rules above when they are stricter.`;
}

export function buildMixedStoryPrompt(params: {
  spec: StorySpec;
  sceneCount: number;
  comicSceneIds: number[];
  comicBlockCount: number;
  validationFeedback?: string[];
  isContinuation?: boolean;
  continuationContext?: ContinuationPromptContext;
  visualReferenceLabels?: VisualCharacterReferenceLabel[];
  visualArtifactReferenceLabel?: string;
}): string {
  const {
    spec,
    sceneCount,
    comicSceneIds,
    comicBlockCount,
    isContinuation,
    continuationContext,
    visualReferenceLabels,
    visualArtifactReferenceLabel,
  } = params;
  const complexityAgeGroup = spec.storyComplexityAgeGroup ?? spec.ageGroup;
  const expectedReadingBlockCount = sceneCount;
  const continuationSections =
    isContinuation && continuationContext
      ? [
          formatContinuationStoryContext({ context: continuationContext, mode: 'mixed_story' }),
          formatContinuationLocationMemory(continuationContext.previousEnvironments),
          formatContinuationOutfitMemory(continuationContext.previousOutfits),
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';
  const comicPageBySceneId = new Map<number, number>();
  comicSceneIds.slice(0, comicBlockCount).forEach((sceneId, index) => {
    comicPageBySceneId.set(sceneId, index + 1);
  });
  const blockPlanLines: string[] = [];
  for (let sceneId = 1; sceneId <= sceneCount; sceneId += 1) {
    const comicPageNumber = comicPageBySceneId.get(sceneId);
    if (comicPageNumber) {
      blockPlanLines.push(
        `- screenOrder ${sceneId}: kind="comic", sceneId=${sceneId}, comicPageNumber=${comicPageNumber}, panels[] as a full comic page, NO text, NO sceneIds.`
      );
    } else {
      blockPlanLines.push(
        `- screenOrder ${sceneId}: kind="prose", sceneIds=[${sceneId}], text as one paragraph, NO panels.`
      );
    }
  }
  const validationFeedback = params.validationFeedback?.length
    ? `
PREVIOUS ATTEMPT FAILED VALIDATION:
${params.validationFeedback.map((issue) => `- ${issue}`).join('\n')}
- Rewrite the JSON from scratch. Do not preserve invalid blocks, placeholders, unrelated prose, or malformed text.
`
    : '';
  return `Create a structured mixed story script as JSON.

ROLE BOUNDARY:
- You are the Mixed Story Writer: part early-reader prose writer, part full-page comic script writer.
- This format helps children transition from comics to prose.
- Do not create ordinary illustration prompts for prose blocks. Prose blocks are text only.
- Comic blocks contain full-page comic panel staging and bubble text only; the server renders comic pages and bubbles later.

OUTPUT:
- Return JSON matching the schema exactly.
- Create exactly ${comicBlockCount} comic blocks, one for each anchor scene id: ${comicSceneIds.join(', ')}.
- Create exactly ${expectedReadingBlockCount} readingBlocks total.
- Use exactly ${sceneCount} internal story scenes for pacing, but expose only readingBlocks[] for screen and audio.
- Each readingBlock represents exactly one internal story scene.
- A comic block replaces only its anchor scene. All non-anchor scenes remain separate prose paragraph blocks.
- screenOrder must be consecutive starting at 1.
- Comic blocks use kind="comic", sceneId equal to the matching anchor scene id, comicPageNumber 1..${comicBlockCount}, and panels[].
- Comic blocks MUST NOT include prose text fields; use panel dialogue, thoughts, or captions for all readable comic text.
- Prose blocks use kind="prose", sceneIds[] with exactly one non-anchor scene id, and text.
- Prose blocks MUST NOT include panels[].
- Return every used identity in characters[]. Existing characters keep their registry UUID; genuinely new characters get unique NEW_CH_n refs.
- Create outfits[] once for comic visual wardrobe bindings. Detailed wardrobe rows are only for child/person/human characters; non-human characters use "natural appearance".
- Do not merge prose scenes. If two prose scenes fall between comic anchors, return two prose readingBlocks.
- Every prose block should be one friendly paragraph, not a wall of text.
- The display order and audio order must be exactly readingBlocks[] order.
- All user-facing prose, dialogue, thoughts, captions, title, and description must be in ${spec.language}.
- Do not use placeholder speakers or generic names such as Hero, Character, Narrator, Child, Kid, Friend, or Person.
- Do not include unrelated informational text, external documents, policy summaries, climate reports, military/security planning text, or any text outside the requested story.
${validationFeedback}

${formatStoryTitleSection({ isContinuation })}

REQUIRED READING BLOCK PLAN:
Follow this plan exactly. Do not merge, omit, add, or reorder blocks.
${blockPlanLines.join('\n')}

CONTINUITY:
- This is one continuous story, not separate prose excerpts and separate comic gags.
- Each prose block must continue from the immediately previous block, whether that previous block was prose or comic.
- Each comic page must show the next story beat after the preceding prose/comic block and set up the following prose block.
- Do not restart the scene, skip the consequence of the previous block, or repeat the same event in another format.
- If prose introduces a plan, object, danger, promise, question, or emotion, the next comic page or prose block must visibly continue or resolve it.
- Comic dialogue must be spoken by the same story characters and refer to the same current situation, not a disconnected episode.
- Prose after a comic page should narrate the result or next consequence of what was shown in the panels, not summarize the page as if it never happened.

${formatStructuredStoryInputSection(spec, { includeIllustrationStyle: true })}

${formatStructuredOutfitRules({ includeChangeRules: true })}

${formatContentPolicySection(spec)}

${continuationSections}

CLOSING ARTIFACT:
${closingArtifactRules(
  spec,
  visualArtifactReferenceLabel ? { referenceId: visualArtifactReferenceLabel } : undefined
)}

COMIC PAGE STRUCTURE:
- Each comic block is a full comic page like the graphic novel mode, not a horizontal strip.
- Include every used preselected identity in top-level characters[] with its registry UUID. For a newly invented named helper/creature/object character, add one NEW_CH_n row with type and a stable visual description for turnaround generation.
- If a newly invented named helper/creature/object is the main subject of visual.primaryRead, appears in visual.sceneVisual.setting, is watched/reacted to by others, or performs the panel action, it MUST be included in that panel visual.sceneVisual.cameraComposition.characters[] even when it is not speaking.
- Do not write a panel where primaryRead/setting says "the small creature/griffin/robot/etc." is doing the action while cameraComposition.characters[] lists only observers. Add the named character row too.
- characters[].description must be natural-language visual identity text only. Do not use REF_CH_* labels, internal IDs, panel action, or temporary scene state there.
- Reuse the same age-specific panel density rules as graphic novel mode:
${ageRules(complexityAgeGroup)}
${panelDensityRules(complexityAgeGroup, comicBlockCount)}
- ${mixedComicPanelRule(complexityAgeGroup)}
- Use multiple panels for setup, reaction, decision, action, and consequence beats.
- Keep each comic page readable as a 3:4 page with panel rows/columns chosen later by the server.
- panelId must be stable and unique, like "m1-1" for mixed comic page 1 panel 1.
- visual.environmentId must match environments[].id.
- visual.primaryRead: short English phrase, 3-10 words, naming the main visual read. Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects inside visual text.
- visual.sceneVisual.setting, cameraComposition.shot, cameraComposition.characters, and lighting must describe ONE moment.
- ${MIXED_STORY_PANEL_VISUAL_STAGING_RULE}
${comicPanelCameraVarietyRules({ includeDynamicForeshortening: true })}
- The main acted-on subject of primaryRead/setting counts as a visible character when it is a named story helper, creature, animal, robot, object, or person. Include it in cameraComposition.characters[] even if it is not speaking.
- visual.sceneVisual.cameraComposition.characters[].description must include placement, pose, readable expression, gaze direction, gesture, and interaction with props or other characters. ${formatContactGeometryWriterRule()} Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects inside visual text.
- Every visual.sceneVisual.cameraComposition.characters[] item must include position.
- Every visual.sceneVisual.cameraComposition.characters[] item must include outfitId. Detailed wardrobe rows are only for child/person/human characters; non-human characters use a natural-appearance binding.
${COMIC_OVERLAY_TEXT_SEPARATION_RULE}
- Do not output coordinates or bubble placement metadata. The server derives exact bubble placement.

COMIC TEXT COMPLEXITY:
- dialogue[].text and thoughts[].text must be ${GRAPHIC_NOVEL_LINE_MAX_CHARS} characters or fewer.
- captions must be ${GRAPHIC_NOVEL_CAPTION_MAX_CHARS} characters or fewer.
- speaker names must be ${GRAPHIC_NOVEL_SPEAKER_MAX_CHARS} characters or fewer.
- A panel may contain 2 dialogue lines when the dialogue array has 2 items. Use different speakers for those exchange panels.
- Do not write full dialogue or thought lines in ALL CAPS.

DIALOGUE RHYTHM:
${dialogueRhythmRules(complexityAgeGroup, comicBlockCount)}

THOUGHT BUBBLE LOGIC:
${thoughtBubbleRules(complexityAgeGroup, comicBlockCount)}

PROSE TEXT:
- Prose should be easier than a dense chapter book: one paragraph per prose block, clear sentences, and gentle forward motion.
- Prose should narrate what happens between comic strips and carry emotional continuity.
- Do not repeat the exact text from comic bubbles in prose. The prose may refer to the result of the comic moment.
- The final prose block or final comic block must resolve positively and clearly for the age.

CHARACTERS:
${graphicNovelCharacterList(spec, isContinuation ? continuationContext : undefined)}

${graphicNovelStructuralIdentitySection(spec)}

${graphicNovelVisualReferenceLabelSection(spec, isContinuation ? continuationContext : undefined, visualReferenceLabels)}

${formatStructuredSpeakerNameRules()}

${formatReferenceGroundedCharacterRules()}

${formatStructuredEnvironmentRules({ target: 'readingBlocks' })}
`;
}

const BASE_MIXED_STORY_SCRIPT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    language: { type: 'string' },
    characters: {
      type: 'array',
      description:
        'Identity declarations for every character used by the story. Existing characters use registry UUIDs; new characters use NEW_CH_n.',
      items: {
        type: 'object',
        properties: {
          characterRef: {
            type: 'string',
            description:
              'Existing UUID from CHARACTER IDENTITY REGISTRY or unique NEW_CH_n for a genuinely new identity.',
          },
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: ['human', 'animal', 'creature', 'object'],
          },
          description: {
            type: 'string',
            description:
              'Stable visual identity description in English for turnaround generation: body form, materials/colors, distinctive marks, readable age/species/object type. No REF labels, internal IDs, scene action, or temporary state.',
          },
          role: { type: 'string' },
          personality: { type: 'string' },
        },
        required: ['characterRef', 'name', 'type', 'description'],
      },
    },
    environments: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          viewpointKind: { type: 'string', enum: ['exterior', 'interior', 'submerged', 'enclosed'] },
          description: { type: 'string' },
        },
        required: ['id', 'name', 'viewpointKind', 'description'],
      },
    },
    outfits: structuredOutfitsJsonSchema(),
    readingBlocks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['comic', 'prose'] },
          screenOrder: { type: 'integer', minimum: 1 },
          sceneId: { type: 'integer', minimum: 1 },
          comicPageNumber: { type: 'integer', minimum: 1 },
          sceneIds: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
          },
          text: { type: 'string' },
          panels: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            items: {
              type: 'object',
              properties: {
                panelId: { type: 'string' },
                dialogue: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      speaker: {
                        type: 'string',
                        minLength: 1,
                        maxLength: GRAPHIC_NOVEL_SPEAKER_MAX_CHARS,
                      },
                      characterRef: {
                        type: 'string',
                        description: 'Exact characters[].characterRef for this speaker.',
                      },
                      text: {
                        type: 'string',
                        minLength: 1,
                        maxLength: GRAPHIC_NOVEL_LINE_MAX_CHARS,
                      },
                      emotion: { type: 'string' },
                    },
                    required: ['characterRef', 'speaker', 'text'],
                  },
                },
                thoughts: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      speaker: {
                        type: 'string',
                        minLength: 1,
                        maxLength: GRAPHIC_NOVEL_SPEAKER_MAX_CHARS,
                      },
                      characterRef: {
                        type: 'string',
                        description: 'Exact characters[].characterRef for this thinker.',
                      },
                      text: {
                        type: 'string',
                        minLength: 1,
                        maxLength: GRAPHIC_NOVEL_LINE_MAX_CHARS,
                      },
                      emotion: { type: 'string' },
                    },
                    required: ['characterRef', 'speaker', 'text'],
                  },
                },
                caption: { type: 'string', maxLength: GRAPHIC_NOVEL_CAPTION_MAX_CHARS },
                visual: {
                  type: 'object',
                  properties: {
                    environmentId: { type: 'string' },
                    primaryRead: {
                      type: 'string',
                      description:
                        'Short English focus phrase. Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects from the prompt instead of natural-language names.',
                    },
                    sceneVisual: {
                      type: 'object',
                      properties: {
                        setting: {
                          type: 'string',
                          description:
                            `Scene-specific additions in English. ${MIXED_STORY_PANEL_VISUAL_STAGING_RULE} Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects from the prompt instead of natural-language names.`,
                        },
                        cameraComposition: {
                          type: 'object',
                          properties: {
                            shot: {
                              type: 'string',
                              description:
                                'Shot scale, viewpoint/angle, and environment slice in English. Examples: wide establishing shot of the full location, left-side view of door and steps, right-side view along railing and sea, central close-up on the story object, extreme close-up on hands/face/detail. Vary shot scale and angle across panels on the same comic page; do not write only "medium shot".',
                            },
                            characters: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  characterRef: {
                                    type: 'string',
                                    description: 'Exact characters[].characterRef for this visible character.',
                                  },
                                  name: { type: 'string' },
                                  position: { type: 'string' },
                                  description: {
                                    type: 'string',
                                    description:
                                      `Placement, pose, expression, gaze, gesture, and interaction for this exact panel. ${formatContactGeometryWriterRule()} Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects from the prompt instead of natural-language names.`,
                                  },
                                  outfitId: structuredCameraCharacterOutfitIdJsonSchema(),
                                },
                                required: ['characterRef', 'name', 'position', 'description', 'outfitId'],
                              },
                            },
                          },
                          required: ['shot', 'characters'],
                        },
                        lighting: { type: 'string' },
                      },
                      required: ['setting', 'cameraComposition', 'lighting'],
                    },
                  },
                  required: ['environmentId', 'primaryRead', 'sceneVisual'],
                },
              },
              required: ['panelId', 'dialogue', 'thoughts', 'visual'],
            },
          },
        },
        required: ['kind', 'screenOrder'],
      },
    },
  },
  required: [
    'title',
    'description',
    'language',
    'characters',
    'environments',
    'outfits',
    'readingBlocks',
  ],
};

export function buildMixedStoryScriptSchema(
  params: {
    readingBlockCount?: number;
    comicPanelRange?: { min: number; max: number };
  } = {}
): JsonSchema {
  const readingBlocks = BASE_MIXED_STORY_SCRIPT_SCHEMA.properties?.readingBlocks;
  if (!readingBlocks || (!params.readingBlockCount && !params.comicPanelRange)) {
    return BASE_MIXED_STORY_SCRIPT_SCHEMA;
  }
  const readingBlockItems = readingBlocks.items!;
  const panels = readingBlockItems?.properties?.panels;
  const itemSchema =
    panels && params.comicPanelRange
      ? {
          ...readingBlockItems,
          properties: {
            ...readingBlockItems.properties,
            panels: {
              ...panels,
              minItems: params.comicPanelRange.min,
              maxItems: params.comicPanelRange.max,
            },
          },
        }
      : readingBlockItems;

  return {
    ...BASE_MIXED_STORY_SCRIPT_SCHEMA,
    properties: {
      ...BASE_MIXED_STORY_SCRIPT_SCHEMA.properties,
      readingBlocks: {
        ...readingBlocks,
        ...(params.readingBlockCount
          ? { minItems: params.readingBlockCount, maxItems: params.readingBlockCount }
          : {}),
        items: itemSchema,
      },
    },
  };
}

export const MIXED_STORY_SCRIPT_SCHEMA: JsonSchema = buildMixedStoryScriptSchema();
