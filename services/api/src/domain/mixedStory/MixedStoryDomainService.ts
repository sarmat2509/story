import type { StoryEnvironment, StoryOutfitRow, StorySpec } from '../../ai/types';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import type { CameraCharacterComposition } from '../../services/types';
import {
  buildMixedStoryPrompt,
  buildMixedStoryScriptSchema,
  graphicNovelPanelCountRange,
  graphicNovelPanelDensityRequirement,
  GRAPHIC_NOVEL_CAPTION_MAX_CHARS,
  GRAPHIC_NOVEL_LINE_MAX_CHARS,
  GRAPHIC_NOVEL_SPEAKER_MAX_CHARS,
} from '../../prompts/text';
import type { ContinuationPromptContext } from '../../prompts/helpers';
import type {
  GraphicNovelLine,
  GraphicNovelPageRole,
  GraphicNovelPanelScript,
  GraphicNovelPanelVisual,
} from '../graphicNovel/types';
import { logger } from '../../utils/logger';
import type {
  MixedStoryComicAgeConstraintViolation,
  MixedStoryReadingBlock,
  MixedStoryScript,
  MixedStoryScriptValidationIssue,
} from './types';

const MIXED_STORY_MAX_OUTPUT_TOKENS = 48000;
const MIXED_STORY_SCRIPT_ATTEMPTS = 2;
const FALLBACK_ENVIRONMENT_ID = 'env_main';

const GENERIC_PLACEHOLDER_SPEAKERS = new Set([
  'hero',
  'character',
  'kid',
  'child',
  'friend',
  'person',
  'narrator',
]);

const GENERIC_PLACEHOLDER_VISUAL_READS = [
  'characters notice a new clue',
  'characters take a warm next step',
  'mixed comic panel',
];

const OFF_TOPIC_PROSE_PATTERNS = [
  /\bDCRA\b/i,
  /Climate Risk Analysis/i,
  /climate-related/i,
  /military operations/i,
  /national security/i,
  /framework for the department/i,
  /key takeaways/i,
];

type OutfitKind = 'natural' | 'everyday' | 'swimwear';

export class MixedStoryScriptValidationError extends Error {
  constructor(public readonly issues: MixedStoryScriptValidationIssue[]) {
    super(
      `Mixed story script failed validation: ${issues
        .slice(0, 8)
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`
    );
    this.name = 'MixedStoryScriptValidationError';
  }
}

function fallbackEnvironment(spec: StorySpec): StoryEnvironment {
  return {
    id: FALLBACK_ENVIRONMENT_ID,
    name: spec.scenarioCard?.name || spec.goalName || 'Main Story Place',
    description:
      'A clear child-friendly story location with simple fixed objects, readable open space for characters, warm colors, and uncluttered background areas.',
  };
}

function normalizeEnvironments(script: MixedStoryScript, spec: StorySpec): StoryEnvironment[] {
  const seen = new Set<string>();
  const environments = (Array.isArray(script.environments) ? script.environments : [])
    .filter((environment) => environment?.id && environment?.description)
    .map((environment) => ({
      id: String(environment.id),
      name: environment.name || environment.id,
      description: environment.description,
      characterOutfits: environment.characterOutfits,
    }))
    .filter((environment) => {
      if (seen.has(environment.id)) return false;
      seen.add(environment.id);
      return true;
    });

  return environments.length > 0 ? environments : [fallbackEnvironment(spec)];
}

function normalizeOutfits(script: MixedStoryScript): Map<string, StoryOutfitRow> {
  const outfits = new Map<string, StoryOutfitRow>();
  for (const outfit of Array.isArray(script.outfits) ? script.outfits : []) {
    const id = String(outfit?.id || '').trim();
    const characterName = String(outfit?.characterName || '').trim();
    const description = String(outfit?.description || '').trim();
    if (!id || !characterName || !description || outfits.has(id)) continue;
    outfits.set(id, { id, characterName, description });
  }
  return outfits;
}

function outfitKeyForCharacter(characterName: string, kind: OutfitKind): string {
  const hex = Buffer.from(characterName.trim() || 'character', 'utf8')
    .toString('hex')
    .slice(0, 10);
  return `o_${hex}_${kind}`;
}

function isHumanStoryCharacter(spec: StorySpec, characterName: string): boolean {
  const lower = characterName.trim().toLowerCase();
  const match = (spec.characters || []).find(
    (character) =>
      String(character.name || '')
        .trim()
        .toLowerCase() === lower
  );
  const type = String(match?.type || '').toLowerCase();
  return ['child', 'person', 'human', 'adult', 'parent'].includes(type);
}

function isSwimmingPanel(panel: GraphicNovelPanelScript): boolean {
  const text = [
    panel.visual?.primaryRead,
    panel.visual?.sceneVisual?.setting,
    typeof panel.visual?.sceneVisual?.cameraComposition === 'object'
      ? panel.visual.sceneVisual.cameraComposition.shot
      : panel.visual?.sceneVisual?.cameraComposition,
    ...(panel.dialogue || []).map((line) => line.text),
    ...(panel.thoughts || []).map((line) => line.text),
    panel.caption,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /(swim|swimming|swimsuit|bathing|pool|water play|плав|купа|пірна|басейн|озер|вод[аиіою])/iu.test(
    text
  );
}

function isSwimwearDescription(description: string): boolean {
  return /(swimwear|swimsuit|swimming trunks|bathing suit|rash guard|wetsuit|купальн|плавки|купальник)/iu.test(
    description
  );
}

function ensureOutfit(
  outfits: Map<string, StoryOutfitRow>,
  params: { characterName: string }
): string {
  const id = outfitKeyForCharacter(params.characterName, 'natural');
  if (!outfits.has(id)) {
    outfits.set(id, {
      id,
      characterName: params.characterName,
      description: 'natural appearance',
    });
  }
  return id;
}

function panelSpeakers(panel: GraphicNovelPanelScript): string[] {
  const names = new Set<string>();
  for (const line of [...(panel.dialogue || []), ...(panel.thoughts || [])]) {
    const speaker = String(line?.speaker || '').trim();
    if (speaker) names.add(speaker);
  }
  return [...names];
}

function legacyCharacters(panel: GraphicNovelPanelScript): CameraCharacterComposition[] {
  const composition = panel.visual?.sceneVisual?.cameraComposition;
  if (composition && typeof composition !== 'string' && Array.isArray(composition.characters)) {
    return composition.characters.map((character) => ({
      name: character.name,
      description:
        character.description || 'visible in the panel with readable expression and pose',
      position: character.position,
      outfitId: character.outfitId,
    }));
  }

  return (Array.isArray(panel.charactersPresent) ? panel.charactersPresent : []).map(
    (name, index) => ({
      name,
      description:
        index === 0
          ? 'foreground left, readable expression, looking toward the panel action'
          : 'foreground right, readable expression, responding to the other character',
    })
  );
}

function withRequiredPanelCharacters(
  panel: GraphicNovelPanelScript,
  characters: CameraCharacterComposition[]
): CameraCharacterComposition[] {
  const byName = new Map<string, CameraCharacterComposition>();
  for (const character of characters) {
    const name = String(character.name || '').trim();
    if (!name || byName.has(name)) continue;
    byName.set(name, character);
  }

  for (const speaker of panelSpeakers(panel)) {
    if (byName.has(speaker)) continue;
    const index = byName.size;
    byName.set(speaker, {
      name: speaker,
      position: index % 2 === 0 ? 'left_foreground' : 'right_foreground',
      description:
        index % 2 === 0
          ? 'visible in the panel, readable expression, looking toward the other speaker or panel action'
          : 'visible in the panel, responding to the other speaker, readable expression and clear gaze',
    });
  }

  return [...byName.values()];
}

function withOutfitIds(
  panel: GraphicNovelPanelScript,
  spec: StorySpec,
  outfits: Map<string, StoryOutfitRow>,
  characters: CameraCharacterComposition[]
): CameraCharacterComposition[] {
  void panel;
  void spec;
  return characters.map((character) => {
    const characterName = character.name || 'Character';
    const existing = character.outfitId?.trim();
    const existingOutfit = existing ? outfits.get(existing) : undefined;
    if (existingOutfit) {
      return character;
    }
    return {
      ...character,
      outfitId: ensureOutfit(outfits, { characterName }),
    };
  });
}

function roleForComicBlock(comicPageNumber: number, comicBlockCount: number): GraphicNovelPageRole {
  if (comicPageNumber === 1) return 'opening';
  if (comicPageNumber === comicBlockCount) return 'resolution';
  const roles: GraphicNovelPageRole[] = ['setup', 'conversation', 'action', 'reveal', 'reflection'];
  return roles[(comicPageNumber - 2) % roles.length];
}

function trimToLimit(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return normalized.slice(0, Math.max(0, limit - 1)).trimEnd();
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function expectedCharacterNames(spec: StorySpec): Set<string> {
  const names = new Set<string>();
  for (const character of spec.characters || []) {
    const name = normalizeName(String(character?.name || ''));
    if (name) names.add(name);
  }
  const childName = normalizeName(String(spec.childName || ''));
  if (childName) names.add(childName);
  return names;
}

function isGenericPlaceholderSpeaker(speaker: string, spec: StorySpec): boolean {
  const normalized = normalizeName(speaker);
  if (!GENERIC_PLACEHOLDER_SPEAKERS.has(normalized)) return false;
  return !expectedCharacterNames(spec).has(normalized);
}

function isGenericPlaceholderVisualRead(value: string): boolean {
  const normalized = normalizeName(value);
  return GENERIC_PLACEHOLDER_VISUAL_READS.some((placeholder) => normalized.includes(placeholder));
}

function languageLetterStats(value: string): {
  latin: number;
  cyrillic: number;
  totalLetters: number;
} {
  const latin = (value.match(/\p{Script=Latin}/gu) || []).length;
  const cyrillic = (value.match(/\p{Script=Cyrillic}/gu) || []).length;
  return {
    latin,
    cyrillic,
    totalLetters: latin + cyrillic,
  };
}

function textMatchesExpectedLanguage(value: string, language: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const stats = languageLetterStats(text);
  if (stats.totalLetters < 3) return true;
  if (language === 'uk' || language === 'ru') {
    return stats.cyrillic / stats.totalLetters >= 0.65;
  }
  if (
    language === 'en' ||
    language === 'es' ||
    language === 'de' ||
    language === 'fr' ||
    language === 'pl'
  ) {
    return stats.cyrillic === 0 || stats.latin / stats.totalLetters >= 0.65;
  }
  return true;
}

function hasOffTopicProseContamination(value: string): boolean {
  return OFF_TOPIC_PROSE_PATTERNS.some((pattern) => pattern.test(value));
}

function hasExcessiveWhitespace(value: string): boolean {
  const newlineCount = (value.match(/\n/g) || []).length;
  return newlineCount > 4 || /\n\s*\n\s*\n/.test(value);
}

function normalizeProseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function validateProseText(params: {
  text: string;
  path: string;
  spec: StorySpec;
  issues: MixedStoryScriptValidationIssue[];
}): string | null {
  const { text, path, spec, issues } = params;
  const rawText = String(text || '');
  const normalized = normalizeProseText(rawText);
  if (!normalized) {
    issues.push({ path, message: 'Prose block text is missing.' });
    return null;
  }
  if (hasExcessiveWhitespace(rawText)) {
    issues.push({
      path,
      message: 'Prose block contains excessive whitespace or embedded blank lines.',
    });
  }
  if (!textMatchesExpectedLanguage(normalized, spec.language)) {
    issues.push({
      path,
      message: `Prose block text does not match requested language ${spec.language}.`,
    });
  }
  if (hasOffTopicProseContamination(normalized)) {
    issues.push({
      path,
      message: 'Prose block contains off-topic external-document contamination.',
    });
  }
  return normalized;
}

function repairLine(
  line: GraphicNovelLine,
  path: string,
  spec: StorySpec,
  repairs: MixedStoryComicAgeConstraintViolation[],
  issues: MixedStoryScriptValidationIssue[]
): GraphicNovelLine | null {
  const rawSpeaker = String(line?.speaker || '').trim();
  const textSource = String(line?.text || '').trim();
  if (!rawSpeaker) {
    issues.push({
      path: `${path}.speaker`,
      message: 'Comic dialogue/thought line is missing a speaker.',
    });
    return null;
  }
  if (isGenericPlaceholderSpeaker(rawSpeaker, spec)) {
    issues.push({
      path: `${path}.speaker`,
      message: `Comic line uses generic placeholder speaker "${rawSpeaker}".`,
    });
  }
  if (!textSource) {
    issues.push({ path: `${path}.text`, message: 'Comic dialogue/thought line is missing text.' });
    return null;
  }
  if (!textMatchesExpectedLanguage(textSource, spec.language)) {
    issues.push({
      path: `${path}.text`,
      message: `Comic bubble text does not match requested language ${spec.language}.`,
    });
  }
  const speaker = trimToLimit(rawSpeaker, GRAPHIC_NOVEL_SPEAKER_MAX_CHARS);
  const text = trimToLimit(textSource, GRAPHIC_NOVEL_LINE_MAX_CHARS);
  if (speaker !== rawSpeaker) {
    repairs.push({
      path: `${path}.speaker`,
      message: 'Speaker exceeded comic limit and was repaired.',
      repaired: true,
    });
  }
  if (text !== textSource.replace(/\s+/g, ' ').trim()) {
    repairs.push({
      path: `${path}.text`,
      message: 'Bubble text exceeded comic limit and was repaired.',
      repaired: true,
    });
  }
  return {
    speaker,
    text,
    emotion: typeof line?.emotion === 'string' ? line.emotion : undefined,
  };
}

function normalizePanelVisual(params: {
  panel: GraphicNovelPanelScript;
  panelIndex: number;
  environments: StoryEnvironment[];
  spec: StorySpec;
  outfits: Map<string, StoryOutfitRow>;
}): GraphicNovelPanelVisual {
  const { panel, panelIndex, environments, spec, outfits } = params;
  const environmentIds = new Set(environments.map((environment) => environment.id));
  const fallbackEnvId = environments[0]?.id || FALLBACK_ENVIRONMENT_ID;
  const source = panel.visual;
  const environmentId =
    source?.environmentId && environmentIds.has(source.environmentId)
      ? source.environmentId
      : fallbackEnvId;
  const cameraComposition = source?.sceneVisual?.cameraComposition;
  const characters = withOutfitIds(
    panel,
    spec,
    outfits,
    withRequiredPanelCharacters(panel, legacyCharacters(panel))
  );

  return {
    environmentId,
    primaryRead:
      source?.primaryRead ||
      panel.visualAction ||
      panel.artPrompt ||
      `Mixed comic panel ${panelIndex}`,
    sceneVisual: {
      setting:
        source?.sceneVisual?.setting ||
        panel.setting ||
        'Scene-specific visual change in the reusable environment.',
      lighting: source?.sceneVisual?.lighting || 'clear warm child-friendly lighting',
      cameraComposition: {
        shot:
          (typeof cameraComposition === 'object' ? cameraComposition?.shot : undefined) ||
          'medium shot, eye level',
        characters,
      },
    },
  };
}

function normalizePanel(params: {
  panel: GraphicNovelPanelScript;
  comicPageNumber: number;
  panelIndex: number;
  environments: StoryEnvironment[];
  spec: StorySpec;
  outfits: Map<string, StoryOutfitRow>;
  repairs: MixedStoryComicAgeConstraintViolation[];
  issues: MixedStoryScriptValidationIssue[];
}): GraphicNovelPanelScript {
  const { panel, comicPageNumber, panelIndex, environments, spec, outfits, repairs, issues } =
    params;
  const path = `readingBlocks[comic:${comicPageNumber}].panels[${panelIndex - 1}]`;
  const dialogue = (Array.isArray(panel.dialogue) ? panel.dialogue : [])
    .map((line, index) => repairLine(line, `${path}.dialogue[${index}]`, spec, repairs, issues))
    .filter((line): line is GraphicNovelLine => Boolean(line));
  const thoughts = (Array.isArray(panel.thoughts) ? panel.thoughts : [])
    .map((line, index) => repairLine(line, `${path}.thoughts[${index}]`, spec, repairs, issues))
    .filter((line): line is GraphicNovelLine => Boolean(line));
  const rawCaption = typeof panel.caption === 'string' ? panel.caption.trim() : '';
  const caption = rawCaption ? trimToLimit(rawCaption, GRAPHIC_NOVEL_CAPTION_MAX_CHARS) : undefined;
  if (rawCaption && !textMatchesExpectedLanguage(rawCaption, spec.language)) {
    issues.push({
      path: `${path}.caption`,
      message: `Comic caption does not match requested language ${spec.language}.`,
    });
  }
  if (rawCaption && caption !== rawCaption.replace(/\s+/g, ' ').trim()) {
    repairs.push({
      path: `${path}.caption`,
      message: 'Caption exceeded comic limit and was repaired.',
      repaired: true,
    });
  }
  if (dialogue.length === 0 && thoughts.length === 0 && !caption) {
    issues.push({
      path,
      message: 'Comic panel has no dialogue, thought, or caption text for reading/audio.',
    });
  }
  if (!panel.visual?.primaryRead && !panel.visualAction && !panel.artPrompt) {
    issues.push({
      path: `${path}.visual.primaryRead`,
      message: 'Comic panel is missing a concrete visual primary read.',
    });
  }
  if (isGenericPlaceholderVisualRead(String(panel.visual?.primaryRead || ''))) {
    issues.push({
      path: `${path}.visual.primaryRead`,
      message: 'Comic panel uses a generic placeholder visual read.',
    });
  }
  if (!panel.visual?.sceneVisual?.setting) {
    issues.push({
      path: `${path}.visual.sceneVisual.setting`,
      message: 'Comic panel is missing scene visual setting.',
    });
  }
  if (!panel.visual?.sceneVisual?.lighting) {
    issues.push({
      path: `${path}.visual.sceneVisual.lighting`,
      message: 'Comic panel is missing scene visual lighting.',
    });
  }
  const cameraComposition = panel.visual?.sceneVisual?.cameraComposition;
  if (!cameraComposition || typeof cameraComposition === 'string') {
    issues.push({
      path: `${path}.visual.sceneVisual.cameraComposition`,
      message: 'Comic panel is missing structured camera composition.',
    });
  }

  return {
    ...panel,
    panelId: panel.panelId || `m${comicPageNumber}-${panelIndex}`,
    dialogue,
    thoughts,
    caption,
    visual: normalizePanelVisual({ panel, panelIndex, environments, spec, outfits }),
    charactersPresent: Array.isArray(panel.charactersPresent) ? panel.charactersPresent : undefined,
  };
}

function blockKey(block: MixedStoryReadingBlock): number {
  return Number.isFinite(Number(block.screenOrder))
    ? Number(block.screenOrder)
    : Number.MAX_SAFE_INTEGER;
}

function proseTextFromSource(
  sourceBlocks: MixedStoryReadingBlock[],
  proseIndex: number,
  sceneIds: number[]
): string | null {
  const overlapping = sourceBlocks
    .filter(
      (block): block is Extract<MixedStoryReadingBlock, { kind: 'prose' }> => block.kind === 'prose'
    )
    .filter(
      (block) =>
        sceneIds.length > 0 &&
        Array.isArray(block.sceneIds) &&
        block.sceneIds.some((sceneId) => sceneIds.includes(Number(sceneId)))
    )
    .map((block) => String(block.text || '').trim())
    .filter(Boolean);
  if (overlapping.length > 0) return overlapping.join('\n\n');

  const proseBlocks = sourceBlocks
    .filter(
      (block): block is Extract<MixedStoryReadingBlock, { kind: 'prose' }> => block.kind === 'prose'
    )
    .sort((a, b) => blockKey(a) - blockKey(b));
  const fallback = proseBlocks[proseIndex]?.text;
  const text = String(fallback || '').trim();
  return text || null;
}

export function validateMixedStoryComicAgeConstraints(
  script: MixedStoryScript
): MixedStoryComicAgeConstraintViolation[] {
  const violations: MixedStoryComicAgeConstraintViolation[] = [];
  for (const block of script.readingBlocks) {
    if (block.kind !== 'comic') continue;
    block.panels.forEach((panel, panelIndex) => {
      panel.dialogue.forEach((line, lineIndex) => {
        if (line.speaker.length > GRAPHIC_NOVEL_SPEAKER_MAX_CHARS) {
          violations.push({
            path: `comic:${block.comicPageNumber}.panel:${panelIndex + 1}.dialogue:${lineIndex + 1}.speaker`,
            message: 'Speaker exceeds graphic novel speaker character limit.',
            repaired: false,
          });
        }
        if (line.text.length > GRAPHIC_NOVEL_LINE_MAX_CHARS) {
          violations.push({
            path: `comic:${block.comicPageNumber}.panel:${panelIndex + 1}.dialogue:${lineIndex + 1}.text`,
            message: 'Dialogue exceeds graphic novel bubble character limit.',
            repaired: false,
          });
        }
      });
      panel.thoughts.forEach((line, lineIndex) => {
        if (line.text.length > GRAPHIC_NOVEL_LINE_MAX_CHARS) {
          violations.push({
            path: `comic:${block.comicPageNumber}.panel:${panelIndex + 1}.thought:${lineIndex + 1}.text`,
            message: 'Thought exceeds graphic novel bubble character limit.',
            repaired: false,
          });
        }
      });
      if ((panel.caption || '').length > GRAPHIC_NOVEL_CAPTION_MAX_CHARS) {
        violations.push({
          path: `comic:${block.comicPageNumber}.panel:${panelIndex + 1}.caption`,
          message: 'Caption exceeds graphic novel caption character limit.',
          repaired: false,
        });
      }
    });
  }
  return violations;
}

function validateRawBlockShape(params: {
  block: MixedStoryReadingBlock;
  index: number;
  spec: StorySpec;
  issues: MixedStoryScriptValidationIssue[];
}): void {
  const { block, index, spec, issues } = params;
  const path = `readingBlocks[${index}]`;
  if (block.kind === 'comic') {
    const comicText = String((block as any).text || '').trim();
    if (comicText) {
      issues.push({
        path: `${path}.text`,
        message:
          'Comic block contains prose text. Comic narration must be expressed as panel dialogue, thoughts, or captions.',
      });
    }
    if (!Array.isArray(block.panels) || block.panels.length === 0) {
      issues.push({ path: `${path}.panels`, message: 'Comic block is missing panels.' });
      return;
    }
    const panelRange = graphicNovelPanelCountRange(spec.ageGroup);
    if (block.panels.length < panelRange.min) {
      issues.push({
        path: `${path}.panels`,
        message: `Comic block has fewer than ${panelRange.min} panels for age ${spec.ageGroup}.`,
      });
    }
    if (block.panels.length > panelRange.max) {
      issues.push({
        path: `${path}.panels`,
        message: `Comic block has more than ${panelRange.max} panels for age ${spec.ageGroup}.`,
      });
    }
    return;
  }

  const proseWithPanels = Array.isArray((block as any).panels) && (block as any).panels.length > 0;
  if (proseWithPanels) {
    issues.push({ path: `${path}.panels`, message: 'Prose block must not contain comic panels.' });
  }
  validateProseText({
    text: block.text,
    path: `${path}.text`,
    spec,
    issues,
  });
}

function validateNormalizedMixedStoryScript(params: {
  script: MixedStoryScript;
  spec: StorySpec;
  sceneCount: number;
  comicSceneIds: number[];
  comicBlockCount: number;
  issues: MixedStoryScriptValidationIssue[];
}): void {
  const { script, spec, sceneCount, comicSceneIds, comicBlockCount, issues } = params;
  if (script.language && script.language !== spec.language) {
    issues.push({
      path: 'language',
      message: `Script language ${script.language} does not match requested language ${spec.language}.`,
    });
  }

  const comicBlocks = script.readingBlocks.filter((block) => block.kind === 'comic');
  if (comicBlocks.length !== comicBlockCount) {
    issues.push({
      path: 'readingBlocks',
      message: `Expected ${comicBlockCount} comic blocks, got ${comicBlocks.length}.`,
    });
  }

  const densityRequirement = graphicNovelPanelDensityRequirement(spec.ageGroup, comicBlockCount);
  if (densityRequirement && comicBlocks.length > 0) {
    const densePages = comicBlocks.filter((block) => {
      const panelCount = block.panels.length;
      return (
        panelCount >= densityRequirement.denseMinPanels &&
        (densityRequirement.denseMaxPanels === undefined ||
          panelCount <= densityRequirement.denseMaxPanels)
      );
    });
    if (densePages.length < densityRequirement.minimumDensePages) {
      issues.push({
        path: 'readingBlocks',
        message:
          `Age ${spec.ageGroup} requires at least ${densityRequirement.minimumDensePages} comic pages ` +
          `with ${densityRequirement.denseMinPanels}` +
          `${densityRequirement.denseMaxPanels ? `-${densityRequirement.denseMaxPanels}` : '+'} panels.`,
      });
    }
    if (densityRequirement.maximumThreePanelPages !== undefined) {
      const threePanelPages = comicBlocks.filter((block) => block.panels.length === 3);
      if (threePanelPages.length > densityRequirement.maximumThreePanelPages) {
        issues.push({
          path: 'readingBlocks',
          message: `Age ${spec.ageGroup} allows at most ${densityRequirement.maximumThreePanelPages} three-panel comic pages.`,
        });
      }
    }
    if (spec.ageGroup === '6-8') {
      const openingPage =
        comicBlocks.find((block) => block.comicPageNumber === 1) ?? comicBlocks[0];
      if (
        openingPage &&
        (openingPage.panels.length < densityRequirement.denseMinPanels ||
          (densityRequirement.denseMaxPanels !== undefined &&
            openingPage.panels.length > densityRequirement.denseMaxPanels))
      ) {
        issues.push({
          path: 'readingBlocks[comic:1].panels',
          message:
            `Age 6-8 opening comic page must have ${densityRequirement.denseMinPanels}` +
            `${densityRequirement.denseMaxPanels ? `-${densityRequirement.denseMaxPanels}` : '+'} panels.`,
        });
      }
    }
  }

  if (script.readingBlocks.length !== sceneCount) {
    issues.push({
      path: 'readingBlocks',
      message: `Expected ${sceneCount} reading blocks, got ${script.readingBlocks.length}.`,
    });
  }

  const comicSceneSet = new Set(comicSceneIds.slice(0, comicBlockCount));
  script.readingBlocks.forEach((block, index) => {
    const sceneId = index + 1;
    const expectedKind = comicSceneSet.has(sceneId) ? 'comic' : 'prose';
    if (block.kind !== expectedKind) {
      issues.push({
        path: `readingBlocks[${index}].kind`,
        message: `Mixed story block ${sceneId} must follow the scene plan; expected ${expectedKind}.`,
      });
    }
    if (block.screenOrder !== index + 1) {
      issues.push({
        path: `readingBlocks[${index}].screenOrder`,
        message: 'Screen order must be consecutive and match display/audio order.',
      });
    }
    if (block.kind === 'comic' && block.sceneId !== sceneId) {
      issues.push({
        path: `readingBlocks[${index}].sceneId`,
        message: `Comic block sceneId must be ${sceneId}.`,
      });
    }
    if (block.kind === 'prose') {
      const sceneIds = Array.isArray(block.sceneIds) ? block.sceneIds : [];
      if (sceneIds.length !== 1 || sceneIds[0] !== sceneId) {
        issues.push({
          path: `readingBlocks[${index}].sceneIds`,
          message: `Prose block must contain only scene ${sceneId}.`,
        });
      }
    }
  });
}

export function normalizeMixedStoryScript(params: {
  raw: MixedStoryScript;
  spec: StorySpec;
  sceneCount: number;
  comicSceneIds: number[];
  comicBlockCount: number;
}): {
  script: MixedStoryScript;
  repairs: MixedStoryComicAgeConstraintViolation[];
} {
  const { raw, spec, sceneCount, comicSceneIds, comicBlockCount } = params;
  const environments = normalizeEnvironments(raw, spec);
  const outfits = normalizeOutfits(raw);
  const repairs: MixedStoryComicAgeConstraintViolation[] = [];
  const issues: MixedStoryScriptValidationIssue[] = [];
  const sourceBlocks = Array.isArray(raw.readingBlocks) ? raw.readingBlocks : [];
  if (sourceBlocks.length === 0) {
    issues.push({ path: 'readingBlocks', message: 'Mixed story script has no reading blocks.' });
  }
  sourceBlocks.forEach((block, index) => validateRawBlockShape({ block, index, spec, issues }));
  const comicBlocks = sourceBlocks
    .filter(
      (block): block is Extract<MixedStoryReadingBlock, { kind: 'comic' }> => block.kind === 'comic'
    )
    .sort((a, b) => {
      const pageA = Number(a.comicPageNumber || 0);
      const pageB = Number(b.comicPageNumber || 0);
      return (pageA || blockKey(a)) - (pageB || blockKey(b));
    });
  const readingBlocks: MixedStoryReadingBlock[] = [];
  const comicSceneToPage = new Map<number, number>();
  comicSceneIds.slice(0, comicBlockCount).forEach((sceneId, index) => {
    comicSceneToPage.set(sceneId, index + 1);
  });
  let proseIndex = 0;

  for (let sceneId = 1; sceneId <= sceneCount; sceneId += 1) {
    const comicPageNumber = comicSceneToPage.get(sceneId);
    if (!comicPageNumber) {
      const rawProseText = proseTextFromSource(sourceBlocks, proseIndex, [sceneId]);
      const proseText = validateProseText({
        text: rawProseText || '',
        path: `readingBlocks[prose:${sceneId}].text`,
        spec,
        issues,
      });
      proseIndex += 1;
      if (!proseText) continue;
      readingBlocks.push({
        kind: 'prose',
        screenOrder: sceneId,
        sceneIds: [sceneId],
        text: proseText,
      });
      continue;
    }

    const source =
      sourceBlocks.find(
        (block): block is Extract<MixedStoryReadingBlock, { kind: 'comic' }> =>
          block.kind === 'comic' && Number(block.sceneId) === sceneId
      ) ??
      comicBlocks.find((block) => Number(block.comicPageNumber) === comicPageNumber) ??
      comicBlocks[comicPageNumber - 1];
    if (!source) {
      issues.push({
        path: `readingBlocks[comic:${comicPageNumber}]`,
        message: `Missing comic block for page ${comicPageNumber} / scene ${sceneId}.`,
      });
      continue;
    }
    const panelRange = graphicNovelPanelCountRange(spec.ageGroup);
    const sourcePanels =
      Array.isArray(source.panels) && source.panels.length > 0
        ? source.panels.slice(0, panelRange.max)
        : [];
    if (sourcePanels.length === 0) {
      issues.push({
        path: `readingBlocks[comic:${comicPageNumber}].panels`,
        message: 'Comic block has no usable panels.',
      });
      continue;
    }
    const panels = sourcePanels.map((panel, panelIndex) =>
      normalizePanel({
        panel,
        comicPageNumber,
        panelIndex: panelIndex + 1,
        environments,
        spec,
        outfits,
        repairs,
        issues,
      })
    );

    readingBlocks.push({
      kind: 'comic',
      screenOrder: sceneId,
      sceneId,
      comicPageNumber,
      panels,
    });
  }

  const script: MixedStoryScript = {
    title: raw.title || 'Mixed Story',
    description: raw.description || 'A child-friendly mixed prose and comic story.',
    language: raw.language || spec.language,
    environments,
    outfits: [...outfits.values()],
    readingBlocks,
  };

  validateNormalizedMixedStoryScript({
    script,
    spec,
    sceneCount,
    comicSceneIds,
    comicBlockCount,
    issues,
  });
  if (issues.length > 0) {
    throw new MixedStoryScriptValidationError(issues);
  }

  const remainingViolations = validateMixedStoryComicAgeConstraints(script);
  if (remainingViolations.length > 0) {
    throw new Error(
      `Mixed story comic text violates graphic novel age constraints: ${remainingViolations
        .map((violation) => `${violation.path}: ${violation.message}`)
        .join('; ')}`
    );
  }

  return { script, repairs };
}

export function mixedStoryComicPages(script: MixedStoryScript) {
  return script.readingBlocks
    .filter(
      (block): block is Extract<MixedStoryReadingBlock, { kind: 'comic' }> => block.kind === 'comic'
    )
    .map((block) => ({
      pageNumber: block.comicPageNumber,
      pageRole: roleForComicBlock(
        block.comicPageNumber,
        script.readingBlocks.filter((item) => item.kind === 'comic').length
      ),
      panels: block.panels,
    }));
}

export class MixedStoryDomainService {
  constructor(private textProvider: ITextProvider) {}

  async generateScript(params: {
    spec: StorySpec;
    sceneCount: number;
    comicSceneIds: number[];
    comicBlockCount: number;
    isContinuation?: boolean;
    continuationContext?: ContinuationPromptContext;
    onUsage?: (usage: UsageMetadata) => void;
  }): Promise<{
    script: MixedStoryScript;
    repairs: MixedStoryComicAgeConstraintViolation[];
  }> {
    let validationFeedback: string[] | undefined;
    let lastError: unknown;
    const schema = buildMixedStoryScriptSchema({
      readingBlockCount: params.sceneCount,
      comicPanelRange: graphicNovelPanelCountRange(params.spec.ageGroup),
    });

    for (let attempt = 1; attempt <= MIXED_STORY_SCRIPT_ATTEMPTS; attempt += 1) {
      const raw = await this.textProvider.generateStructured<MixedStoryScript>({
        prompt: buildMixedStoryPrompt({
          ...params,
          validationFeedback,
        }),
        schema,
        maxTokens: MIXED_STORY_MAX_OUTPUT_TOKENS,
        temperature: attempt === 1 ? 0.82 : 0.55,
        onUsage: params.onUsage,
        operation: attempt === 1 ? 'mixed_story_script' : 'mixed_story_script_retry',
      });

      try {
        const normalized = normalizeMixedStoryScript({ raw, ...params });
        logger.info(
          {
            title: normalized.script.title,
            attempt,
            comicBlockCount: normalized.script.readingBlocks.filter(
              (block) => block.kind === 'comic'
            ).length,
            blockCount: normalized.script.readingBlocks.length,
            repairedComicTextViolations: normalized.repairs.length,
          },
          'Mixed story script generated'
        );
        return normalized;
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof MixedStoryScriptValidationError) ||
          attempt >= MIXED_STORY_SCRIPT_ATTEMPTS
        ) {
          throw error;
        }
        validationFeedback = error.issues
          .slice(0, 12)
          .map((issue) => `${issue.path}: ${issue.message}`);
        logger.warn(
          {
            attempt,
            issueCount: error.issues.length,
            issues: validationFeedback,
          },
          'Mixed story script validation failed; retrying writer'
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Mixed story script generation failed validation');
  }
}
