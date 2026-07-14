import type { StorySpec } from '../../ai/types';
import type { GraphicNovelPageScript, GraphicNovelScript } from '../../domain/graphicNovel/types';
import type { JsonSchema } from '../../providers/base/JsonSchema';
import {
  formatContinuationLocationMemory,
  formatContinuationOutfitMemory,
  formatContinuationStoryContext,
  formatContactGeometryWriterRule,
  formatContentPolicySection,
  formatDynamicForeshorteningRules,
  formatReferenceGroundedCharacterRules,
  formatSceneVisualStagingDeltaRule,
  formatStoryTitleSection,
  formatStructuredOutfitRules,
  formatStructuredEnvironmentRules,
  formatStructuredSpeakerNameRules,
  formatStructuredStoryInputSection,
  formatWriterCharacterName,
  structuredCameraCharacterOutfitIdJsonSchema,
  structuredOutfitsJsonSchema,
  type ContinuationCharacter,
  type ContinuationPromptContext,
} from '../helpers';
import {
  visualCharacterReferenceLabelRegistryLines,
  visualCharacterReferenceLabelsFromCharacters,
  type VisualCharacterReferenceLabel,
  type VisualReferenceCharacterInput,
} from '../visualReferenceLabels';

export const GRAPHIC_NOVEL_LINE_MAX_CHARS = 110;
export const GRAPHIC_NOVEL_CAPTION_MAX_CHARS = 90;
export const GRAPHIC_NOVEL_SPEAKER_MAX_CHARS = 40;
export const GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS = 3;
const GRAPHIC_NOVEL_SUGGESTED_PAGE_FOCUS_SUPPORTING_CHARACTERS = 2;
const GRAPHIC_NOVEL_PANEL_VISUAL_STAGING_RULE = formatSceneVisualStagingDeltaRule(
  'visual.sceneVisual.setting'
);

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

function visualReferenceCharacterInputs(
  spec: StorySpec,
  continuationContext?: ContinuationPromptContext
): VisualReferenceCharacterInput[] {
  return [
    ...(spec.characters ?? []),
    ...(continuationContext?.requiredCharacters ?? []),
    ...(continuationContext?.optionalCharacters ?? []),
  ];
}

export function graphicNovelVisualReferenceLabelSection(
  spec: StorySpec,
  continuationContext?: ContinuationPromptContext,
  visualReferenceLabels?: VisualCharacterReferenceLabel[]
): string {
  const labels =
    visualReferenceLabels ??
    visualCharacterReferenceLabelsFromCharacters(
      visualReferenceCharacterInputs(spec, continuationContext)
    );
  const lines = visualCharacterReferenceLabelRegistryLines(labels);
  if (lines.length === 0) {
    return [
      'VISUAL CHARACTER REFERENCES:',
      '- No precomputed REF_CH_* labels are available. Use exact story names in speaker/name fields and keep visual text explicit without inventing REF labels.',
    ].join('\n');
  }

  return [
    'VISUAL CHARACTER REFERENCES:',
    ...lines,
    '- Use these REF_CH_* labels only inside visual fields: visual.primaryRead, visual.sceneVisual.setting, visual.sceneVisual.cameraComposition.shot, visual.sceneVisual.cameraComposition.characters[].description, and visual.sceneVisual.lighting.',
    '- Keep dialogue[].speaker, thoughts[].speaker, and visual.sceneVisual.cameraComposition.characters[].name as exact story names, not REF_CH_* labels.',
    '- Never use REF_CH_* labels in title, description, prose text, dialogue text, thought text, captions, or speaker names.',
    '- When a listed character is mentioned in visual text, write its REF_CH_* label instead of the natural-language character name.',
    '- If a REF_CH_* label appears anywhere in a panel visual, that same character must appear in that panel cameraComposition.characters[] row.',
    '- Newly invented characters do not have REF_CH labels while you write this JSON. If a newly invented named helper/creature/object is visible, acted on, or named by primaryRead/setting, include its exact characters[].name in that panel cameraComposition.characters[] row.',
    '- Visual spatial relationships must identify exact subjects. Do not write vague relationship/group words like "friend", "friends", "his friends", "her friends", "the group", "everyone", "others", "them", "companions", or "the team" in visual fields.',
    '- Instead write explicit relationships such as "standing between REF_CH_A and REF_CH_B", "looking at REF_CH_A", or "beside REF_CH_B". For newly invented characters without REF labels, use the exact characters[].name.',
  ].join('\n');
}

type VisualArtifactReference = {
  referenceId: string;
};

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

function pushUniquePromptName(names: string[], value: unknown): void {
  if (typeof value !== 'string') return;
  const name = formatWriterCharacterName(value);
  if (!name) return;
  const key = name.normalize('NFC').toLocaleLowerCase();
  if (names.some((existing) => existing.normalize('NFC').toLocaleLowerCase() === key)) return;
  names.push(name);
}

function graphicNovelCoreCastNames(
  spec: StorySpec,
  continuationContext?: ContinuationPromptContext
): string[] {
  const names: string[] = [];
  for (const character of continuationContext?.requiredCharacters || []) {
    pushUniquePromptName(names, character.name);
  }
  for (const character of spec.characters || []) {
    pushUniquePromptName(names, character.name);
  }
  return names;
}

function graphicNovelEveryPageChildNames(spec: StorySpec): string[] {
  const names: string[] = [];
  for (const character of spec.characters || []) {
    if (String(character.type || '').toLowerCase() === 'child') {
      pushUniquePromptName(names, character.name);
    }
  }
  return names;
}

function hashPromptSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededPromptRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledPromptNames(names: string[], seedInput: string): string[] {
  const shuffled = [...names];
  const random = seededPromptRandom(hashPromptSeed(seedInput));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function suggestedPageFocus(
  anchorNames: string[],
  rotatingNames: string[],
  pageIndex: number
): string[] {
  const supportingSlots =
    anchorNames.length > 0
      ? GRAPHIC_NOVEL_SUGGESTED_PAGE_FOCUS_SUPPORTING_CHARACTERS
      : GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS;
  const cast = anchorNames.slice();
  if (rotatingNames.length === 0) return cast;
  if (rotatingNames.length <= supportingSlots) return [...cast, ...rotatingNames];

  const selected: string[] = [];
  const stride = Math.max(1, supportingSlots);
  const start = (pageIndex * stride) % rotatingNames.length;
  for (
    let offset = 0;
    offset < rotatingNames.length && selected.length < supportingSlots;
    offset += 1
  ) {
    selected.push(rotatingNames[(start + offset) % rotatingNames.length]);
  }
  return [...cast, ...selected];
}

export function graphicNovelCastCoverageRules(params: {
  spec: StorySpec;
  pageCount: number;
  continuationContext?: ContinuationPromptContext;
}): string {
  const coreNames = graphicNovelCoreCastNames(params.spec, params.continuationContext);
  const childAnchorNames = graphicNovelEveryPageChildNames(params.spec);
  const childAnchorKeys = new Set(
    childAnchorNames.map((name) => name.normalize('NFC').toLocaleLowerCase())
  );
  const seedInput = [
    params.spec.language,
    params.spec.ageGroup,
    params.spec.goal,
    params.spec.goalName,
    params.spec.scenarioCard?.id,
    params.spec.scenarioCard?.name,
    params.spec.userNotes,
    coreNames.join('|'),
    String(params.pageCount),
  ]
    .filter(Boolean)
    .join('|');
  const rotatingNames = shuffledPromptNames(
    coreNames.filter((name) => !childAnchorKeys.has(name.normalize('NFC').toLocaleLowerCase())),
    seedInput
  );

  const rotation =
    coreNames.length > 0
      ? Array.from({ length: params.pageCount }, (_, index) => {
          const cast = suggestedPageFocus(childAnchorNames, rotatingNames, index);
          return `- Page ${index + 1} suggested focus: ${cast.join(', ')}`;
        }).join('\n')
      : '- No preselected core cast; keep any invented named cast small and rotate focus.';
  const childAnchorRule =
    childAnchorNames.length > 0
      ? `- EVERY-PAGE CHILD PROTAGONIST: ${childAnchorNames.join(', ')} must appear visibly on every page, in at least one panel cameraComposition row on that page. The child protagonist may speak, think, act, observe, or react, but must be on-page.`
      : '- No child protagonist is listed; rotate the core cast normally.';

  return [
    '- There is no page-level character-count cap. A page may use more heroes across separate panels when the story needs it.',
    `- HARD PANEL LIMIT: each individual panel may use at most ${GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS} unique named characters total, counting dialogue speakers, thought speakers, and all visual.sceneVisual.cameraComposition.characters in that one panel.`,
    childAnchorRule,
    '- Rotate supporting heroes across pages and panels so every preselected/core character visibly appears at least once when the page count makes that possible.',
    '- The focus order below is intentionally shuffled for this story so different pages naturally feature different heroes, but it is not a page-level hard cap:',
    rotation,
  ].join('\n');
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

export function comicPanelCameraVarietyRules(options?: {
  includeDynamicForeshortening?: boolean;
}): string {
  const rules = [
    'COMIC CAMERA VARIETY:',
    '- Across each multi-panel page, vary cameraComposition.shot. Do not repeat the same shot scale, camera angle, or environment slice in every panel.',
    '- Pages with 3+ panels must include at least one wide/establishing shot and at least one extreme close-up on hands, face, a story object, or a key detail. Pages with 4+ panels should mix wide, medium, close-up/extreme close-up, and a distinct side/low/high/over-shoulder angle when the story allows.',
    '- When panels reuse one environment, choose different fixed-location slices: far-left zone, far-right zone, central object/detail, and full wide view. Name visible landmarks from environment.description in the shot, such as door/steps, railing/bench/sea, telescope/cliffs/shoreline, or the full terrace view when those landmarks exist.',
    '- cameraComposition.shot must state shot scale + viewpoint/angle + environment slice, not only "medium shot".',
  ];

  if (options?.includeDynamicForeshortening) {
    rules.push('', formatDynamicForeshorteningRules({ unit: 'panel' }));
  }

  return rules.join('\n');
}

export function closingArtifactRules(
  spec: StorySpec,
  visualArtifactReference?: VisualArtifactReference
): string {
  if (!spec.closingArtifact) {
    return 'No fixed keepsake artifact is required.';
  }

  const lines = [
    `Closing keepsake artifact: ${spec.closingArtifact.title}.`,
    `Artifact identity: ${spec.closingArtifact.description}`,
    'Treat the artifact title and identity as canonical. Do not replace it with a generic gift, tool, instrument, jewel, key, or token when the catalog title is more specific.',
    `On the final page, include exactly one short dialogue, thought, or caption text with the artifact phrase wrapped in braces, using "${spec.closingArtifact.title}" as the artifact concept.`,
    'Write the words inside braces in the natural grammar/case for the sentence language. If the artifact appears in the middle of a sentence, do not force Title Case; use lowercase or inflection when that reads naturally.',
    `Good English example: "This {star key} will remind us..." Good Ukrainian example: "Ця {дерев'яна маска} нагадуватиме..."`,
    'Keep the marker inside dialogue[].text, thoughts[].text, or caption only. Do not put artifact braces in visual fields.',
    'The marker must fit the same character limit as any other bubble/caption text.',
  ];

  if (visualArtifactReference?.referenceId) {
    lines.push(
      `Visual artifact reference: ${visualArtifactReference.referenceId}.`,
      `When the keepsake is visible in a panel, visual.primaryRead, visual.sceneVisual.setting, cameraComposition.shot, cameraComposition.characters[].description, or lighting must name ${visualArtifactReference.referenceId} instead of a generic object phrase.`,
      `Use ${visualArtifactReference.referenceId} from the first visible appearance of this keepsake, even before characters know its name: falling object, sparkling object, gift, clue, token, object in hands, or object being offered all count as the same keepsake.`,
      `If dialogue, thought, or caption text contains the braced artifact phrase, the same panel visual must also include ${visualArtifactReference.referenceId}.`,
      `The visible object must read as "${spec.closingArtifact.title}" using the object reference image; do not call or depict it as a generic golden instrument/artifact/sparkle/butterfly/fish/key if the title is more specific.`
    );
  }

  return lines.join('\n');
}

function graphicNovelHazardSafetyRules(): string {
  return [
    '- If weather, storm, fire, water, roads, heights, getting stuck, darkness, or any risky situation appears, stage the story so children stay safe.',
    '- Children must not run into a storm, road, water, fire, dangerous height, dark isolated place, or rescue scene without adult/teacher/parent guidance.',
    '- Prefer safe shelter, indoor observation, asking an adult, calling for help, or a friendly magical helper making the situation harmless before children act.',
    '- If the plot needs urgency, make it gentle and symbolic: a puzzle, color signal, soft glow, missing toy, blocked path, or creature asking for help from a safe distance.',
  ].join('\n');
}

export function buildGraphicNovelPrompt(params: {
  spec: StorySpec;
  pageCount: number;
  isContinuation?: boolean;
  continuationContext?: ContinuationPromptContext;
  visualReferenceLabels?: VisualCharacterReferenceLabel[];
  visualArtifactReferenceLabel?: string;
}): string {
  const {
    spec,
    pageCount,
    isContinuation,
    continuationContext,
    visualReferenceLabels,
    visualArtifactReferenceLabel,
  } = params;
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
- Generate bubble text, panel staging, persistent environment rows, and wardrobe binding rows only.
- Keep everything wholesome, gentle, positive, and age-appropriate.
- Do not include stable physical appearance, anatomy details, or reference-image descriptions in this JSON.
- Character identity and default appearance are handled later by reference images and the image pipeline.
- Outfit rows are production metadata for dressed turnarounds. Use detailed wardrobe only for child/person/human characters; non-human characters use "natural appearance".

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
- Create outfits[] once for canonical wardrobe bindings. Reuse outfitId on panels instead of repeating garment text.
- Create characters[] only for newly invented named story characters/helpers/creatures that are not listed in CHARACTERS.

${formatStructuredStoryInputSection(spec, { includeIllustrationStyle: true })}

${formatStructuredOutfitRules({ includeChangeRules: true })}

${formatStoryTitleSection({ isContinuation })}

${formatContentPolicySection(spec)}

GRAPHIC NOVEL SAFETY STAGING:
${graphicNovelHazardSafetyRules()}

${continuationSections}

CLOSING ARTIFACT:
${closingArtifactRules(
  spec,
  visualArtifactReferenceLabel ? { referenceId: visualArtifactReferenceLabel } : undefined
)}

CREATIVE SEED FIDELITY:
- Treat the creative seed as a thematic direction, not an outline or required page sequence.
- Preserve its core direction, such as a named holiday, relationship, central curiosity, or unusual situation, but freely invent the conflict, events, supporting cast, surprises, and resolution.
- Do not replace the seed's core direction with an unrelated generic quest. Details and examples inside the seed are optional unless binding theme guidance or user notes require them.
- Maintain panel-to-panel continuity. Do not mention a story, action, object, relationship, or lesson unless it was shown in previous panels, introduced clearly in the same line, or visible in the same panel visual.
- Do not praise, correct, or react to a specific off-screen story/event that was never shown. Make the missing beat visible in the same panel or remove the reference.
- Every panel must add a new story beat. Do not repeat the same speaker, same warning, same location update, or same information in adjacent panels or twice on the same page.
- If a line would repeat previous information, replace it with a new reaction, choice, joke, emotional shift, or visible complication.

VISUAL ACTION LOGIC:
- Before writing each action, reveal, puzzle, rescue, tool-use, or magic-effect panel, choose the exact visible cause-and-effect mechanism for that one frame.
- visual.primaryRead should name the affected story object or result, not only the team activity. Example: "Vines pull the tilted stone upright" instead of "The team pulls hard".
- visual.sceneVisual.setting must include the prop/tool connection and visible result: what the rope, vine, lever, bridge, key, light, spell, water, or object is attached to, touching, opening, lifting, blocking, moving, or changing.
- ${GRAPHIC_NOVEL_PANEL_VISUAL_STAGING_RULE}
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

${graphicNovelVisualReferenceLabelSection(spec, isContinuation ? continuationContext : undefined, visualReferenceLabels)}

CAST COVERAGE AND PAGE FOCUS:
${graphicNovelCastCoverageRules({ spec, pageCount, continuationContext: isContinuation ? continuationContext : undefined })}

CHARACTER NAME OWNERSHIP:
- Names listed in CHARACTERS are reserved identity names for those exact characters only.
- Never reuse a listed character name for a newly invented creature, elder, helper, narrator, location, vehicle, object, world-animal, or environmental being.
- If the scenario needs an additional named creature/helper (for example a giant animal carrying a world on its back), create a fresh name that is not similar to any listed character name.
- Add each newly invented named helper/creature/object character to top-level characters[] with type and a stable visual description for turnaround generation.
- If a newly invented named helper/creature/object is the main subject of visual.primaryRead, appears in visual.sceneVisual.setting, is watched/reacted to by others, or performs the panel action, it MUST be included in that panel visual.sceneVisual.cameraComposition.characters[] even when it is not speaking.
- Do not write a panel where primaryRead/setting says "the small creature/griffin/robot/etc." is doing the action while cameraComposition.characters[] lists only observers. Add the named character row too.
- characters[].description must be natural-language visual identity text only. Do not use REF_CH_* labels, internal IDs, panel action, or temporary scene state there.
- Do not include preselected CHARACTERS in top-level characters[].
- Do not reinterpret a reference-grounded character as a different species, scale, place, or vehicle. If a listed character appears, they remain that same character identity.
- If an environment is on, inside, or carried by a large creature, that creature must have its own new name unless it is explicitly listed in CHARACTERS as that exact creature.

${formatStructuredSpeakerNameRules({
  helperKind: 'creature_or_helper',
  includeAudioContext: true,
})}

${formatReferenceGroundedCharacterRules({ includeGraphicDetails: true })}

${formatStructuredEnvironmentRules({ target: 'pages', includePanelDeltaRule: true })}

${comicPanelCameraVarietyRules({ includeDynamicForeshortening: true })}

PAGE ROLES:
- Page 1: opening
- Page 2: setup
- Pages 3-6: conversation, action, reveal, or reflection depending on story needs
- Page ${pageCount}: resolution

PANEL REQUIREMENTS:
- panelId must be stable and unique, like "p1-1".
- The panel-level cast limit is binding: no panel may contain more than ${GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS} unique named characters total, counting dialogue speakers, thought speakers, and visual.sceneVisual.cameraComposition.characters. If more heroes are needed on the page, split them across different panels instead of staging all of them together.
- Every child protagonist named in CAST COVERAGE AND PAGE FOCUS must appear in visual.sceneVisual.cameraComposition.characters on every page.
- visual.environmentId must match environments[].id.
- visual.primaryRead: short English phrase, 3-10 words, naming the main visual read of this panel.
- ${GRAPHIC_NOVEL_PANEL_VISUAL_STAGING_RULE}
- visual.sceneVisual.setting, cameraComposition.shot, cameraComposition.characters, and lighting must describe ONE moment.
- The main acted-on subject of primaryRead/setting counts as a visible character when it is a named story helper, creature, animal, robot, object, or person. Include it in cameraComposition.characters[].
- visual.sceneVisual.cameraComposition.characters[].description must include placement, pose, readable expression, gaze direction, gesture, and interaction with props or other characters. ${formatContactGeometryWriterRule()} Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects inside descriptions.
- Every visual.sceneVisual.cameraComposition.characters[] item must include:
  - position: semantic blocking like "left_foreground", "right_midground", "center_background", "upper_left_hovering".
  - outfitId: exact outfits[].id for this character in this shot. Detailed wardrobe rows are only for child/person/human characters; animals/imaginary/creatures use a natural-appearance binding.
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
  visualReferenceLabels?: VisualCharacterReferenceLabel[];
  visualArtifactReferenceLabel?: string;
}): string {
  const {
    spec,
    pageCount,
    isContinuation,
    continuationContext,
    visualReferenceLabels,
    visualArtifactReferenceLabel,
  } = params;
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
${graphicNovelHazardSafetyRules()}

OUTPUT:
- Return JSON matching the schema exactly.
- Create exactly ${pageCount} pages.
- Every page must have at least 2 panels.
- Use dialogue, occasional private thoughts, and rare short captions.
- Each panel must contain final bubble text plus visual instructions only: dialogue/thoughts/caption and visual.
- Create environments[] once for persistent locations and reuse environmentId on panels.
- Create outfits[] once for canonical wardrobe bindings and reuse outfitId on panels.
- The final page resolves warmly and clearly.

${formatStructuredStoryInputSection(spec)}

${formatStructuredOutfitRules({ includeChangeRules: true })}

${formatStoryTitleSection({ isContinuation })}

${formatContentPolicySection(spec)}

${continuationSections}

CLOSING ARTIFACT:
${closingArtifactRules(
  spec,
  visualArtifactReferenceLabel ? { referenceId: visualArtifactReferenceLabel } : undefined
)}

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

${graphicNovelVisualReferenceLabelSection(spec, isContinuation ? continuationContext : undefined, visualReferenceLabels)}

CAST COVERAGE AND PAGE FOCUS:
${graphicNovelCastCoverageRules({ spec, pageCount, continuationContext: isContinuation ? continuationContext : undefined })}

CHARACTER NAME OWNERSHIP:
- Names listed in CHARACTERS are reserved for those exact characters only.
- Do not use a listed character name for a new creature/helper/location/object or for a large world-carrying animal.
- If the story needs another named creature, invent a different name.
- A listed character must not be rewritten as a different species, scale, place, or vehicle.

${formatStructuredSpeakerNameRules()}

${formatStructuredEnvironmentRules({ target: 'pages', includePanelDeltaRule: true })}

PANEL VISUAL RULES:
- panelId must be stable and unique, like "p1-1".
- No panel may contain more than ${GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS} unique named characters total, counting dialogue speakers, thought speakers, and visual.sceneVisual.cameraComposition.characters. Rotate extra heroes across adjacent panels instead of drawing all of them together.
- Every child protagonist named in CAST COVERAGE AND PAGE FOCUS must appear in visual.sceneVisual.cameraComposition.characters on every page.
- visual.environmentId must match environments[].id.
- visual.primaryRead is a short English phrase, 3-10 words.
- visual.sceneVisual.setting must include visible cause/effect for action, puzzle, rescue, tool-use, or magic-effect panels: what object is touched, moved, opened, lifted, blocked, or changed.
- ${GRAPHIC_NOVEL_PANEL_VISUAL_STAGING_RULE}
${comicPanelCameraVarietyRules()}
- The main acted-on subject of primaryRead/setting counts as a visible character when it is a named story helper, creature, animal, robot, object, or person. Include it in cameraComposition.characters[] even if it is not speaking.
- visual.sceneVisual.cameraComposition.characters[].description must include placement, pose, expression, gaze, gesture, and interaction for this exact panel. ${formatContactGeometryWriterRule()} Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects inside descriptions.
- Every visual.sceneVisual.cameraComposition.characters[] item must include position.
- Every visual.sceneVisual.cameraComposition.characters[] item must include outfitId. Detailed wardrobe rows are only for child/person/human characters; non-human characters use a natural-appearance binding.
- For reference-grounded characters, describe only temporary pose/action/emotion/staging; do not describe stable identity details.
- Do not output coordinates, bubble placement metadata, or readable text in visual fields.
`;
}

export function buildGraphicNovelPageRepairPrompt(params: {
  spec: StorySpec;
  script: GraphicNovelScript;
  page: GraphicNovelPageScript;
  pageCount: number;
  feedback: Array<{
    category?: string;
    severity?: string;
    message: string;
    suggestion?: string;
  }>;
  visualReferenceLabels?: VisualCharacterReferenceLabel[];
  visualArtifactReferenceLabel?: string;
}): string {
  const {
    spec,
    script,
    page,
    pageCount,
    feedback,
    visualReferenceLabels,
    visualArtifactReferenceLabel,
  } = params;
  const pageNumber = Number.isFinite(page.pageNumber) ? page.pageNumber : 1;
  const panelCount = Array.isArray(page.panels) ? page.panels.length : 2;
  const feedbackText = feedback
    .map((item, index) => {
      const prefix = `${index + 1}. ${item.category || 'validation'}${item.severity ? `/${item.severity}` : ''}`;
      return [
        `${prefix}: ${item.message}`,
        item.suggestion ? `   Suggested direction: ${item.suggestion}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  const pageSummaries = (script.pages || []).map((candidate) => ({
    pageNumber: candidate.pageNumber,
    pageRole: candidate.pageRole,
    panelReads: (candidate.panels || []).map((panel) => panel.visual?.primaryRead).filter(Boolean),
    dialogue: (candidate.panels || [])
      .flatMap((panel) => [...(panel.dialogue || []), ...(panel.thoughts || [])])
      .map((line) => `${line.speaker}: ${line.text}`),
  }));

  return `Repair exactly one graphic novel page that failed text safety validation.

Return JSON ONLY matching the schema: { "page": ... }.

REPAIR TARGET:
- Story title: ${script.title}
- Story description: ${script.description}
- Language: ${script.language || spec.language}
- Repair pageNumber ${pageNumber} of ${pageCount}.
- Keep page.pageNumber exactly ${pageNumber}.
- Keep page.pageRole exactly "${page.pageRole}".
- Return exactly ${panelCount} panels, preserving the same reading-order scale.
- Use only existing environmentId values: ${(script.environments || []).map((environment) => environment.id).join(', ') || 'env_main'}.
- Use only existing outfitId values from outfits[] or natural outfit bindings already present in the page.
- Do not create top-level environments, outfits, or characters. Only return the repaired page object.

VALIDATION PROBLEM TO FIX:
${feedbackText || '- The page failed validation; make it gentler and age-appropriate.'}

SAFETY REPAIR RULES:
${graphicNovelHazardSafetyRules()}
- Directly remove or rewrite the unsafe beat. Do not merely add a reassurance line while keeping the unsafe action.
- If the current page has children running into danger, replace that with staying sheltered, asking for help, observing safely, or the risk becoming harmless before they act.

STORY INPUT:
${formatStructuredStoryInputSection(spec)}

${formatContentPolicySection(spec)}

CLOSING ARTIFACT:
${closingArtifactRules(
  spec,
  visualArtifactReferenceLabel ? { referenceId: visualArtifactReferenceLabel } : undefined
)}

CHARACTERS:
${graphicNovelCharacterList(spec)}

${graphicNovelVisualReferenceLabelSection(spec, undefined, visualReferenceLabels)}

CAST COVERAGE AND PAGE FOCUS:
${graphicNovelCastCoverageRules({ spec, pageCount })}

PANEL VISUAL RULES:
- No panel may contain more than ${GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS} unique named characters total.
- Every child protagonist named in CAST COVERAGE AND PAGE FOCUS must appear in visual.sceneVisual.cameraComposition.characters on this repaired page.
- visual.environmentId must match one of the existing environment ids.
- visual.primaryRead is a short English phrase, 3-10 words. Use REF_CH_* for listed characters and REF_OBJ_* for fixed story artifact objects inside visual text.
- visual.sceneVisual.setting must describe one clear moment and visible cause/effect for action, puzzle, rescue, tool-use, or magic-effect panels.
- ${GRAPHIC_NOVEL_PANEL_VISUAL_STAGING_RULE}
${comicPanelCameraVarietyRules()}
- The main acted-on subject of primaryRead/setting counts as a visible character when it is a named story helper, creature, animal, robot, object, or person. Include it in cameraComposition.characters[] even if it is not speaking.
- visual.sceneVisual.cameraComposition.characters[].description must include placement, pose, expression, gaze, gesture, and interaction for this exact panel. ${formatContactGeometryWriterRule()} Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects inside descriptions.
- Every visual.sceneVisual.cameraComposition.characters[] item must include position and outfitId.
- For reference-grounded characters, describe only temporary pose/action/emotion/staging; do not describe stable identity details.
- Do not output coordinates, bubble placement metadata, or readable text in visual fields.
- dialogue[].text and thoughts[].text must be ${GRAPHIC_NOVEL_LINE_MAX_CHARS} characters or fewer.
- captions must be ${GRAPHIC_NOVEL_CAPTION_MAX_CHARS} characters or fewer.

WHOLE STORY CONTEXT SUMMARY:
${JSON.stringify(pageSummaries, null, 2)}

CURRENT FAILED PAGE JSON:
${JSON.stringify(page, null, 2)}
`;
}

export const GRAPHIC_NOVEL_SCRIPT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    language: { type: 'string' },
    characters: {
      type: 'array',
      description:
        'Only newly invented named story characters/helpers/creatures that are not preselected CHARACTERS. Omit or return [] when there are none.',
      items: {
        type: 'object',
        properties: {
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
        required: ['name', 'type', 'description'],
      },
    },
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
    outfits: structuredOutfitsJsonSchema(),
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
                        'Short English focus phrase, 3-10 words, naming what the viewer understands first. For action panels, name the affected object/result, not only the team activity. Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects from the prompt instead of natural-language names.',
                    },
                    sceneVisual: {
                      type: 'object',
                      properties: {
                        setting: {
                          type: 'string',
                          description:
                            `Scene-specific additions IN ENGLISH. Describe what is new/changed in this panel, not the whole environment. For action/tool/magic panels, include visible cause/effect: what object is touched, moved, opened, lifted, blocked, or changed. ${GRAPHIC_NOVEL_PANEL_VISUAL_STAGING_RULE} Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects from the prompt instead of natural-language names.`,
                        },
                        cameraComposition: {
                          type: 'object',
                          properties: {
                            shot: {
                              type: 'string',
                              description:
                                'Shot scale, viewpoint/angle, and environment slice in English. Examples: wide establishing shot of the full location, left-side view of door and steps, right-side view along railing and sea, central close-up on the story object, extreme close-up on hands/face/detail. Vary shot scale and angle across panels on the same page; do not write only "medium shot".',
                            },
                            characters: {
                              type: 'array',
                              maxItems: GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS,
                              description: `Characters visible in this panel. The panel must stay within ${GRAPHIC_NOVEL_MAX_PANEL_CHARACTERS} unique named characters total, counting dialogue speakers, thought speakers, and visible characters.`,
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
                                      `Placement, pose, expression, gaze, gesture, and interaction for this exact panel. ${formatContactGeometryWriterRule()} For reference-grounded characters, do not override stable identity/reference appearance. Use REF_CH_* labels for listed characters and REF_OBJ_* labels for fixed story artifact objects from the prompt instead of natural-language names.`,
                                  },
                                  outfitId: structuredCameraCharacterOutfitIdJsonSchema(),
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

const GRAPHIC_NOVEL_PAGE_SCHEMA = GRAPHIC_NOVEL_SCRIPT_SCHEMA.properties?.pages?.items;

export const GRAPHIC_NOVEL_PAGE_REPAIR_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    page:
      GRAPHIC_NOVEL_PAGE_SCHEMA ?? {
        type: 'object',
        properties: {},
      },
  },
  required: ['page'],
};
