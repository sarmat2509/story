import type { StorySpec } from '../../ai/types';
import type { JsonSchema } from '../../providers/base/JsonSchema';
import {
  formatContinuationLocationMemory,
  formatContinuationOutfitMemory,
  formatContinuationStoryContext,
  formatContentPolicySection,
  formatReferenceGroundedCharacterRules,
  formatStoryTitleSection,
  formatStructuredEnvironmentRules,
  formatStructuredOutfitRules,
  formatStructuredSpeakerNameRules,
  formatStructuredStoryInputSection,
  formatWriterCharacterName,
  type ContinuationCharacter,
  type ContinuationPromptContext,
} from '../helpers';

export const GRAPHIC_NOVEL_LINE_MAX_CHARS = 110;
export const GRAPHIC_NOVEL_CAPTION_MAX_CHARS = 90;
export const GRAPHIC_NOVEL_SPEAKER_MAX_CHARS = 40;

export interface GraphicNovelPanelCountRange {
  min: number;
  max: number;
}

export interface GraphicNovelPanelDensityRequirement {
  minimumDensePages: number;
  denseMinPanels: number;
  denseMaxPanels?: number;
  maximumThreePanelPages?: number;
}

export function graphicNovelPanelCountRange(ageGroup: string): GraphicNovelPanelCountRange {
  switch (ageGroup) {
    case '0-1':
    case '1y':
    case '2-3':
      return { min: 2, max: 2 };
    case '4-5':
      return { min: 2, max: 3 };
    case '6-8':
      return { min: 3, max: 6 };
    case '9-12':
      return { min: 3, max: 6 };
    default:
      return { min: 2, max: 3 };
  }
}

export function graphicNovelPanelDensityRequirement(
  ageGroup: string,
  pageCount: number
): GraphicNovelPanelDensityRequirement | null {
  if (ageGroup === '6-8') {
    const minimumDensePages = Math.max(1, Math.ceil(pageCount * 0.75));
    const maximumThreePanelPages = Math.max(1, pageCount - minimumDensePages);
    return {
      minimumDensePages,
      denseMinPanels: 4,
      denseMaxPanels: 6,
      maximumThreePanelPages,
    };
  }

  if (ageGroup === '9-12') {
    return {
      minimumDensePages: Math.max(3, Math.ceil(pageCount * 0.75)),
      denseMinPanels: 3,
      denseMaxPanels: 6,
    };
  }

  return null;
}

function writerCharacterType(type?: string): string {
  if (type === 'child') return 'person';
  return type || 'character';
}

export function characterList(spec: StorySpec): string {
  if (!spec.characters?.length) return 'No preselected characters.';
  return spec.characters
    .map((character) => {
      const characterType = writerCharacterType(character.type);
      const role = character.role ? `, role: ${character.role}` : '';
      const hasVisualReference =
        !!(character as any).turnaroundSheet?.url ||
        !!(character as any).turnaroundSheet?.frontUrl ||
        (character.referencePhotos?.length || 0) > 0;
      const referenceFlag = hasVisualReference
        ? ', visual reference: yes'
        : ', visual reference: no';
      const personality = character.personality || (character as any).traits || '';
      const personalityText = personality ? ` Story voice/personality: ${personality}` : '';
      return `- ${character.name} (${characterType}${role}${referenceFlag}): use this exact story name.${personalityText}`;
    })
    .join('\n');
}

function hasGraphicVisualReference(
  character: NonNullable<StorySpec['characters']>[number] | undefined
): boolean {
  return !!(
    character &&
    ((character as any).turnaroundSheet?.url ||
      (character as any).turnaroundSheet?.frontUrl ||
      (character.referencePhotos?.length || 0) > 0)
  );
}

function findSpecCharacterByContinuationName(spec: StorySpec, name: string) {
  const cleanName = formatWriterCharacterName(name);
  return spec.characters?.find(
    (character) => formatWriterCharacterName(character.name) === cleanName
  );
}

function formatGraphicContinuationCharacterLine(
  spec: StorySpec,
  character: ContinuationCharacter
): string {
  const source = findSpecCharacterByContinuationName(spec, character.name);
  const cleanName = formatWriterCharacterName(character.name);
  const characterType = writerCharacterType(source?.type || character.type);
  const role = character.role || source?.role;
  const roleText = role ? `, role: ${role}` : '';
  const referenceFlag = hasGraphicVisualReference(source)
    ? ', visual reference: yes'
    : ', visual reference: no';
  const personality = source?.personality || (source as any)?.traits || '';
  const personalityText = personality ? ` Story voice/personality: ${personality}` : '';
  const continuityText =
    character.description && character.description !== 'undefined'
      ? ` Continuity note: ${character.description}`
      : '';

  return `- ${cleanName} (${characterType}${roleText}${referenceFlag}): use this exact story name.${personalityText}${continuityText}`;
}

export function graphicNovelCharacterList(
  spec: StorySpec,
  continuationContext?: ContinuationPromptContext
): string {
  if (!continuationContext) return characterList(spec);

  const required = continuationContext.requiredCharacters || [];
  const optional = continuationContext.optionalCharacters || [];
  if (required.length === 0 && optional.length === 0) return characterList(spec);

  const sections: string[] = [];
  if (required.length > 0) {
    sections.push(
      'REQUIRED CHARACTERS (MUST USE):',
      ...required.map((character) => formatGraphicContinuationCharacterLine(spec, character))
    );
  }

  if (optional.length > 0) {
    if (sections.length > 0) sections.push('');
    sections.push(
      'OPTIONAL CHARACTERS (MAY USE):',
      ...optional.map((character) => formatGraphicContinuationCharacterLine(spec, character))
    );
  }

  return sections.join('\n');
}

function safetyFallbackCharacterList(spec: StorySpec): string {
  if (!spec.characters?.length) return 'No preselected characters.';
  return spec.characters
    .map((character) => {
      const characterType = writerCharacterType(character.type);
      const role = character.role ? `, role: ${character.role}` : '';
      return `- ${character.name} (${characterType}${role}): use this exact speaker name when this character talks.`;
    })
    .join('\n');
}

export function ageRules(ageGroup: string): string {
  switch (ageGroup) {
    case '0-1':
    case '1y':
      return 'Use exactly 2 panels per page. Use almost no text: 0-1 very short bubble per panel. Use simple reactions, repetition, and warm visible emotions.';
    case '2-3':
      return 'Use exactly 2 panels per page. Use very short lines, one clear emotion/action per panel, and simple turn-taking.';
    case '4-5':
      return 'Use 2-3 panels per page. Use simple exchanges, clear cause/effect, and one small conflict resolved gently. A few key lines may be a little longer, but keep most bubbles short.';
    case '6-8':
      return 'Use 4-6 panels per page. Use 3 panels only rarely for a quiet final resolution or reflection page, not for opening/setup/action/conversation/reveal pages. Do not use 2-panel pages for this age group. Use conversational scenes, jokes, reactions, and 1-3 bubbles per panel. Dialogue should feel like early-reader chapter-book speech: complete, specific sentences with a little reason, feeling, or plan, not mostly one-word reactions.';
    case '9-12':
      return 'Use 3-6 panels per page. Use stronger character voice, light subtext, and dynamic dialogue while remaining age-safe. Several panels should carry two-line exchanges.';
    default:
      return 'Use 2-3 panels per page, short dialogue, clear visual beats, and age-appropriate wording.';
  }
}

export function panelDensityRules(ageGroup: string, pageCount: number): string {
  if (ageGroup === '6-8') {
    const requirement = graphicNovelPanelDensityRequirement(ageGroup, pageCount)!;
    return [
      `For this ${pageCount}-page story, at least ${requirement.minimumDensePages} pages must have 4, 5, or 6 panels.`,
      `Use 3-panel pages at most ${requirement.maximumThreePanelPages} time(s), only for quiet reflection or final resolution.`,
      'Page 1/opening must have 4, 5, or 6 panels for age 6-8.',
      'Use 5-6 panels for fast dialogue, action, reveal, or back-and-forth reaction pages when the beats fit.',
      'Do not create 2-panel pages for age 6-8.',
    ].join('\n');
  }

  if (ageGroup === '9-12') {
    const requirement = graphicNovelPanelDensityRequirement(ageGroup, pageCount)!;
    return [
      `For this ${pageCount}-page story, at least ${requirement.minimumDensePages} pages should have 3 or more panels.`,
      'Use 4-6 panels on action, reveal, or fast conversation pages when useful.',
      'Do not make every page low-density.',
    ].join('\n');
  }

  if (ageGroup === '4-5') {
    return [
      'Use some 3-panel pages for setup-change-response beats, but keep the page readable.',
      '2-panel pages are fine for simple emotion or resolution beats.',
    ].join('\n');
  }

  return 'Use the age rules above for panel density. Keep pages readable and never use fewer than 2 panels.';
}

export function dialogueRhythmRules(ageGroup: string, pageCount: number): string {
  if (ageGroup === '6-8') {
    const exchangePanels = Math.max(6, Math.ceil(pageCount * 2.5));
    return [
      `Most panels must be dialogue exchange panels: at least 60% of all panels, and never fewer than ${exchangePanels} panels for this ${pageCount}-page story.`,
      `Each dialogue exchange panel must have dialogue array length exactly 2, with 2 different speakers.`,
      `This is a hard structural requirement: before returning JSON, count the qualifying exchange panels and revise if fewer than ${exchangePanels} or fewer than 60% of all panels.`,
      'A qualifying exchange panel has dialogue array length exactly 2, two different speakers, and the two lines answer each other directly.',
      'Spread exchange panels across every page. Opening/setup/conversation/action pages should usually have at least 2 exchange panels; 5-panel pages should usually have at least 3 exchange panels.',
      'Use single-speaker, thought-only, caption-only, or silent panels sparingly: only for establishing shots, reveals, quiet emotions, or final resolution beats.',
      'These two-line panels should feel like a quick call-and-response, joke, reassurance, or disagreement.',
      `Most dialogue and thought lines should be 40-65 characters; use 66-75 characters only for important choices, feelings, jokes, or plans.`,
      'At least half of all dialogue/thought lines across the story should be 45 characters or longer.',
      `Include at least ${Math.max(6, pageCount)} dialogue/thought lines of 55-75 characters for important choices, feelings, jokes, or plans.`,
      'For two-speaker exchange panels, each of the 2 lines should usually be 35-65 characters, and the panel must not also have a caption.',
      'Use captions sparingly. Do not combine a caption with dialogue/thought in the same panel unless the caption is essential and the bubble text is under 65 characters.',
      'Keep spoken dialogue dominant for age 6-8. Use thoughts deliberately as private reactions, not as the main text mode.',
      'Short exclamations under 35 characters are allowed only as occasional reaction beats, and should usually be paired with another longer line in the same or adjacent panel.',
      'Avoid making every bubble one short exclamation. Let characters answer each other with specific, conversational sentences.',
    ].join('\n');
  }

  if (ageGroup === '9-12') {
    const exchangePanels = Math.max(3, Math.floor(pageCount / 2));
    return [
      `Include at least ${exchangePanels} panels where dialogue has exactly 2 lines from 2 different speakers.`,
      'Use light subtext, reaction beats, and short disagreements while staying warm and age-safe.',
      `Key dialogue lines may use most of the ${GRAPHIC_NOVEL_LINE_MAX_CHARS}-character limit when useful.`,
    ].join('\n');
  }

  if (ageGroup === '4-5') {
    return [
      'Include 1-2 panels with two very short dialogue lines from two different speakers if it helps the exchange.',
      'Most panels should still have one simple bubble.',
    ].join('\n');
  }

  return 'Use one very short bubble per panel unless the age rules allow more.';
}

export function thoughtBubbleRules(ageGroup: string, pageCount: number): string {
  if (ageGroup === '0-1' || ageGroup === '1y') {
    return [
      'Avoid thought bubbles for babies unless one very simple repeated inner feeling is essential.',
      'If used, a thought must be 1-4 words and visually obvious from the expression/pose reaction.',
    ].join('\n');
  }

  if (ageGroup === '2-3') {
    return [
      'Use 0-2 thought bubbles across the whole story.',
      'Use thoughts only for simple private feelings like "I feel shy" or "That looks fun".',
    ].join('\n');
  }

  if (ageGroup === '4-5') {
    return [
      'Use 1-3 thought bubbles across the whole story.',
      'Use thoughts for a small private worry, surprise, or warm realization that would be awkward to say aloud.',
      'Keep each thought simple and visibly supported by the character expression.',
    ].join('\n');
  }

  if (ageGroup === '6-8') {
    const targetThoughts = Math.max(3, Math.ceil(pageCount * 0.5));
    return [
      `Include ${targetThoughts}-${targetThoughts + 2} thought bubbles across the story.`,
      'Use thoughts when the character would not say it aloud: private worry, private doubt, funny contrast between brave words and nervous feelings, sudden realization, quiet empathy, or a plan they are considering.',
      'Thought bubbles should reveal inner voice, not repeat spoken dialogue.',
      'Usually put thoughts in panels that are not already two-speaker exchange panels.',
      'Do not overuse thoughts: keep spoken two-character dialogue as the dominant mode.',
    ].join('\n');
  }

  if (ageGroup === '9-12') {
    const targetThoughts = Math.max(4, Math.ceil(pageCount * 0.75));
    return [
      `Include ${targetThoughts}-${targetThoughts + 3} thought bubbles across the story.`,
      'Use thoughts for subtext: hesitation, private strategy, irony, self-correction, or noticing something another character misses.',
      'Thoughts must add information or emotion that spoken dialogue does not already state.',
    ].join('\n');
  }

  return 'Use thoughts sparingly, only when the inner reaction is clearer or funnier than spoken dialogue.';
}

export function closingArtifactRules(spec: StorySpec): string {
  if (!spec.closingArtifact) {
    return 'No fixed keepsake artifact is required.';
  }

  return [
    `Closing keepsake artifact: ${spec.closingArtifact.title}.`,
    `On the final page, include exactly one short dialogue, thought, or caption text with the artifact phrase wrapped in braces, using "${spec.closingArtifact.title}" as the artifact concept.`,
    'Write the words inside braces in the natural grammar/case for the sentence language. If the artifact appears in the middle of a sentence, do not force Title Case; use lowercase or inflection when that reads naturally.',
    `Good English example: "This {star key} will remind us..." Good Ukrainian example: "Ця {дерев'яна маска} нагадуватиме..."`,
    'Keep the marker inside dialogue[].text, thoughts[].text, or caption only. Do not put artifact braces in visual fields.',
    'The marker must fit the same character limit as any other bubble/caption text.',
  ].join('\n');
}

export function buildGraphicNovelPrompt(params: {
  spec: StorySpec;
  pageCount: number;
  isContinuation?: boolean;
  continuationContext?: ContinuationPromptContext;
}): string {
  const { spec, pageCount, isContinuation, continuationContext } = params;
  const continuationSections =
    isContinuation && continuationContext
      ? [
          formatContinuationStoryContext({ context: continuationContext, mode: 'graphic_novel' }),
          formatContinuationLocationMemory(continuationContext.previousEnvironments),
          formatContinuationOutfitMemory(continuationContext.previousOutfits),
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';
  return `Create a structured, age-appropriate graphic novel script as JSON.

ROLE BOUNDARY:
- You are the Graphic Novel Writer and page/panel planner, not the visual identity director.
- Generate bubble text and panel staging only.
- Keep everything wholesome, gentle, positive, and age-appropriate.
- Do not include stable physical appearance, clothing catalogs, wardrobe lists, anatomy details, or reference-image descriptions in this JSON.
- Character identity and default appearance are handled later by reference images and the image pipeline.

OUTPUT:
- Return JSON matching the schema exactly.
- Create exactly ${pageCount} pages.
- Every page MUST have at least 2 panels.
- Do not write prose paragraphs. Text should be mostly dialogue and first-person thoughts.
- Captions are allowed only when they help reading order or time/place.
- Each panel contains bubble text plus visual only: dialogue/thoughts/caption and visual.
- Do not return visualAction, setting, charactersPresent, artPrompt, or panelVisual.
- The final page must resolve positively and clearly for the age.
- Create environments[] once for persistent locations. Reuse environmentId on panels instead of repeating the whole environment.

${formatStructuredStoryInputSection(spec, { includeIllustrationStyle: true })}

${formatStoryTitleSection({ isContinuation })}

${formatContentPolicySection(spec)}

${continuationSections}

CLOSING ARTIFACT:
${closingArtifactRules(spec)}

PLOT FIDELITY:
- Use the scenario plot guidance as the concrete story seed.
- Do not replace a specific plot seed with an unrelated generic quest.
- If the guidance names a creature, problem, object, place, or rule, it must appear in dialogue and panel visual fields where relevant.
- Maintain panel-to-panel continuity. Do not mention a story, action, object, relationship, or lesson unless it was shown in previous panels, introduced clearly in the same line, or visible in the same panel visual.
- Do not praise, correct, or react to a specific off-screen story/event that was never shown. Make the missing beat visible in the same panel or remove the reference.
- Every panel must add a new story beat. Do not repeat the same speaker, same warning, same location update, or same information in adjacent panels or twice on the same page.
- If a line would repeat previous information, replace it with a new reaction, choice, joke, emotional shift, or visible complication.

VISUAL ACTION LOGIC:
- Before writing each action, reveal, puzzle, rescue, tool-use, or magic-effect panel, choose the exact visible cause-and-effect mechanism for that one frame.
- visual.primaryRead should name the affected story object or result, not only the team activity. Example: "Vines pull the tilted stone upright" instead of "The team pulls hard".
- visual.sceneVisual.setting must include the prop/tool connection and visible result: what the rope, vine, lever, bridge, key, light, spell, water, or object is attached to, touching, opening, lifting, blocking, moving, or changing.
- Each acting character description must include the functional interaction with the important prop or object: hands gripping the same vine, vine looped around the statue base, log wedged under the stone as a lever, stone tilting upright, water/debris shifting aside.
- If the dialogue says a plan works, the panel visual must show how it works in the frame. A viewer should understand the physical or magical logic without reading the dialogue.
- For coordinated actions, describe one shared system connecting everyone: the same rope/vine/lever/path/light links the characters to the affected object.

AGE RULES:
${ageRules(spec.ageGroup)}

PANEL DENSITY:
${panelDensityRules(spec.ageGroup, pageCount)}

DIALOGUE RHYTHM:
${dialogueRhythmRules(spec.ageGroup, pageCount)}

THOUGHT BUBBLE LOGIC:
${thoughtBubbleRules(spec.ageGroup, pageCount)}

CHARACTERS:
${graphicNovelCharacterList(spec, isContinuation ? continuationContext : undefined)}

${formatStructuredOutfitRules({ includeChangeRules: true })}

${formatStructuredSpeakerNameRules({
  helperKind: 'creature_or_helper',
  includeAudioContext: true,
})}

${formatReferenceGroundedCharacterRules({ includeGraphicDetails: true })}

${formatStructuredEnvironmentRules({ target: 'pages', includePanelDeltaRule: true })}

PAGE ROLES:
- Page 1: opening
- Page 2: setup
- Pages 3-6: conversation, action, reveal, or reflection depending on story needs
- Page ${pageCount}: resolution

PANEL REQUIREMENTS:
- panelId must be stable and unique, like "p1-1".
- visual.environmentId must match environments[].id.
- visual.primaryRead: short English phrase, 3-10 words, naming the main visual read of this panel.
- visual.sceneVisual.setting, cameraComposition.shot, cameraComposition.characters, and lighting must describe ONE moment.
- visual.sceneVisual.cameraComposition.characters[].description must include placement, pose, readable expression, gaze direction, gesture, and interaction with props or other characters. For action/mechanism panels, include the contact point and the object being affected.
- Every visual.sceneVisual.cameraComposition.characters[] item must include:
  - position: semantic blocking like "left_foreground", "right_midground", "center_background", "upper_left_hovering".
  - outfitId: exact id from top-level outfits[] for the clothes worn in this panel.
- For panels with 2 dialogue lines from 2 speakers, place speakers on clearly different left/right or foreground/background positions so bubble tails can point cleanly after Vision analysis.
- For reference-grounded characters, that description must stay reference-safe and must not override the downstream reference image.
- No text instructions, no speech bubble instructions, and no readable text in visual fields.
- Do not output coordinates or bubble placement metadata. The server derives exact bubble tails from finished artwork using Vision analysis.
- dialogue[].text and thoughts[].text must be ${GRAPHIC_NOVEL_LINE_MAX_CHARS} characters or fewer.
- captions must be ${GRAPHIC_NOVEL_CAPTION_MAX_CHARS} characters or fewer.
- A panel may contain 2 dialogue lines when the dialogue array has 2 items. Use different speakers for those exchange panels.
- Do not write full dialogue or thought lines in ALL CAPS. Show volume through emotion and visual fields instead.
- Do not depend on server shortening text. If a thought needs more room, split it into another bubble or panel.
- Avoid extra text outside dialogue/thought/caption fields.
`;
}

export function buildGraphicNovelSafetyFallbackPrompt(params: {
  spec: StorySpec;
  pageCount: number;
  isContinuation?: boolean;
  continuationContext?: ContinuationPromptContext;
}): string {
  const { spec, pageCount, isContinuation, continuationContext } = params;
  const continuationSections =
    isContinuation && continuationContext
      ? [
          formatContinuationStoryContext({ context: continuationContext, mode: 'graphic_novel' }),
          formatContinuationLocationMemory(continuationContext.previousEnvironments),
          formatContinuationOutfitMemory(continuationContext.previousOutfits),
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';
  return `Create a structured illustrated dialogue story as JSON.

SAFETY AND TONE:
- Make everything wholesome, gentle, playful, and age-appropriate for age group ${spec.ageGroup}.
- Avoid frightening detail, harm, weapons, threats, romance, risky behavior, and mature themes.
- Adventure, medieval, magic, and creature elements must stay friendly and symbolic.

OUTPUT:
- Return JSON matching the schema exactly.
- Create exactly ${pageCount} pages.
- Every page must have at least 2 panels.
- Use dialogue, occasional private thoughts, and rare short captions.
- Each panel must contain final bubble text plus visual instructions only: dialogue/thoughts/caption and visual.
- Create environments[] once for persistent locations and reuse environmentId on panels.
- The final page resolves warmly and clearly.

${formatStructuredStoryInputSection(spec)}

${formatStoryTitleSection({ isContinuation })}

${formatContentPolicySection(spec)}

${continuationSections}

CLOSING ARTIFACT:
${closingArtifactRules(spec)}

PACING:
${ageRules(spec.ageGroup)}
${panelDensityRules(spec.ageGroup, pageCount)}

DIALOGUE:
${dialogueRhythmRules(spec.ageGroup, pageCount)}
${thoughtBubbleRules(spec.ageGroup, pageCount)}
- dialogue[].text and thoughts[].text must be ${GRAPHIC_NOVEL_LINE_MAX_CHARS} characters or fewer.
- captions must be ${GRAPHIC_NOVEL_CAPTION_MAX_CHARS} characters or fewer.
- For panels with 2 dialogue lines, use 2 different speakers and make the lines answer each other directly.

CHARACTERS:
${
  isContinuation && continuationContext
    ? graphicNovelCharacterList(spec, continuationContext)
    : safetyFallbackCharacterList(spec)
}

${formatStructuredOutfitRules({ includeChangeRules: true })}

${formatStructuredSpeakerNameRules()}

${formatStructuredEnvironmentRules({ target: 'pages', includePanelDeltaRule: true })}

PANEL VISUAL RULES:
- panelId must be stable and unique, like "p1-1".
- visual.environmentId must match environments[].id.
- visual.primaryRead is a short English phrase, 3-10 words.
- visual.sceneVisual.setting must include visible cause/effect for action, puzzle, rescue, tool-use, or magic-effect panels: what object is touched, moved, opened, lifted, blocked, or changed.
- visual.sceneVisual.cameraComposition.characters[].description must include placement, pose, expression, gaze, gesture, and interaction for this exact panel. For action/mechanism panels, include the contact point and the object being affected.
- Every visual.sceneVisual.cameraComposition.characters[] item must include position.
- Every visual.sceneVisual.cameraComposition.characters[] item must include outfitId.
- For reference-grounded characters, describe only temporary pose/action/emotion/staging; do not describe stable identity details.
- Do not output coordinates, bubble placement metadata, or readable text in visual fields.
`;
}

export const GRAPHIC_NOVEL_SCRIPT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    language: { type: 'string' },
    environments: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short unique environment id referenced by panels' },
          name: { type: 'string', description: 'Human-readable location name' },
          description: {
            type: 'string',
            description:
              'Base visual description IN ENGLISH. Include reusable static layout, fixed objects, relative positions, materials, colors, time/weather if important.',
          },
        },
        required: ['id', 'name', 'description'],
      },
    },
    outfits: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description:
              'Short unique wardrobe id referenced by panel cameraComposition characters',
          },
          characterName: {
            type: 'string',
            minLength: 1,
            description: 'Exact character name wearing this outfit',
          },
          description: {
            type: 'string',
            minLength: 1,
            description:
              'Wardrobe-only English description. Garments, shoes, worn accessories only; no face, hair, body, pose, or identity details.',
          },
        },
        required: ['id', 'characterName', 'description'],
      },
    },
    pages: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          pageNumber: { type: 'integer', minimum: 1 },
          pageRole: {
            type: 'string',
            enum: [
              'opening',
              'setup',
              'conversation',
              'action',
              'reveal',
              'reflection',
              'resolution',
            ],
          },
          panels: {
            type: 'array',
            minItems: 2,
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
                      text: {
                        type: 'string',
                        minLength: 1,
                        maxLength: GRAPHIC_NOVEL_LINE_MAX_CHARS,
                      },
                      emotion: { type: 'string' },
                    },
                    required: ['speaker', 'text'],
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
                      text: {
                        type: 'string',
                        minLength: 1,
                        maxLength: GRAPHIC_NOVEL_LINE_MAX_CHARS,
                      },
                      emotion: { type: 'string' },
                    },
                    required: ['speaker', 'text'],
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
                        'Short English focus phrase, 3-10 words, naming what the viewer understands first. For action panels, name the affected object/result, not only the team activity.',
                    },
                    sceneVisual: {
                      type: 'object',
                      properties: {
                        setting: {
                          type: 'string',
                          description:
                            'Scene-specific additions IN ENGLISH. Describe what is new/changed in this panel, not the whole environment. For action/tool/magic panels, include visible cause/effect: what object is touched, moved, opened, lifted, blocked, or changed.',
                        },
                        cameraComposition: {
                          type: 'object',
                          properties: {
                            shot: {
                              type: 'string',
                              description: 'Shot type and camera angle in English',
                            },
                            characters: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  name: { type: 'string' },
                                  position: {
                                    type: 'string',
                                    description:
                                      'Semantic panel blocking, e.g. left_foreground, right_midground, center_background, upper_left_hovering.',
                                  },
                                  description: {
                                    type: 'string',
                                    description:
                                      'Placement, pose, expression, gaze, gesture, and interaction for this exact panel. For action/mechanism panels, include contact point and affected object. For reference-grounded characters, do not override stable identity/reference appearance.',
                                  },
                                  outfitId: {
                                    type: 'string',
                                    minLength: 1,
                                    description:
                                      'Exact outfits[].id for the clothes this character wears in this panel.',
                                  },
                                },
                                required: ['name', 'position', 'description', 'outfitId'],
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
        required: ['pageNumber', 'pageRole', 'panels'],
      },
    },
  },
  required: ['title', 'description', 'language', 'environments', 'outfits', 'pages'],
};
