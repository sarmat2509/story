/**
 * Single implementation of product image validation (Vision + structured JSON).
 * Used by ImageDomainService and diagnostic scripts so prompt, schema, image order, and temperature match production.
 */

import { createHash } from 'node:crypto';
import { stripCharacterIdFromName } from '@wondertales/shared';
import sharp from 'sharp';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { ImageData, JsonSchema, MultimodalInputPart } from '../../providers/base/JsonSchema';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import type { ImageValidationResult } from '../../ai/types';
import config from '../../config';
import {
  buildImageValidationRuntimePrompt,
  getImageValidationCachedPrefix,
  type ImageValidationCharacterKind,
  type ImageValidationIdentitySource,
  type ImageValidationReferenceKind,
} from '../../prompts/image/ImageValidationPrompt';
import { buildImageValidationSchema } from '../story/schemas';
import { type SceneVisual } from '../../services/types';
import {
  hashModerationSubject,
  recordModerationDecision,
} from '../../services/moderationDecisionService';
import { logger } from '../../utils/logger';

export type ProductImageValidationInput = {
  imageData: Buffer;
  mimeType: string;
  expectedCharacters: Array<{
    name: string;
    characterKind: ImageValidationCharacterKind;
    speciesSubtype?: string;
    description?: string;
    validateOutfit?: boolean;
  }>;
  sceneVisual: SceneVisual;
  referenceImages?: Array<{
    characterName: string;
    imageData?: string;
    fileUri?: string;
    mimeType: string;
    referenceKind?: ImageValidationReferenceKind;
    identitySource?: ImageValidationIdentitySource;
  }>;
  /** Optional ids for structured logs (what we send to the vision model). */
  logContext?: { storyId?: string; sceneId?: number; attempt?: number };
  onUsage?: (usage: UsageMetadata) => void;
  /**
   * When true, the validation prompt/schema also checks graphic-novel layout:
   * artwork must stay inside panel boxes and must not overlap bubbles/captions.
   */
  includeLayoutChecks?: boolean;
  /** When false, layout checks omit speech/thought/caption bubble overlap QA. */
  includeBubbleChecks?: boolean;
  /** When false, prompts do not ask the validator to evaluate wardrobe/outfit as a separate category. */
  includeWardrobeChecks?: boolean;
};

export type ProductImageValidationOptions = {
  /** Model id passed to the text provider (e.g. gemini-2.5-flash, gpt-4o). */
  visionModel?: string;
  /** Optional secondary provider used when the primary provider blocks the validation request. */
  fallbackTextProvider?: ITextProvider;
  fallbackVisionModel?: string;
  /** Diagnostic scripts can disable moderation persistence for validation-provider blocks. */
  recordModeration?: boolean;
  operation?: string;
};

type SupportedVisionMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

type PreparedValidationImage = {
  buffer: Buffer;
  mimeType: SupportedVisionMimeType;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  resized: boolean;
};

type ValidationPromptMode = 'compact' | 'reduced';
type ValidationProviderRole = 'primary' | 'fallback';
type SegmentedValidationPassKind = 'scene_qa' | 'character_identity' | 'comic_panel_page';

type PreparedValidationReferenceImage = NonNullable<
  ProductImageValidationInput['referenceImages']
>[number] & {
  mimeType: SupportedVisionMimeType;
};

type SegmentedCharacterValidationResult = {
  character: ImageValidationResult['characters'][0];
  notes?: string;
};

type SegmentedCharacterBoundingBox = {
  name: string;
  found: boolean;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  confidence: number;
  visibility: 'full_body' | 'partial_body' | 'head_only' | 'not_visible';
  duplicated?: boolean;
  duplicateCount?: number;
  duplicateNotes?: string | null;
  notes?: string | null;
};

type CharacterValidationLocalization = {
  characterBoundingBox: NonNullable<
    ImageValidationResult['characters'][number]['characterBoundingBox']
  > | null;
  characterCropRect: NonNullable<
    ImageValidationResult['characters'][number]['characterCropRect']
  > | null;
};

type SegmentedSceneQaValidationResult = {
  missingExpectedCharacters: string[];
  characterBoundingBoxes: SegmentedCharacterBoundingBox[];
  hasUnexpectedCharacters: boolean;
  unexpectedCharacterNotes?: string | null;
  hasTextOrLetters: boolean;
  hasRenderingArtifacts: boolean;
  hasSceneCompositionMismatch: boolean;
  overallFeedback: string;
  hasArtworkOutsidePanelBounds?: boolean;
  hasArtworkOverSpeechBubbles?: boolean | null;
  hasExtraPanelStructure?: boolean;
  layoutFeedback?: string;
};

export type GraphicNovelPanelValidationInput = {
  imageData: Buffer;
  mimeType: string;
  pageNumber: number;
  pageCharacters?: ProductImageValidationInput['expectedCharacters'];
  panels: Array<{
    panelNumber: number;
    panelId: string;
    expectedVisualFocus: string;
    expectedSetting?: string;
    expectedCharacters: ProductImageValidationInput['expectedCharacters'];
  }>;
  referenceImages?: ProductImageValidationInput['referenceImages'];
  logContext?: ProductImageValidationInput['logContext'];
  onUsage?: ProductImageValidationInput['onUsage'];
  includeWardrobeChecks?: boolean;
};

export type GraphicNovelPanelImageValidationResult = {
  validationStatus?: 'completed' | 'provider_blocked';
  validationAttemptKind?: string;
  validationModelUsed?: string;
  providerError?: string;
  requestManifest?: Record<string, unknown>;
  pageNumber: number;
  expectedPanelCount: number;
  detectedPanelCount: number;
  hasExtraPanelStructure: boolean;
  hasTextOrLetters: boolean;
  hasRenderingArtifacts: boolean;
  layoutFeedback: string;
  panels: Array<{
    panelNumber: number;
    panelId: string;
    panelDetected: boolean;
    matchedVisiblePanelDescription: string;
    visualMatchesExpectedMoment: boolean;
    unexpectedCharactersPresent: boolean;
    unexpectedNamedCharacters: Array<{
      name: string;
      characterKind: ImageValidationCharacterKind;
      recognizableScore: number;
      identityComparisonSummary: string;
      issue: string;
    }>;
    renderingArtifacts: boolean;
    panelIssue?: string | null;
    characters: Array<{
      name: string;
      characterKind: ImageValidationCharacterKind;
      expectedPresent: boolean;
      found: boolean;
      recognizableScore: number;
      faceMatchesReference?: boolean | null;
      hairMatchesReference?: boolean | null;
      ageReadMatchesReference?: boolean | null;
      proportionsMatchReference?: boolean | null;
      matchesColors: boolean;
      matchesOutfit: boolean;
      actualVisibleDescription?: string | null;
      sameOverallDesignRead?: boolean | null;
      silhouetteDriftSeverity?: 'none' | 'mild' | 'moderate' | 'severe' | null;
      identityComparisonSummary: string;
      characterBoundingBox?: ImageValidationResult['characters'][number]['characterBoundingBox'];
      characterCropRect?: ImageValidationResult['characters'][number]['characterCropRect'];
      issue?: string | null;
    }>;
  }>;
  overallFeedback: string;
};

export const IMAGE_VALIDATION_SYSTEM_INSTRUCTION = [
  'You are an image quality assurance inspector for a safe story illustration app.',
  'The attached images are already-generated or approved visual references. Do not generate story content.',
  'Inspect only observable visual details and return the requested JSON object.',
  'Treat every human, animal, or fantasy subject as an illustrated story character in benign storybook art; avoid sexualized or violent interpretations.',
  'When uncertain, report uncertainty in the JSON fields instead of blocking or expanding beyond the visual QA task.',
].join(' ');

const VALIDATION_HINT_RE =
  /\b(standing|sitting|kneeling|leaning|running|jumping|flying|walking|crouching|sleeping|mid-hop|turning|tilted|gaze|looking|look|expression|smil(?:e|ing)|frown(?:ing)?|wide-eyed|surprised|startled|delighted|determined|curious|alert|calm|worried|sleepy|glow(?:ing)?|transparent|translucent|shimmer(?:ing)?|spark(?:le|ling)|aura|mist|smoke|wet|muddy|snowy)\b/i;

function sha256Short(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

function compactWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeActualVisibleDescription(value: string | null | undefined): string | null {
  const text = compactWhitespace(String(value ?? ''));
  if (!text) return null;
  const lower = text.toLowerCase();
  const startsLikeProblem =
    /^(missing|lacks?|does not|doesn't|not enough|incorrect|wrong|should|needs?|must)\b/.test(
      lower
    );
  const containsProblem =
    /\b(missing|mismatch|does not match|doesn't match|differs from|should be|needs to|validator|reference|signature|not visible|not present)\b/.test(
      lower
    );
  return startsLikeProblem || containsProblem ? null : text;
}

function truncateText(text: string, maxChars: number): string {
  const compact = compactWhitespace(text);
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function stripObjectTailForValidationHint(text: string): string {
  return compactWhitespace(
    text
      .replace(
        /\b(with|while|beside|near|toward|towards|onto|into|inside|around|above|under|behind|at|on|in)\b[\s\S]*$/i,
        ''
      )
      .replace(/[,:;.\s]+$/g, '')
  );
}

function extractObservableHints(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  const hints: string[] = [];
  for (const rawClause of text.split(/[.;]/)) {
    if (!VALIDATION_HINT_RE.test(rawClause)) continue;
    const hint = stripObjectTailForValidationHint(rawClause);
    if (!hint) continue;
    hints.push(truncateText(hint, 90));
    if (hints.length >= 3) break;
  }
  return hints;
}

function buildExpectedCharactersForPrompt(
  expectedCharacters: ProductImageValidationInput['expectedCharacters'],
  referenceImages: ProductImageValidationInput['referenceImages'] | undefined,
  mode: ValidationPromptMode,
  includeWardrobeChecks = true
): ProductImageValidationInput['expectedCharacters'] {
  return expectedCharacters.map((c) => ({
    name: c.name,
    characterKind: c.characterKind,
    speciesSubtype: c.speciesSubtype,
    // With references, the images are the primary identity ground truth. Keep verbose
    // prose only for characters that do not have their own identity reference.
    description:
      mode === 'reduced' || charHasIdentityReference(c.name, referenceImages)
        ? undefined
        : c.description,
    validateOutfit: includeWardrobeChecks && c.validateOutfit === true,
  }));
}

function buildCompactValidationSceneManifest(
  sceneVisual: SceneVisual,
  mode: ValidationPromptMode
): string | undefined {
  if (mode === 'reduced') {
    return undefined;
  }

  const cameraComposition = sceneVisual.cameraComposition;
  const characterHintLines =
    typeof cameraComposition === 'string'
      ? []
      : cameraComposition.characters
          .map((char) => {
            const hints = extractObservableHints(char.description);
            return hints.length > 0 ? `${char.name}: ${hints.join('; ')}` : undefined;
          })
          .filter((line): line is string => !!line);

  const sceneText = [
    sceneVisual.setting,
    sceneVisual.lighting,
    typeof cameraComposition === 'string' ? cameraComposition : cameraComposition.shot,
    typeof cameraComposition === 'string'
      ? undefined
      : cameraComposition.characters.map((char) => char.description).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
  const sceneStateHints = extractObservableHints(sceneText).slice(0, 4);

  const lines = [
    'VALIDATION MANIFEST:',
    'task: compare generated illustration to expected roster and visual references',
    sceneStateHints.length > 0 ? `scene_state_hints: ${sceneStateHints.join('; ')}` : undefined,
    characterHintLines.length > 0
      ? `character_pose_expression_hints:\n${characterHintLines.map((line) => `- ${line}`).join('\n')}`
      : undefined,
  ].filter(Boolean);

  return lines.length > 2 ? lines.join('\n') : undefined;
}

function isProviderBlockedError(message: string): boolean {
  return /PROHIBITED_CONTENT|content_filter|blocked/i.test(message);
}

function normalizeVisionMimeType(mimeType: string): SupportedVisionMimeType {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === 'image/jpg' || normalized === 'image/jpeg') return 'image/jpeg';
  if (normalized === 'image/webp') return 'image/webp';
  if (normalized === 'image/gif') return 'image/gif';
  return 'image/png';
}

function buildValidationImageInstruction(params: {
  imageIndex: number;
  characterName?: string;
  referenceKind?: ImageValidationReferenceKind;
  identitySource?: ImageValidationIdentitySource;
}): string {
  if (params.imageIndex === 1) {
    return 'Image 1: GENERATED ILLUSTRATION to inspect. Validate this image against the expected roster and references that follow.';
  }

  const name = params.characterName?.trim() || 'unknown character';
  if (params.identitySource === 'dressed_turnaround') {
    return `Image ${params.imageIndex}: DRESSED TURNAROUND reference for "${name}". Identity and visible wardrobe ground truth. Held/carried props are optional scene props.`;
  }

  if (params.identitySource === 'turnaround') {
    return `Image ${params.imageIndex}: IDENTITY TURNAROUND reference for "${name}". Whole-character visual identity ground truth. Held/carried props are optional scene props.`;
  }

  return `Image ${params.imageIndex}: IDENTITY reference for "${name}". Whole-character visual identity ground truth. Held/carried props are optional scene props.`;
}

async function prepareImageForValidation(
  buffer: Buffer,
  mimeType: string,
  maxSide: number
): Promise<PreparedValidationImage> {
  const normalizedMimeType = normalizeVisionMimeType(mimeType);
  const metadata = await sharp(buffer, { animated: false }).rotate().metadata();
  const originalWidth = metadata.width;
  const originalHeight = metadata.height;

  if (
    !originalWidth ||
    !originalHeight ||
    maxSide <= 0 ||
    Math.max(originalWidth, originalHeight) <= maxSide
  ) {
    return {
      buffer,
      mimeType: normalizedMimeType,
      width: originalWidth,
      height: originalHeight,
      originalWidth,
      originalHeight,
      resized: false,
    };
  }

  let pipeline = sharp(buffer, { animated: false }).rotate().resize({
    width: maxSide,
    height: maxSide,
    fit: 'inside',
    withoutEnlargement: true,
  });

  let outputMimeType: SupportedVisionMimeType = normalizedMimeType;
  if (normalizedMimeType === 'image/jpeg') {
    pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
  } else if (normalizedMimeType === 'image/webp') {
    pipeline = pipeline.webp({ quality: 85 });
  } else {
    pipeline = pipeline.png({ compressionLevel: 9 });
    outputMimeType = 'image/png';
  }

  const resizedBuffer = await pipeline.toBuffer();
  const resizedMeta = await sharp(resizedBuffer, { animated: false }).metadata();

  return {
    buffer: resizedBuffer,
    mimeType: outputMimeType,
    width: resizedMeta.width,
    height: resizedMeta.height,
    originalWidth,
    originalHeight,
    resized: true,
  };
}

function validationNamesMatch(a: string, b: string): boolean {
  const na = stripCharacterIdFromName(a).trim().toLowerCase();
  const nb = stripCharacterIdFromName(b).trim().toLowerCase();
  return na === nb || a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function findExpectedForValidationChar(
  charName: string,
  expected: ProductImageValidationInput['expectedCharacters']
): ProductImageValidationInput['expectedCharacters'][0] | undefined {
  return expected.find((e) => validationNamesMatch(e.name, charName));
}

export function charHasIdentityReference(
  charName: string,
  refs:
    | ReadonlyArray<{
        characterName: string;
        imageData?: string;
        fileUri?: string;
        referenceKind?: ImageValidationReferenceKind;
        identitySource?: ImageValidationIdentitySource;
      }>
    | undefined
): boolean {
  if (!refs?.length) return false;
  return refs.some(
    (r) =>
      (r.referenceKind == null || r.referenceKind === 'identity') &&
      validationNamesMatch(r.characterName, charName)
  );
}

function findIdentityReferenceIndex(
  charName: string,
  refs:
    | ReadonlyArray<{
        characterName: string;
        referenceKind?: ImageValidationReferenceKind;
      }>
    | undefined
): number | undefined {
  if (!refs?.length) return undefined;
  const index = refs.findIndex(
    (r) =>
      (r.referenceKind == null || r.referenceKind === 'identity') &&
      validationNamesMatch(r.characterName, charName)
  );
  return index >= 0 ? index + 2 : undefined;
}

function resetReferenceOnlyFieldsForUnreferencedCharacter(
  c: ImageValidationResult['characters'][0]
): void {
  c.faceMatchesReference = null;
  c.hairMatchesReference = null;
  c.ageReadMatchesReference = null;
  c.proportionsMatchReference = null;
  delete c.sameOverallDesignRead;
  delete c.silhouetteDriftSeverity;
  c.identityComparisonSummary =
    'No identity reference was provided for this character; reference comparison fields are not applicable.';
}

function normalizeOutfitVerdictForExpectedCharacter(
  c: ImageValidationResult['characters'][0],
  expected: ProductImageValidationInput['expectedCharacters'][number] | undefined
): void {
  if (expected?.validateOutfit === true) return;
  c.matchesOutfit = true;
}

/**
 * Strip legacy model field and log structural inconsistencies (acceptance uses score only in orchestration).
 */
export function normalizeImageValidationResult(
  result: ImageValidationResult & { isValid?: boolean },
  expectedCharacters: ProductImageValidationInput['expectedCharacters'],
  referenceImages: ProductImageValidationInput['referenceImages'] | undefined,
  includeLayoutChecks = false,
  includeBubbleChecks = true
): ImageValidationResult {
  const { isValid: _ignored, ...rest } = result;
  const out = { ...rest } as ImageValidationResult;
  if (includeLayoutChecks && out.hasArtworkOutsidePanelBounds == null) {
    out.hasArtworkOutsidePanelBounds = false;
  }
  if (includeLayoutChecks && includeBubbleChecks && out.hasArtworkOverSpeechBubbles == null) {
    out.hasArtworkOverSpeechBubbles = false;
  }
  if (includeLayoutChecks && out.hasExtraPanelStructure == null) {
    out.hasExtraPanelStructure = false;
  }
  if (includeLayoutChecks && out.layoutFeedback == null) {
    out.layoutFeedback = 'not_requested';
  }

  for (const c of out.characters) {
    c.actualVisibleDescription = normalizeActualVisibleDescription(c.actualVisibleDescription);
    const exp = findExpectedForValidationChar(c.name, expectedCharacters);
    const expectedKind = exp?.characterKind ?? null;
    const hasIdentityReference = charHasIdentityReference(c.name, referenceImages);
    normalizeOutfitVerdictForExpectedCharacter(c, exp);
    if (!hasIdentityReference) {
      resetReferenceOnlyFieldsForUnreferencedCharacter(c);
    }
    if (expectedKind && c.characterKind !== expectedKind) {
      logger.warn(
        { name: c.name, expectedKind, got: c.characterKind },
        'Image validation characterKind mismatch vs expected list'
      );
    }
  }

  for (const c of out.characters) {
    const exp = findExpectedForValidationChar(c.name, expectedCharacters);
    if (!exp || exp.characterKind !== 'human') continue;
    if (c.characterKind !== 'human') continue;
    if (!charHasIdentityReference(c.name, referenceImages)) continue;
    if (
      c.faceMatchesReference === false ||
      c.hairMatchesReference === false ||
      c.ageReadMatchesReference === false ||
      c.proportionsMatchReference === false
    ) {
      logger.warn(
        { name: c.name },
        'Image validation human with identity reference has false identity boolean(s)'
      );
    }
  }

  for (const c of out.characters) {
    const exp = findExpectedForValidationChar(c.name, expectedCharacters);
    if (!exp || exp.characterKind === 'human') continue;
    if (!charHasIdentityReference(c.name, referenceImages)) continue;
    const score = c.recognizableScore ?? 1;
    if (c.proportionsMatchReference === false && score <= 0.7) {
      logger.warn(
        {
          name: c.name,
          kind: exp.characterKind,
          proportionsMatchReference: c.proportionsMatchReference,
          recognizableScore: score,
        },
        'Image validation non-human proportions/score concern'
      );
    }
    if (c.sameOverallDesignRead === false) {
      logger.warn(
        { name: c.name, kind: exp.characterKind },
        'Image validation sameOverallDesignRead false'
      );
    }
    if (c.silhouetteDriftSeverity === 'severe') {
      logger.warn(
        { name: c.name, kind: exp.characterKind },
        'Image validation silhouetteDriftSeverity severe'
      );
    }
  }

  return out;
}

function summarizeValidationIssues(
  c: ImageValidationResult['characters'][0],
  expectedCharacters: ProductImageValidationInput['expectedCharacters'],
  referenceImages: ProductImageValidationInput['referenceImages'] | undefined
): string | null {
  const parts: string[] = [];
  const exp = findExpectedForValidationChar(c.name, expectedCharacters);
  if (!c.found) parts.push('missing');
  if (c.duplicated) parts.push('duplicated');
  if ((c.recognizableScore ?? 1) < 0.5)
    parts.push(`lowRecognizable(${(c.recognizableScore ?? 0).toFixed(2)})`);
  if (!c.matchesColors) parts.push('colors');
  if (exp?.validateOutfit === true && !c.matchesOutfit) parts.push('outfit');
  const hasRef = charHasIdentityReference(c.name, referenceImages);
  const humanWithRef = exp?.characterKind === 'human' && c.characterKind === 'human' && hasRef;
  if (humanWithRef) {
    if (c.faceMatchesReference === false) parts.push('face');
    if (c.hairMatchesReference === false) parts.push('hair');
    if (c.ageReadMatchesReference === false) parts.push('ageRead');
    if (c.proportionsMatchReference === false) parts.push('proportions');
  }
  const nonHumanWithRef =
    exp && exp.characterKind !== 'human' && c.characterKind !== 'human' && hasRef;
  if (nonHumanWithRef) {
    if (c.proportionsMatchReference === false) parts.push('proportions');
    if (c.sameOverallDesignRead === false) parts.push('designRead');
    if (c.silhouetteDriftSeverity && c.silhouetteDriftSeverity !== 'none') {
      parts.push(`silhouette:${c.silhouetteDriftSeverity}`);
    }
  }
  if (exp && c.characterKind !== exp.characterKind) {
    parts.push(`characterKindMismatch(expected=${exp.characterKind},got=${c.characterKind})`);
  }
  if (parts.length === 0) return null;
  return `${c.name}: ${parts.join(',')}${c.issue ? ` — ${c.issue}` : ''}`;
}

function buildSegmentedCharacterSchema(): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['character', 'notes'],
    properties: {
      character: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name',
          'characterKind',
          'found',
          'duplicated',
          'recognizableScore',
          'faceMatchesReference',
          'hairMatchesReference',
          'ageReadMatchesReference',
          'proportionsMatchReference',
          'matchesColors',
          'matchesOutfit',
          'actualVisibleDescription',
          'sameOverallDesignRead',
          'silhouetteDriftSeverity',
          'identityComparisonSummary',
          'issue',
        ],
        properties: {
          name: { type: 'string' },
          characterKind: { type: 'string', enum: ['human', 'animal', 'imaginary'] },
          found: {
            type: 'boolean',
            description:
              'Crop identity verdict. true only when the cropped candidate is actually the expected character identity; false when this crop contains a substitute/wrong stable design. Do not search outside the crop.',
          },
          duplicated: { type: 'boolean' },
          recognizableScore: { type: 'number', minimum: 0, maximum: 1 },
          faceMatchesReference: { type: ['boolean', 'null'] },
          hairMatchesReference: {
            type: ['boolean', 'null'],
            description:
              'HUMAN only. Broad hair color is insufficient; compare visible braid/ponytail/bun count, placement, anchor point, loose-vs-braided structure, length/silhouette, and accent-color placement.',
          },
          ageReadMatchesReference: { type: ['boolean', 'null'] },
          proportionsMatchReference: { type: ['boolean', 'null'] },
          matchesColors: { type: 'boolean' },
          matchesOutfit: { type: 'boolean' },
          actualVisibleDescription: {
            type: ['string', 'null'],
            description:
              'Short concrete noun phrase describing the visible substitute/candidate currently in Image 1, not the problem. Example: "small green person with a blue flower". Do not write missing/differs/should-change text.',
          },
          sameOverallDesignRead: { type: ['boolean', 'null'] },
          silhouetteDriftSeverity: {
            type: ['string', 'null'],
            enum: ['none', 'mild', 'moderate', 'severe', null],
          },
          identityComparisonSummary: { type: 'string' },
          issue: { type: ['string', 'null'] },
        },
      },
      notes: { type: ['string', 'null'] },
    },
  };
}

function buildSegmentedSceneQaSchema(
  includeLayoutChecks: boolean,
  includeBubbleChecks: boolean
): JsonSchema {
  const required = [
    'missingExpectedCharacters',
    'characterBoundingBoxes',
    'hasUnexpectedCharacters',
    'unexpectedCharacterNotes',
    'hasTextOrLetters',
    'hasRenderingArtifacts',
    'hasSceneCompositionMismatch',
    'overallFeedback',
  ];
  if (includeLayoutChecks) {
    required.push(
      'hasArtworkOutsidePanelBounds',
      'hasArtworkOverSpeechBubbles',
      'hasExtraPanelStructure',
      'layoutFeedback'
    );
  }

  return {
    type: 'object',
    additionalProperties: false,
    required,
    properties: {
      missingExpectedCharacters: {
        type: 'array',
        items: { type: 'string' },
      },
      characterBoundingBoxes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'found',
            'xMin',
            'yMin',
            'xMax',
            'yMax',
            'confidence',
            'visibility',
            'duplicated',
            'duplicateCount',
            'duplicateNotes',
            'notes',
          ],
          properties: {
            name: { type: 'string' },
            found: { type: 'boolean' },
            xMin: { type: 'integer', minimum: 0, maximum: 1000 },
            yMin: { type: 'integer', minimum: 0, maximum: 1000 },
            xMax: { type: 'integer', minimum: 0, maximum: 1000 },
            yMax: { type: 'integer', minimum: 0, maximum: 1000 },
            confidence: { type: 'integer', minimum: 0, maximum: 100 },
            visibility: {
              type: 'string',
              enum: ['full_body', 'partial_body', 'head_only', 'not_visible'],
            },
            duplicated: { type: 'boolean' },
            duplicateCount: { type: 'integer', minimum: 0, maximum: 10 },
            duplicateNotes: { type: ['string', 'null'] },
            notes: { type: ['string', 'null'] },
          },
        },
      },
      hasUnexpectedCharacters: { type: 'boolean' },
      unexpectedCharacterNotes: { type: ['string', 'null'] },
      hasTextOrLetters: { type: 'boolean' },
      hasRenderingArtifacts: { type: 'boolean' },
      hasSceneCompositionMismatch: { type: 'boolean' },
      overallFeedback: { type: 'string' },
      hasArtworkOutsidePanelBounds: includeLayoutChecks
        ? { type: 'boolean' }
        : { type: ['boolean', 'null'] },
      hasArtworkOverSpeechBubbles: includeBubbleChecks
        ? { type: 'boolean' }
        : { type: ['boolean', 'null'] },
      hasExtraPanelStructure: includeLayoutChecks
        ? { type: 'boolean' }
        : { type: ['boolean', 'null'] },
      layoutFeedback: includeLayoutChecks ? { type: 'string' } : { type: ['string', 'null'] },
    },
  };
}

function buildGraphicNovelPanelValidationSchema(): JsonSchema {
  const unexpectedNamedCharacterSchema: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'characterKind', 'recognizableScore', 'identityComparisonSummary', 'issue'],
    properties: {
      name: { type: 'string' },
      characterKind: { type: 'string', enum: ['human', 'animal', 'imaginary'] },
      recognizableScore: { type: 'number', minimum: 0, maximum: 1 },
      identityComparisonSummary: { type: 'string' },
      issue: { type: 'string' },
    },
  };

  const panelCharacterSchema: JsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
      'name',
      'characterKind',
      'expectedPresent',
      'found',
      'recognizableScore',
      'faceMatchesReference',
      'hairMatchesReference',
      'ageReadMatchesReference',
      'proportionsMatchReference',
      'matchesColors',
      'matchesOutfit',
      'actualVisibleDescription',
      'sameOverallDesignRead',
      'silhouetteDriftSeverity',
      'identityComparisonSummary',
      'issue',
    ],
    properties: {
      name: { type: 'string' },
      characterKind: { type: 'string', enum: ['human', 'animal', 'imaginary'] },
      expectedPresent: { type: 'boolean' },
      found: { type: 'boolean' },
      recognizableScore: { type: 'number', minimum: 0, maximum: 1 },
      faceMatchesReference: { type: ['boolean', 'null'] },
      hairMatchesReference: {
        type: ['boolean', 'null'],
        description:
          'HUMAN only. Broad hair color is insufficient; compare visible braid/ponytail/bun count, placement, anchor point, loose-vs-braided structure, length/silhouette, and accent-color placement.',
      },
      ageReadMatchesReference: { type: ['boolean', 'null'] },
      proportionsMatchReference: { type: ['boolean', 'null'] },
      matchesColors: { type: 'boolean' },
      matchesOutfit: { type: 'boolean' },
      actualVisibleDescription: {
        type: ['string', 'null'],
        description:
          'Short concrete noun phrase describing the visible substitute/candidate currently in Image 1, not the problem. Example: "small green person with a blue flower". Do not write missing/differs/should-change text.',
      },
      sameOverallDesignRead: { type: ['boolean', 'null'] },
      silhouetteDriftSeverity: {
        type: ['string', 'null'],
        enum: ['none', 'mild', 'moderate', 'severe', null],
      },
      identityComparisonSummary: { type: 'string' },
      issue: { type: ['string', 'null'] },
    },
  };

  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'pageNumber',
      'expectedPanelCount',
      'detectedPanelCount',
      'hasExtraPanelStructure',
      'hasTextOrLetters',
      'hasRenderingArtifacts',
      'layoutFeedback',
      'panels',
      'overallFeedback',
    ],
    properties: {
      pageNumber: { type: 'integer' },
      expectedPanelCount: { type: 'integer' },
      detectedPanelCount: { type: 'integer' },
      hasExtraPanelStructure: { type: 'boolean' },
      hasTextOrLetters: { type: 'boolean' },
      hasRenderingArtifacts: { type: 'boolean' },
      layoutFeedback: { type: 'string' },
      panels: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'panelNumber',
            'panelId',
            'panelDetected',
            'matchedVisiblePanelDescription',
            'visualMatchesExpectedMoment',
            'unexpectedCharactersPresent',
            'unexpectedNamedCharacters',
            'renderingArtifacts',
            'panelIssue',
            'characters',
          ],
          properties: {
            panelNumber: { type: 'integer' },
            panelId: { type: 'string' },
            panelDetected: { type: 'boolean' },
            matchedVisiblePanelDescription: { type: 'string' },
            visualMatchesExpectedMoment: { type: 'boolean' },
            unexpectedCharactersPresent: { type: 'boolean' },
            unexpectedNamedCharacters: {
              type: 'array',
              items: unexpectedNamedCharacterSchema,
            },
            renderingArtifacts: { type: 'boolean' },
            panelIssue: { type: ['string', 'null'] },
            characters: { type: 'array', items: panelCharacterSchema },
          },
        },
      },
      overallFeedback: { type: 'string' },
    },
  };
}

function buildGraphicNovelPanelValidationPrompt(params: {
  pageNumber: number;
  panels: GraphicNovelPanelValidationInput['panels'];
  pageCharacters: ProductImageValidationInput['expectedCharacters'];
  referenceImages: ProductImageValidationInput['referenceImages'] | undefined;
  includeWardrobeChecks?: boolean;
}): string {
  const includeWardrobeChecks = params.includeWardrobeChecks !== false;
  const pageCharactersForPrompt = buildExpectedCharactersForPrompt(
    params.pageCharacters,
    params.referenceImages,
    'compact',
    includeWardrobeChecks
  );
  const panelsForPrompt = params.panels.map((panel) => ({
    ...panel,
    expectedCharacters: buildExpectedCharactersForPrompt(
      panel.expectedCharacters,
      params.referenceImages,
      'compact',
      includeWardrobeChecks
    ),
  }));

  const formatCharacterPromptRow = (
    character: ProductImageValidationInput['expectedCharacters'][number],
    options?: { includeWardrobeCheck?: boolean }
  ): string => {
    const characterSubtype = optionalTrimmedString(character.speciesSubtype);
    const characterDescription = optionalTrimmedString(character.description);
    const subtype = characterSubtype ? `; subtype=${characterSubtype}` : '';
    const referenceIndex = findIdentityReferenceIndex(character.name, params.referenceImages);
    const reference = referenceIndex ? `; reference=Image ${referenceIndex}` : '';
    const desc = !referenceIndex && characterDescription
      ? `; description=${characterDescription}`
      : '';
    const wardrobeCheck =
      options?.includeWardrobeCheck !== true
        ? ''
        : !includeWardrobeChecks
          ? ''
          : character.validateOutfit === true
            ? '; wardrobe check=enabled'
            : '; wardrobe check=disabled';
    return `${character.name} (${character.characterKind}${subtype}${reference}${desc}${wardrobeCheck})`;
  };

  const referenceRows = (params.referenceImages || [])
    .map((ref, index) => {
      const role =
        includeWardrobeChecks && ref.identitySource === 'dressed_turnaround'
          ? 'dressed turnaround identity reference'
          : ref.identitySource === 'turnaround'
            ? 'turnaround identity reference'
            : 'identity reference';
      return `Image ${index + 2}: ${role} for "${ref.characterName}"`;
    })
    .join('\n');

  const pageCharacterRows =
    pageCharactersForPrompt.length > 0
      ? pageCharactersForPrompt
          .map((character) => `- ${formatCharacterPromptRow(character)}`)
          .join('\n')
      : '- none';

  const panelRows = panelsForPrompt
    .map((panel) => {
      const expectedNames = new Set(
        panel.expectedCharacters.map((character) =>
          stripCharacterIdFromName(character.name).trim().toLowerCase()
        )
      );
      const notExpectedCharacters = pageCharactersForPrompt.filter(
        (character) =>
          !expectedNames.has(stripCharacterIdFromName(character.name).trim().toLowerCase())
      );
      const characterRows =
        panel.expectedCharacters.length > 0
          ? panel.expectedCharacters
              .map((character) => {
                return `  - ${formatCharacterPromptRow(character, {
                  includeWardrobeCheck: true,
                })}`;
              })
              .join('\n')
          : '  - none';
      const notExpectedRows =
        notExpectedCharacters.length > 0
          ? notExpectedCharacters.map((character) => `  - ${character.name}`).join('\n')
          : '  - none';
      return [
        `Panel ${panel.panelNumber} [${panel.panelId}]`,
        `Expected visual focus: ${panel.expectedVisualFocus}`,
        panel.expectedSetting?.trim() ? `Expected setting: ${panel.expectedSetting.trim()}` : '',
        'Expected characters allowed in this panel:',
        characterRows,
        'Page roster characters that should NOT be visible in this panel:',
        notExpectedRows,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return [
    'Task: validate one generated graphic novel page panel-by-panel in a single response.',
    'Image 1 is the generated full comic page. The other images are full-character identity references.',
    '',
    'Panel matching rules:',
    '- Return exactly one panels[] item for each expected Panel N listed below, in the same order.',
    '- Match each expected panel to the best visible physical panel/region on Image 1 using expected visual focus, expected characters, and visual read, not only naive reading order.',
    '- If the artwork split one expected panel into multiple physical boxes or merged panels together, still return the expected panel item, set hasExtraPanelStructure=true, describe the split/merge in layoutFeedback and panelIssue, and evaluate characters from the best matching visible region.',
    '- Character found=true is panel-local: the character must be visible in that specific panel.',
    '- The same character appearing once in multiple different panels is normal and is not duplication.',
    '- The expected characters listed for a panel are the only named page-roster characters allowed in that panel.',
    '- If a page-roster character listed under "should NOT be visible" appears in that panel, add it to unexpectedNamedCharacters and set unexpectedCharactersPresent=true.',
    '',
    'Character validation rules:',
    '- For every expected character in a panel, answer whether that exact named character is visible in that panel and whether it matches the reference/expected design.',
    '- Use the same identity rules as the standard image validator: humans require face/head design, hairstyle, apparent character life-stage, proportions, silhouette, and stable marks; animals/imaginary creatures require body type, subtype/species read, silhouette, proportions, and stable colors/markings.',
    '- Human hair rule: broad color is not enough. Any visible braid/ponytail/bun count, placement, anchor-point, loose-vs-braided, silhouette, or accent-color drift means hairMatchesReference=false.',
    '- If the panel contains only a generic substitute or different stable design, set found=false or recognizableScore<=0.4, even if the role/slot is occupied.',
    '- If the character is present but details drift, keep found=true and mark the specific fields false.',
    '- For human face identity, mark faceMatchesReference=false only when the face/head is visible enough to compare and visibly differs. If the face/head is hidden, turned away, cropped out, or too occluded, set faceMatchesReference=null and mention that the face check was skipped; do not fail the face slot for non-visibility alone.',
    params.includeWardrobeChecks === false
      ? '- For each missing or wrong expected character, actualVisibleDescription must describe the visible substitute/candidate in that panel using concrete visual words. When found=true but any identity/design field is false, actualVisibleDescription must be non-null. Use null only when the expected character is correct or no substitute/candidate is visible. This phrase may be sent directly to image editing as the thing to replace, so describe what is currently visible, not what it should become.'
      : '- For each missing or wrong expected character, actualVisibleDescription must describe the visible substitute/candidate in that panel using concrete visual words. When found=true but any identity/outfit/design field is false, actualVisibleDescription must be non-null. Use null only when the expected character is correct or no substitute/candidate is visible. This phrase may be sent directly to image editing as the thing to replace, so describe what is currently visible, not what it should become.',
    '- For humans with identity reference, hairMatchesReference, ageReadMatchesReference, and proportionsMatchReference must be booleans; faceMatchesReference must be true/false only when the face/head is visible enough to compare, otherwise null.',
    '- For animals/imaginary creatures, set human-only face/hair/age fields to null; use sameOverallDesignRead, silhouetteDriftSeverity, and proportionsMatchReference.',
    params.includeWardrobeChecks === false
      ? '- Set matchesOutfit=true for every character; this panel validator checks character identity only.'
      : '- matchesOutfit validates clothing only for character rows marked wardrobe check=enabled. For wardrobe check=disabled rows, set matchesOutfit=true.',
    '- unexpectedNamedCharacters contains page-roster characters visible in a panel where they are not expected.',
    '',
    'Page-level rules:',
    '- detectedPanelCount is the number of visible physical comic panel boxes/regions.',
    '- hasExtraPanelStructure=true if visible physical panels do not match expectedPanelCount, or if there are fake gutters, inset panels, split panels, or merged story beats.',
    '- hasTextOrLetters=true for unwanted readable text/letters that are part of the generated artwork.',
    '- A reference-sheet title, label, filename, watermark, or identifier copied into Image 1 is always unwanted text. Explicitly scan for REF_* identifiers such as REF_CH_* and set hasTextOrLetters=true when any are visible.',
    '- Decorative non-linguistic glyphs, runes, sigils, or symbols explicitly required by the panel brief are visual motifs, not unwanted text. Still flag readable words, captions, labels, subtitles, and alphanumeric strings.',
    '- hasRenderingArtifacts=true for severe broken anatomy, corrupt objects, incoherent artifacts, or unusable rendering.',
    '',
    `PAGE NUMBER: ${params.pageNumber}`,
    `EXPECTED PANEL COUNT: ${params.panels.length}`,
    '',
    referenceRows ? `REFERENCE IMAGE ORDER:\n${referenceRows}` : 'REFERENCE IMAGE ORDER:\nNone',
    '',
    `PAGE CHARACTER ROSTER:\n${pageCharacterRows}`,
    '',
    `EXPECTED PANELS:\n${panelRows}`,
    '',
    'Return a JSON object only.',
  ].join('\n');
}

function buildSegmentedCharacterSceneBrief(
  characterName: string,
  sceneVisual: SceneVisual
): string | null {
  const cameraComposition = sceneVisual.cameraComposition;
  const characterSceneRow =
    typeof cameraComposition === 'string'
      ? null
      : (cameraComposition.characters.find((character) =>
          validationNamesMatch(character.name, characterName)
        ) ?? null);
  const action = optionalTrimmedString(characterSceneRow?.description);
  if (!action) return null;

  const lines = [
    'SCENE-SPECIFIC POSE/PROP CONTEXT:',
    `- expected action/staging: ${truncateText(action, 260)}`,
    '- This context is limited to pose, expression, occlusion, and held/carried props.',
  ];

  return lines.join('\n');
}

function buildSegmentedCharacterPrompt(params: {
  character: ProductImageValidationInput['expectedCharacters'][number];
  sceneVisual: SceneVisual;
  identityReference?: PreparedValidationReferenceImage;
  includeWardrobeChecks?: boolean;
}): string {
  return params.character.characterKind === 'human'
    ? buildSegmentedHumanCharacterPrompt(params)
    : buildSegmentedNonHumanCharacterPrompt(params);
}

function characterReferenceIntro(params: {
  identityReference?: PreparedValidationReferenceImage;
  includeWardrobeChecks: boolean;
}): string {
  if (!params.identityReference) {
    return 'No identity reference is attached; use only the expected character description and visible scene evidence.';
  }
  if (
    params.includeWardrobeChecks &&
    params.identityReference.identitySource === 'dressed_turnaround'
  ) {
    return 'Image 2 is this character dressed turnaround reference: identity and visible wardrobe ground truth. Held/carried props are replaceable scene props.';
  }
  if (params.includeWardrobeChecks) {
    return 'Image 2 is this character turnaround reference: whole-character visual identity ground truth. Held/carried props are replaceable scene props.';
  }
  return 'Image 2 is this character turnaround reference: visual identity ground truth.';
}

function characterWardrobeDecisionRule(params: {
  includeWardrobeChecks: boolean;
  validateOutfit: boolean;
  hasIdentityReference: boolean;
}): string {
  if (!params.includeWardrobeChecks) {
    return '4. Set matchesOutfit=true; this validation path checks character identity only.';
  }
  if (!params.validateOutfit) {
    return '4. Set matchesOutfit=true for this character.';
  }
  if (params.hasIdentityReference) {
    return '4. Finally evaluate outfit against Image 2 only. Set matchesOutfit=true if the character in Image 1 preserves the visible clothing, shoes, and worn accessories from Image 2. Held/carried props may differ when the panel scene supplies a scene-specific object.';
  }
  return '4. Set matchesOutfit=true because no visual wardrobe ground truth is attached for this character.';
}

function characterOutfitFieldRule(params: {
  includeWardrobeChecks: boolean;
  validateOutfit: boolean;
  hasIdentityReference: boolean;
}): string {
  if (!params.includeWardrobeChecks) {
    return '- matchesOutfit must be true for this identity-only validation path.';
  }
  if (!params.validateOutfit) {
    return '- matchesOutfit must be true for this character.';
  }
  if (params.hasIdentityReference) {
    return '- matchesOutfit is a wardrobe-only boolean: true means the visible clothing, shoes, and worn accessories match Image 2. Held/carried props may differ when the panel scene supplies a scene-specific object.';
  }
  return '- matchesOutfit must be true because no visual wardrobe reference is supplied for this character.';
}

function buildSegmentedHumanCharacterPrompt(params: {
  character: ProductImageValidationInput['expectedCharacters'][number];
  sceneVisual: SceneVisual;
  identityReference?: PreparedValidationReferenceImage;
  includeWardrobeChecks?: boolean;
}): string {
  const { character } = params;
  const includeWardrobeChecks = params.includeWardrobeChecks !== false;
  const validateOutfit = includeWardrobeChecks && character.validateOutfit === true;
  const hasIdentityReference = !!params.identityReference;
  const characterSubtype = optionalTrimmedString(character.speciesSubtype);
  const characterDescription = optionalTrimmedString(character.description);
  const hasDressedTurnaroundReference =
    includeWardrobeChecks && params.identityReference?.identitySource === 'dressed_turnaround';
  const wardrobeDecisionRule = characterWardrobeDecisionRule({
    includeWardrobeChecks,
    validateOutfit,
    hasIdentityReference,
  });
  const outfitFieldRule = characterOutfitFieldRule({
    includeWardrobeChecks,
    validateOutfit,
    hasIdentityReference,
  });
  const visualAnchorRule = params.identityReference
    ? hasDressedTurnaroundReference
      ? 'Before judging Image 1, derive a compact 3-8 item visual-anchor checklist from Image 2: face/head design, hairstyle, body proportions/silhouette, stable marks, clothing, shoes, and worn accessories. Held/carried props belong in this checklist only when the panel scene explicitly requires the same prop. sameOverallDesignRead is the verdict for whether Image 1 preserves this whole dressed-character read.'
      : includeWardrobeChecks
        ? 'Before judging Image 1, derive a compact 3-8 item visual-anchor checklist from Image 2: face/head design, eye/nose/mouth/cheek/jaw read, stable marks, hairstyle structure, hair color zones, apparent age read, body proportions/silhouette, clothing, shoes, and worn accessories. Held/carried props belong in this checklist only when the panel scene explicitly requires the same prop. sameOverallDesignRead is the verdict for whether Image 1 preserves those anchors.'
        : 'Before judging Image 1, derive a compact 3-8 item visual-anchor checklist from Image 2: face/head design, eye/nose/mouth/cheek/jaw read, stable marks, hairstyle structure, hair color zones, apparent age read, and body proportions/silhouette. sameOverallDesignRead is the verdict for whether Image 1 preserves those anchors.'
    : '';
  const sceneBrief = buildSegmentedCharacterSceneBrief(character.name, params.sceneVisual);
  const lines = [
    'Task: validate exactly ONE expected HUMAN character in Image 1.',
    'Image 1 is a crop from the generated scene/panel, centered on the candidate character found by the full-image QA pass.',
    characterReferenceIntro({ identityReference: params.identityReference, includeWardrobeChecks }),
    params.identityReference
      ? 'Use the expected name and KIND only as output labels. Compare Image 1 against Image 2 only.'
      : '',
    sceneBrief,
    'Validate this human only: face/head design, hairstyle, apparent age read, body proportions/silhouette, stable marks, and matchesOutfit as specified below.',
    'Do not decide duplicate copies in this crop pass; the full-image QA pass handles duplicate detection.',
    'Decision order:',
    '1. Inspect the cropped candidate in Image 1. Do not search outside this crop.',
    '2. If Image 2 exists, decide whether this cropped candidate is the same stable human design. Generic child/adult substitutes or different stable designs are not the named character.',
    visualAnchorRule,
    includeWardrobeChecks
      ? '3. Then compare human identity details: face/head design, eye/nose/mouth/cheek/jaw read, apparent character life-stage, hairstyle structure, hair color zoning, body proportions, silhouette, stable marks, and visible reference clothing/accessories.'
      : '3. Then compare human identity details: face/head design, eye/nose/mouth/cheek/jaw read, apparent character life-stage, hairstyle structure, hair color zoning, body proportions, silhouette, and stable marks.',
    'Human face visibility rule: set faceMatchesReference=false only when the face/head is visible enough to compare and visibly differs from Image 2. If the face/head is hidden, turned away, cropped out, or too occluded to compare, set faceMatchesReference=null, mention that the face check was skipped in identityComparisonSummary, and do not list hidden face as an issue by itself.',
    'Human hair rule: broad color is not enough. Any visible braid/ponytail/bun count, placement, anchor-point, loose-vs-braided, silhouette, or accent-color drift means hairMatchesReference=false.',
    'A skipped face check does not skip the whole identity check: still evaluate visible hairstyle, hair color zoning, silhouette, proportions, stable marks, outfit, and sameOverallDesignRead from observable evidence.',
    wardrobeDecisionRule,
    params.identityReference
      ? 'Scene prop handling: if Image 2 shows a default object held in hands/paws/mouth but the panel scene supplies a different held object, judge the hands/paws/mouth pose for plausibility.'
      : '',
    'If the same stable character design is absent, set found=false and recognizableScore <= 0.4 even if a similar role/slot is occupied.',
    includeWardrobeChecks
      ? 'If the same character is present but hair/outfit/details drift, keep found=true and mark the specific fields false.'
      : 'If the same character is present but identity details drift, keep found=true and mark the specific fields false.',
    'Return one JSON object for this character only.',
    '',
    `EXPECTED CHARACTER: "${character.name}"`,
    `KIND: ${character.characterKind}`,
    !hasIdentityReference && characterSubtype
      ? `SUBTYPE: ${characterSubtype}`
      : '',
    !hasIdentityReference && characterDescription
      ? `DESCRIPTION: ${characterDescription}`
      : '',
    '',
    'Output field rules:',
    '- name must equal the expected character name.',
    '- characterKind must equal "human".',
    '- found=true only when the cropped candidate is actually this expected character identity. If the crop shows a wrong substitute, set found=false and describe the substitute in actualVisibleDescription.',
    '- duplicated must be false in this crop pass; full-image QA supplies duplicate evidence.',
    '- hairMatchesReference, ageReadMatchesReference, proportionsMatchReference, and sameOverallDesignRead must be booleans when Image 2 exists; otherwise use null for reference-only fields.',
    '- faceMatchesReference must be true/false only when the face/head is visible enough to compare, otherwise null.',
    '- sameOverallDesignRead is true only when the reference visual-anchor checklist and first-glance whole-character read are preserved; use null when no identity reference exists.',
    outfitFieldRule,
    '- actualVisibleDescription must describe what is actually visible instead when this expected character is missing or replaced by a wrong design. Be concrete and visual, e.g. "different blond child", "spotted chicken-like creature with a beak", "small green mushroom creature". When found=true but any identity/design field is false, actualVisibleDescription must be non-null. Use null only when the expected character is clearly correct or no substitute/candidate is visible. This phrase may be sent directly to image editing as the thing to replace, so describe what is currently visible, not what it should become.',
    '- issue should be null when there is no concrete problem; otherwise list concise observed problems. A hidden, turned-away, cropped, or occluded face is not a problem by itself.',
    '- identityComparisonSummary must separately say what reference anchors match, what anchors differ, whether face/head was matched, mismatched, or skipped for non-visibility, and whether the first-glance design read drifted.',
  ];

  return lines.filter(Boolean).join('\n');
}

function buildSegmentedNonHumanCharacterPrompt(params: {
  character: ProductImageValidationInput['expectedCharacters'][number];
  sceneVisual: SceneVisual;
  identityReference?: PreparedValidationReferenceImage;
  includeWardrobeChecks?: boolean;
}): string {
  const { character } = params;
  const includeWardrobeChecks = params.includeWardrobeChecks !== false;
  const validateOutfit = includeWardrobeChecks && character.validateOutfit === true;
  const hasIdentityReference = !!params.identityReference;
  const characterSubtype = optionalTrimmedString(character.speciesSubtype);
  const characterDescription = optionalTrimmedString(character.description);
  const targetKindLabel = character.characterKind === 'animal' ? 'ANIMAL' : 'IMAGINARY CREATURE';
  const wardrobeDecisionRule = characterWardrobeDecisionRule({
    includeWardrobeChecks,
    validateOutfit,
    hasIdentityReference,
  });
  const outfitFieldRule = characterOutfitFieldRule({
    includeWardrobeChecks,
    validateOutfit,
    hasIdentityReference,
  });
  const visualAnchorRule = params.identityReference
    ? includeWardrobeChecks
      ? 'Before judging Image 1, derive a compact 3-8 item visual-anchor checklist from Image 2: species/subtype read, body type/mass, head/muzzle/beak shape, ears/horns/crest/wings/tail/appendages, proportions, silhouette, stable markings, persistent colors, and visible clothing/accessories if any. Held/carried props belong in this checklist only when the panel scene explicitly requires the same prop. sameOverallDesignRead is the verdict for whether Image 1 preserves those anchors.'
      : 'Before judging Image 1, derive a compact 3-8 item visual-anchor checklist from Image 2: species/subtype read, body type/mass, head/muzzle/beak shape, ears/horns/crest/wings/tail/appendages, proportions, silhouette, stable markings, and persistent colors. sameOverallDesignRead is the verdict for whether Image 1 preserves those anchors.'
    : '';
  const sceneBrief = buildSegmentedCharacterSceneBrief(character.name, params.sceneVisual);
  const subtypeRule =
    character.characterKind === 'imaginary'
      ? 'For imaginary creatures, subtype read is decisive: a dog-like fairy, cloud whale, moss creature, chicken-like monster, or robot creature must not be reinterpreted as another creature class.'
      : 'For animals, species/breed/body-form read is decisive: the image must preserve the expected animal type, body form, and stable markings.';
  const visibleAnchorScoringRule = [
    'Visible-anchor scoring:',
    '- First judge only anchors that are visible in Image 1. Hidden body parts are unobservable, not matched.',
    '- Biological/design anchors outrank accessories: species/subtype read, body type/mass, head/muzzle/beak shape, limb count/shape, ears/horns/crest/wings/tail, silhouette, fur/skin color zones, and stable markings matter more than hats, bows, wings, props, or clothing.',
    '- Matching accessories/props can support identity only after the biological/design anchors match; matching hat/wing/prop alone never proves identity.',
    '- If any visible biological/design anchor clearly contradicts Image 2, set sameOverallDesignRead=false and cap recognizableScore at 0.6.',
    '- If the visible candidate mainly matches accessories/props while species/body/fur/markings differ or are unclear, cap recognizableScore at 0.55.',
    '- If only a head, wing, hat, or other small partial crop is visible, do not score above 0.7 unless the visible species/subtype and stable markings are unmistakably the same.',
  ].join('\n');

  const lines = [
    `Task: validate exactly ONE expected ${targetKindLabel} character in Image 1.`,
    'Image 1 is a crop from the generated scene/panel, centered on the candidate character found by the full-image QA pass.',
    characterReferenceIntro({ identityReference: params.identityReference, includeWardrobeChecks }),
    params.identityReference
      ? 'Use the expected name and KIND only as output labels. Compare Image 1 against Image 2 only.'
      : '',
    sceneBrief,
    `Validate this ${targetKindLabel.toLowerCase()} only: species/subtype read, body type/mass, head shape, appendages, proportions, silhouette, stable markings/colors, and matchesOutfit as specified below.`,
    'Do not decide duplicate copies in this crop pass; the full-image QA pass handles duplicate detection.',
    'Decision order:',
    '1. Inspect the cropped candidate in Image 1. Do not search outside this crop.',
    '2. If Image 2 exists, decide whether this cropped candidate is the same stable creature/animal design. Generic substitutes or different stable designs are not the named character.',
    visualAnchorRule,
    '3. Then compare identity details: body type/mass, species/subtype read, silhouette, proportions, head/muzzle/beak shape, ears/horns/crest/wings/tail/appendages, stable colors, stable markings, and visible reference accessories.',
    subtypeRule,
    visibleAnchorScoringRule,
    wardrobeDecisionRule,
    params.identityReference
      ? 'Scene prop handling: if Image 2 shows a default object held in paws/mouth/appendages but the panel scene supplies a different held object, judge only whether the pose/contact is plausible.'
      : '',
    'If the same stable character design is absent, set found=false and recognizableScore <= 0.4 even if a similar role/slot is occupied.',
    includeWardrobeChecks
      ? 'If the same character is present but body/subtype/markings/accessories/outfit details drift, keep found=true and mark the specific fields false.'
      : 'If the same character is present but body/subtype/markings/accessory details drift, keep found=true and mark the specific fields false.',
    'Return one JSON object for this character only.',
    '',
    `EXPECTED CHARACTER: "${character.name}"`,
    `KIND: ${character.characterKind}`,
    !hasIdentityReference && characterSubtype
      ? `SUBTYPE: ${characterSubtype}`
      : '',
    !hasIdentityReference && characterDescription
      ? `DESCRIPTION: ${characterDescription}`
      : '',
    '',
    'Output field rules:',
    '- name must equal the expected character name.',
    `- characterKind must equal "${character.characterKind}".`,
    '- found=true only when the cropped candidate is actually this expected character identity. If the crop shows a wrong substitute, set found=false and describe the substitute in actualVisibleDescription.',
    '- duplicated must be false in this crop pass; full-image QA supplies duplicate evidence.',
    '- Set faceMatchesReference=null, hairMatchesReference=null, and ageReadMatchesReference=null. These fields are not used for this character type.',
    '- proportionsMatchReference must be boolean when Image 2 exists; otherwise null.',
    '- sameOverallDesignRead is true only when the reference visual-anchor checklist and first-glance whole-character read are preserved; use null when no identity reference exists.',
    '- silhouetteDriftSeverity must be "none", "mild", "moderate", or "severe" when Image 2 exists; use null when no identity reference exists.',
    outfitFieldRule,
    '- actualVisibleDescription must describe what is actually visible instead when this expected character is missing or replaced by a wrong design. Be concrete and visual, e.g. "spotted chicken-like creature with a beak", "small green mushroom creature", "different dog-like fairy with rainbow wings". When found=true but any identity/design field is false, actualVisibleDescription must be non-null. Use null only when the expected character is clearly correct or no substitute/candidate is visible. This phrase may be sent directly to image editing as the thing to replace, so describe what is currently visible, not what it should become.',
    '- issue should be null when there is no concrete problem; otherwise list concise observed problems.',
    '- identityComparisonSummary must separately say what reference anchors match, what anchors differ, and whether the first-glance species/subtype/body design read drifted.',
  ];

  return lines.filter(Boolean).join('\n');
}

function buildSegmentedSceneQaPrompt(params: {
  sceneVisual: SceneVisual;
  expectedCharacters: ProductImageValidationInput['expectedCharacters'];
  referenceImages?: PreparedValidationReferenceImage[];
  includeLayoutChecks: boolean;
  includeBubbleChecks: boolean;
  includeWardrobeChecks?: boolean;
}): string {
  const visual = params.sceneVisual;
  const cameraComposition = visual.cameraComposition;
  const shot = typeof cameraComposition === 'string' ? cameraComposition : cameraComposition.shot;
  const roster =
    params.expectedCharacters.length > 0
      ? params.expectedCharacters
          .map((character) => {
            const referenceIndex = findIdentityReferenceIndex(
              character.name,
              params.referenceImages
            );
            const characterSubtype = optionalTrimmedString(character.speciesSubtype);
            const characterDescription = optionalTrimmedString(character.description);
            const subtype = characterSubtype ? `; subtype=${characterSubtype}` : '';
            const reference = referenceIndex ? `; identity reference=Image ${referenceIndex}` : '';
            const desc = !referenceIndex && characterDescription
              ? `; description=${characterDescription}`
              : '';
            return `- ${character.name} (${character.characterKind}${subtype}${reference}${desc})`;
          })
          .join('\n')
      : 'None';
  const referenceRows = (params.referenceImages || [])
    .map((ref, index) => {
      const role =
        ref.identitySource === 'dressed_turnaround'
          ? 'dressed turnaround identity reference'
          : ref.identitySource === 'turnaround'
            ? 'turnaround identity reference'
            : 'identity reference';
      return `Image ${index + 2}: ${role} for "${ref.characterName}"`;
    })
    .join('\n');
  const cameraCharacterRows =
    typeof cameraComposition === 'string'
      ? []
      : params.expectedCharacters
          .map((character) => {
            const cameraRow = cameraComposition.characters.find((candidate) =>
              validationNamesMatch(candidate.name, character.name)
            );
            const description = optionalTrimmedString(cameraRow?.description);
            return description
              ? `- ${character.name}: ${truncateText(description, 220)}`
              : undefined;
          })
          .filter((line): line is string => !!line);
  return [
    'Task: validate expected cast and global image quality for Image 1 only.',
    'After this pass, separate per-character validators compare each expected character crop against its own turnaround reference.',
    params.referenceImages?.length
      ? 'Use attached identity reference images only to assign characterBoundingBoxes to the correct expected roster name. Do not score identity in this pass; the crop validators do that next.'
      : '',
    params.referenceImages?.length
      ? 'If action, prop, position, or story role conflicts with the reference identity, trust the stable visual identity from the reference image for bbox naming. Do not label a dog-like fairy as a chicken-like creature just because it occupies the other character role, and do not label a chicken-like creature as a dog-like fairy because it holds the expected prop.'
      : '',
    '',
    `EXPECTED CHARACTER ROSTER:\n${roster}`,
    referenceRows ? `\nIDENTITY REFERENCES FOR BBOX LABELING:\n${referenceRows}` : '',
    cameraCharacterRows.length > 0
      ? `\nEXPECTED CHARACTER STAGING HINTS:\n${cameraCharacterRows.join('\n')}`
      : '',
    '',
    'Set missingExpectedCharacters to the expected roster names that are not visibly present in Image 1. Use an empty array when all expected characters are visibly present.',
    'Return characterBoundingBoxes for every expected roster character, in the same coordinate system for Image 1.',
    'Use normalized integer coordinates 0..1000: xMin,yMin,xMax,yMax. These are fractions of the whole Image 1 width/height, not pixels.',
    'For each expected roster character, scan the whole Image 1 for ALL visible copies or candidate subjects for that roster slot before choosing the bbox.',
    'found=true in characterBoundingBoxes means there is a visible subject/crop candidate to validate for that roster character. It is not the final identity score; the crop validator checks that next.',
    'If no visible subject or plausible role candidate exists for that roster character, set found=false, visibility=not_visible, confidence=0, coordinates to 0, and include the name in missingExpectedCharacters.',
    'Return the bbox for the clearest/primary visible copy, but set duplicated=true and duplicateCount to the number of visible copies when the same expected character appears more than once.',
    'A duplicate copy can be full-body, partial, tiny, or in a different image region. Do not ignore it because the primary bbox is already found.',
    'Do not count reflections, portraits, signs, toys, or printed pictures as duplicates; mention any real duplicate locations in duplicateNotes.',
    'For each visible character, box only the visible character artwork/body. Exclude printed labels, captions, names, reference IDs, speech bubbles, and bottom text.',
    'The box must stay inside 0..1000 with xMax > xMin and yMax > yMin. If the character is not visible, set found=false, visibility=not_visible, confidence=0, and all coordinates to 0.',
    'Set visibility to full_body, partial_body, head_only, or not_visible based on the visible character artwork inside the bbox.',
    'Set hasUnexpectedCharacters=true when an extra named or character-like subject appears outside the expected roster.',
    'Set unexpectedCharacterNotes to a concise visual description of extra character-like subjects, or null when none are visible.',
    'Set hasTextOrLetters=true for unwanted visible text/letters inside the artwork.',
    'Explicitly scan the entire Image 1, including top/bottom margins and corners, for leaked reference-sheet titles, labels, filenames, watermarks, or identifiers. Any visible REF_* token such as REF_CH_* requires hasTextOrLetters=true.',
    'Decorative non-linguistic glyphs, runes, sigils, or symbols explicitly required by the PAGE BRIEF are visual motifs, not unwanted text. Still flag readable words, captions, labels, subtitles, and alphanumeric strings.',
    'Set hasRenderingArtifacts=true for broken anatomy, malformed objects, corrupted rendering, or severe incoherent artifacts.',
    'Set hasSceneCompositionMismatch=true only when Image 1 changes a clearly specified, countable scene anchor in PAGE BRIEF or COMPOSITION: for example it adds, duplicates, or omits a window, door, portal, mirror, framed opening, sky view, or celestial subject. When the brief says "the window" or "the Moon" in singular, preserve exactly one unless plural/repetition is explicit. Do not treat multiple views printed on an identity turnaround sheet as multiple scene subjects. Do not flag incidental background details that the brief did not make a constraint.',
    params.includeLayoutChecks ? 'Also validate layout/panel structure using the rules below.' : '',
    params.includeLayoutChecks
      ? 'No preset layout guide is attached; use only the page brief below and the visible generated page structure.'
      : '',
    params.includeLayoutChecks
      ? 'Set hasExtraPanelStructure=true for missing panels, extra panels, merged/split planned panels, fake dividers, inset panels, or one planned panel split into multiple story beats.'
      : '',
    params.includeLayoutChecks
      ? 'Set hasArtworkOutsidePanelBounds=true when artwork spills into gutters/margins or crosses intended panel boxes.'
      : '',
    params.includeLayoutChecks
      ? params.includeBubbleChecks
        ? 'Set hasArtworkOverSpeechBubbles=true when art covers, touches confusingly, or reduces readability of speech/thought/caption bubbles, bubble tails, outlines, or bubble text.'
        : 'This is an art-only page before server-rendered bubbles; set hasArtworkOverSpeechBubbles=false unless a real rendered text bubble is already present and visibly covered.'
      : '',
    '',
    `PAGE BRIEF: ${visual.setting}`,
    `LIGHTING: ${visual.lighting}`,
    `COMPOSITION: ${shot}`,
    'Return JSON only.',
  ]
    .filter(Boolean)
    .join('\n');
}

function imageDataForGenerated(
  preparedGeneratedImage: PreparedValidationImage,
  instructionText: string
): ImageData {
  return {
    mimeType: preparedGeneratedImage.mimeType,
    data: preparedGeneratedImage.buffer.toString('base64'),
    instructionText,
  };
}

function imageDataForReference(
  ref: PreparedValidationReferenceImage,
  imageIndex: number
): ImageData {
  return {
    mimeType: normalizeVisionMimeType(ref.mimeType),
    data: ref.imageData || '',
    fileUri: ref.fileUri,
    instructionText: buildValidationImageInstruction({
      imageIndex,
      characterName: ref.characterName,
      referenceKind: ref.referenceKind ?? 'identity',
      identitySource: ref.identitySource,
    }),
  };
}

type CharacterCropForValidation = {
  imageData: ImageData;
  cropRect: { left: number; top: number; width: number; height: number };
  normalizedBox: SegmentedCharacterBoundingBox;
};

function findCharacterBoundingBox(
  characterName: string,
  boxes: SegmentedCharacterBoundingBox[] | undefined
): SegmentedCharacterBoundingBox | undefined {
  return boxes?.find((box) => validationNamesMatch(box.name, characterName));
}

function normalizedCharacterBoxToPixelCrop(
  box: SegmentedCharacterBoundingBox,
  image: Pick<PreparedValidationImage, 'width' | 'height'>
): { left: number; top: number; width: number; height: number } | null {
  const imageWidth = image.width;
  const imageHeight = image.height;
  if (!imageWidth || !imageHeight) return null;
  if (!box.found || box.visibility === 'not_visible') return null;
  const values = [box.xMin, box.yMin, box.xMax, box.yMax];
  if (!values.every((value) => Number.isFinite(value))) return null;

  const xMin = clampNumber(Math.round(box.xMin), 0, 1000);
  const yMin = clampNumber(Math.round(box.yMin), 0, 1000);
  const xMax = clampNumber(Math.round(box.xMax), 0, 1000);
  const yMax = clampNumber(Math.round(box.yMax), 0, 1000);
  if (xMax <= xMin || yMax <= yMin) return null;

  const left = clampNumber(Math.floor((xMin / 1000) * imageWidth), 0, Math.max(0, imageWidth - 1));
  const top = clampNumber(Math.floor((yMin / 1000) * imageHeight), 0, Math.max(0, imageHeight - 1));
  const right = clampNumber(Math.ceil((xMax / 1000) * imageWidth), left + 1, imageWidth);
  const bottom = clampNumber(Math.ceil((yMax / 1000) * imageHeight), top + 1, imageHeight);
  const width = right - left;
  const height = bottom - top;
  const minUsableSide = Math.min(imageWidth, imageHeight) < 16 ? 1 : 8;
  if (width < minUsableSide || height < minUsableSide) return null;

  return { left, top, width, height };
}

function characterBoundingBoxForResult(
  box: SegmentedCharacterBoundingBox | undefined
): CharacterValidationLocalization['characterBoundingBox'] {
  if (!box) return null;
  return {
    found: box.found,
    xMin: box.xMin,
    yMin: box.yMin,
    xMax: box.xMax,
    yMax: box.yMax,
    confidence: box.confidence,
    visibility: box.visibility,
    duplicated: box.duplicated ?? false,
    duplicateCount: Number.isFinite(box.duplicateCount) ? box.duplicateCount : box.found ? 1 : 0,
    duplicateNotes: box.duplicateNotes ?? null,
    notes: box.notes ?? null,
  };
}

function characterCropRectForResult(
  cropRect: { left: number; top: number; width: number; height: number } | null | undefined
): CharacterValidationLocalization['characterCropRect'] {
  if (!cropRect) return null;
  return {
    left: cropRect.left,
    top: cropRect.top,
    width: cropRect.width,
    height: cropRect.height,
  };
}

function withCharacterValidationLocalization(
  character: ImageValidationResult['characters'][number],
  localization: CharacterValidationLocalization
): ImageValidationResult['characters'][number] {
  return {
    ...character,
    characterBoundingBox: localization.characterBoundingBox,
    characterCropRect: localization.characterCropRect,
  };
}

function hasSceneQaDuplicateEvidence(box: SegmentedCharacterBoundingBox | undefined): boolean {
  if (!box?.found) return false;
  if (box.duplicated === true) return true;
  return Number.isFinite(box.duplicateCount) && (box.duplicateCount ?? 0) > 1;
}

function expectedCharacterInstanceCount(
  character: ImageValidationResult['characters'][number],
  box: SegmentedCharacterBoundingBox | undefined
): number {
  if (!character.found) return 0;
  if (!hasSceneQaDuplicateEvidence(box)) return 1;
  return clampNumber(Math.round(box?.duplicateCount ?? 2), 2, 10);
}

function withSceneQaDuplicateEvidence(
  character: ImageValidationResult['characters'][number],
  box: SegmentedCharacterBoundingBox | undefined
): ImageValidationResult['characters'][number] {
  if (!hasSceneQaDuplicateEvidence(box)) return character;
  const duplicateCount = clampNumber(Math.round(box?.duplicateCount ?? 2), 2, 10);
  const duplicateNotes = box?.duplicateNotes?.trim() || box?.notes?.trim() || null;
  const duplicateIssue = duplicateNotes
    ? `Duplicate visible copies detected (${duplicateCount}): ${duplicateNotes}`
    : `Duplicate visible copies detected (${duplicateCount}).`;
  return {
    ...character,
    duplicated: true,
    issue: character.issue?.trim()
      ? `${character.issue.trim()}; ${duplicateIssue}`
      : duplicateIssue,
  };
}

async function extractCharacterCropForValidation(params: {
  preparedGeneratedImage: PreparedValidationImage;
  characterName: string;
  normalizedBox: SegmentedCharacterBoundingBox;
}): Promise<CharacterCropForValidation | null> {
  const cropRect = normalizedCharacterBoxToPixelCrop(
    params.normalizedBox,
    params.preparedGeneratedImage
  );
  if (!cropRect) return null;

  const buffer = await sharp(params.preparedGeneratedImage.buffer)
    .extract(cropRect)
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    imageData: {
      mimeType: 'image/png',
      data: buffer.toString('base64'),
      instructionText: `Image 1: GENERATED CHARACTER CROP for "${params.characterName}". Validate only this crop against the reference. The full scene was used only to locate this crop.`,
    },
    cropRect,
    normalizedBox: params.normalizedBox,
  };
}

function buildValidationInputParts(imageData: ImageData[], prompt: string): MultimodalInputPart[] {
  const parts: MultimodalInputPart[] = [];
  for (const image of imageData) {
    if (image.instructionText?.trim()) {
      parts.push({ type: 'text', text: image.instructionText.trim() });
    }
    parts.push({
      type: 'image',
      mimeType: image.mimeType,
      ...(image.fileUri ? { fileUri: image.fileUri } : { data: image.data }),
    });
  }
  parts.push({ type: 'text', text: prompt });
  return parts;
}

function summarizeValidationInputParts(
  parts: MultimodalInputPart[]
): Array<Record<string, unknown>> {
  return parts.map((part, index) => {
    if (part.type === 'text') {
      return {
        index: index + 1,
        type: 'text',
        text: part.text,
        chars: part.text.length,
      };
    }
    return {
      index: index + 1,
      type: 'image',
      mimeType: part.mimeType,
      delivery: part.fileUri ? 'file_uri' : 'inline_base64',
      ...(part.fileUri ? { fileUri: part.fileUri } : { inlineBase64Chars: part.data?.length ?? 0 }),
    };
  });
}

function findReferenceForCharacter(
  characterName: string,
  refs: PreparedValidationReferenceImage[] | undefined,
  referenceKind: ImageValidationReferenceKind
): PreparedValidationReferenceImage | undefined {
  return refs?.find(
    (ref) =>
      (ref.referenceKind ?? 'identity') === referenceKind &&
      validationNamesMatch(ref.characterName, characterName)
  );
}

function validationReferenceImageOrderRole(
  ref: Pick<PreparedValidationReferenceImage, 'referenceKind' | 'identitySource'>
): string {
  if (ref.identitySource === 'turnaround') return 'identity_turnaround';
  if (ref.identitySource === 'dressed_turnaround') return 'dressed_turnaround';
  return ref.referenceKind ?? 'identity';
}

function compactSegmentedCharacterResult(
  raw: SegmentedCharacterValidationResult,
  expectedCharacter: ProductImageValidationInput['expectedCharacters'][number],
  references: ProductImageValidationInput['referenceImages']
): ImageValidationResult['characters'][0] {
  const character = {
    ...raw.character,
    name: expectedCharacter.name,
    characterKind: expectedCharacter.characterKind,
    duplicated: false,
    issue: raw.character.issue ?? undefined,
  };
  if (character.sameOverallDesignRead == null) {
    delete character.sameOverallDesignRead;
  }
  if (character.silhouetteDriftSeverity == null) {
    delete character.silhouetteDriftSeverity;
  }
  const normalized = normalizeImageValidationResult(
    {
      characterCount: character.found ? 1 : 0,
      expectedCharacterCount: 1,
      characters: [character],
      hasUnexpectedCharacters: false,
      hasTextOrLetters: false,
      hasRenderingArtifacts: false,
      overallFeedback: raw.notes || character.identityComparisonSummary,
    },
    [expectedCharacter],
    references
  );
  return normalized.characters[0];
}

function normalizeGraphicNovelPanelOutfitVerdicts(
  result: GraphicNovelPanelImageValidationResult,
  panels: GraphicNovelPanelValidationInput['panels']
): void {
  for (const panel of result.panels) {
    const expectedPanel = panels.find(
      (candidate) =>
        candidate.panelId === panel.panelId || candidate.panelNumber === panel.panelNumber
    );
    for (const character of panel.characters) {
      const expected = expectedPanel
        ? findExpectedForValidationChar(character.name, expectedPanel.expectedCharacters)
        : undefined;
      if (expected?.validateOutfit !== true) {
        character.matchesOutfit = true;
      }
    }
  }
}

function buildSinglePanelSceneVisual(
  panel: GraphicNovelPanelValidationInput['panels'][number]
): SceneVisual {
  return {
    setting: panel.expectedSetting?.trim() || panel.expectedVisualFocus,
    lighting: 'N/A',
    cameraComposition: {
      shot: panel.expectedVisualFocus,
      characters: panel.expectedCharacters.map((character) => ({
        name: character.name,
        description: `${character.name} should be visible in this panel as an expected story character.`,
      })),
    },
  };
}

function panelIssueFromSegmentedValidation(validation: ImageValidationResult): string | null {
  const issues: string[] = [];
  if (validation.validationStatus === 'provider_blocked') {
    issues.push(validation.providerError || 'provider_blocked_no_visual_verdict');
  }
  if (validation.hasUnexpectedCharacters) issues.push('unexpected characters present');
  if (validation.hasTextOrLetters) issues.push('unwanted text or letters visible');
  if (validation.hasRenderingArtifacts) issues.push('rendering artifacts visible');
  if (validation.hasSceneCompositionMismatch) issues.push('scene composition mismatch');
  for (const character of validation.characters) {
    if (
      !character.found ||
      character.duplicated ||
      character.recognizableScore < 0.5 ||
      character.matchesColors === false ||
      character.matchesOutfit === false ||
      character.faceMatchesReference === false ||
      character.hairMatchesReference === false ||
      character.ageReadMatchesReference === false ||
      character.proportionsMatchReference === false ||
      character.sameOverallDesignRead === false ||
      character.silhouetteDriftSeverity === 'moderate' ||
      character.silhouetteDriftSeverity === 'severe' ||
      character.issue
    ) {
      issues.push(`${character.name}: ${character.issue || character.identityComparisonSummary}`);
    }
  }
  return issues.length > 0 ? issues.join('; ') : null;
}

function adaptSegmentedValidationToSinglePanelResult(params: {
  input: GraphicNovelPanelValidationInput;
  panel: GraphicNovelPanelValidationInput['panels'][number];
  validation: ImageValidationResult;
}): GraphicNovelPanelImageValidationResult {
  const { input, panel, validation } = params;
  const panelIssue = panelIssueFromSegmentedValidation(validation);
  const requestManifest =
    validation.requestManifest && typeof validation.requestManifest === 'object'
      ? {
          ...validation.requestManifest,
          graphicNovelPanelAdapter: {
            mode: 'single_panel_segmented',
            pageNumber: input.pageNumber,
            panelNumber: panel.panelNumber,
            panelId: panel.panelId,
          },
        }
      : validation.requestManifest;

  return {
    validationStatus: validation.validationStatus ?? 'completed',
    validationAttemptKind: validation.validationAttemptKind,
    validationModelUsed: validation.validationModelUsed,
    providerError: validation.providerError,
    requestManifest,
    pageNumber: input.pageNumber,
    expectedPanelCount: 1,
    detectedPanelCount: validation.validationStatus === 'provider_blocked' ? 0 : 1,
    hasExtraPanelStructure: validation.hasExtraPanelStructure ?? false,
    hasTextOrLetters: validation.hasTextOrLetters,
    hasRenderingArtifacts: validation.hasRenderingArtifacts,
    layoutFeedback: validation.layoutFeedback ?? 'single panel segmented validation',
    panels: [
      {
        panelNumber: panel.panelNumber,
        panelId: panel.panelId,
        panelDetected: validation.validationStatus !== 'provider_blocked',
        matchedVisiblePanelDescription: validation.overallFeedback,
        visualMatchesExpectedMoment:
          validation.validationStatus !== 'provider_blocked' &&
          !validation.hasRenderingArtifacts &&
          validation.characterCount >= Math.min(1, panel.expectedCharacters.length),
        unexpectedCharactersPresent: validation.hasUnexpectedCharacters,
        unexpectedNamedCharacters: [],
        renderingArtifacts: validation.hasRenderingArtifacts,
        panelIssue,
        characters: validation.characters.map((character) => ({
          name: character.name,
          characterKind: character.characterKind,
          expectedPresent: true,
          found: character.found,
          recognizableScore: character.recognizableScore,
          faceMatchesReference: character.faceMatchesReference ?? null,
          hairMatchesReference: character.hairMatchesReference ?? null,
          ageReadMatchesReference: character.ageReadMatchesReference ?? null,
          proportionsMatchReference: character.proportionsMatchReference ?? null,
          matchesColors: character.matchesColors,
          matchesOutfit: character.matchesOutfit,
          actualVisibleDescription: character.actualVisibleDescription ?? null,
          sameOverallDesignRead: character.sameOverallDesignRead ?? null,
          silhouetteDriftSeverity: character.silhouetteDriftSeverity ?? null,
          identityComparisonSummary: character.identityComparisonSummary,
          characterBoundingBox: character.characterBoundingBox ?? null,
          characterCropRect: character.characterCropRect ?? null,
          issue: character.issue ?? null,
        })),
      },
    ],
    overallFeedback: validation.overallFeedback,
  };
}

async function runSegmentedStructuredPass<T>(params: {
  textProvider: ITextProvider;
  fallbackTextProvider?: ITextProvider;
  model?: string;
  fallbackModel?: string;
  passKind: SegmentedValidationPassKind;
  passId: string;
  prompt: string;
  schema: JsonSchema;
  imageData: ImageData[];
  input: ProductImageValidationInput;
  operation: string;
  manifestPasses: Array<Record<string, unknown>>;
  recordModeration?: boolean;
}): Promise<{
  result: T | null;
  providerBlocked: boolean;
  providerError?: string;
  modelUsed?: string;
  attemptKind?: string;
}> {
  const attempts: Array<{
    providerRole: ValidationProviderRole;
    provider: ITextProvider;
    model?: string;
  }> = [{ providerRole: 'primary', provider: params.textProvider, model: params.model }];
  if (params.fallbackTextProvider) {
    attempts.push({
      providerRole: 'fallback',
      provider: params.fallbackTextProvider,
      model: params.fallbackModel,
    });
  }

  let lastBlockedError = '';
  let lastBlockedAttemptKind = '';
  for (const attempt of attempts) {
    const attemptKind = `${params.passKind}_${params.passId}_${attempt.providerRole}`;
    const inputParts = buildValidationInputParts(params.imageData, params.prompt);
    const passManifest: Record<string, unknown> = {
      passKind: params.passKind,
      passId: params.passId,
      attemptKind,
      providerRole: attempt.providerRole,
      model: attempt.model,
      promptChars: params.prompt.length,
      attachmentCount: params.imageData.length,
      imageOrder: params.imageData.map((image, index) => ({
        imageIndex: index + 1,
        mimeType: image.mimeType,
        hasFileUri: !!image.fileUri,
        inlineBase64Chars: image.fileUri ? 0 : image.data.length,
        instructionText: image.instructionText,
      })),
      input: summarizeValidationInputParts(inputParts),
    };
    params.manifestPasses.push(passManifest);

    try {
      const startedAt = Date.now();
      const result = await attempt.provider.generateStructured<T>({
        model: attempt.model,
        systemInstruction: IMAGE_VALIDATION_SYSTEM_INSTRUCTION,
        prompt: params.prompt,
        inputParts,
        imageData: params.imageData,
        schema: params.schema,
        temperature: 0.1,
        relaxedSafety: true,
        onUsage: params.input.onUsage,
        operation:
          params.passKind === 'scene_qa'
            ? `${params.operation}_scene_qa`
            : params.passKind === 'comic_panel_page'
              ? `${params.operation}_comic_panels`
              : `${params.operation}_character_identity`,
      });
      passManifest.outcome = 'completed';
      passManifest.durationMs = Date.now() - startedAt;
      return {
        result,
        providerBlocked: false,
        modelUsed: attempt.model,
        attemptKind,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      passManifest.error = errorMsg;
      if (isProviderBlockedError(errorMsg)) {
        passManifest.outcome = 'provider_blocked';
        lastBlockedError = errorMsg;
        lastBlockedAttemptKind = attemptKind;
        if (params.recordModeration !== false) {
          void recordModerationDecision({
            storyId: params.input.logContext?.storyId,
            stage: 'generated_image_validation',
            source: 'image_validation_provider',
            subjectType: 'scene_image',
            subjectRefHash: hashModerationSubject(
              `${params.input.logContext?.storyId ?? 'story'}:${params.input.logContext?.sceneId ?? 'scene'}:${params.input.logContext?.attempt ?? 'attempt'}:${attemptKind}`
            ),
            decision: 'blocked',
            code: 'IMAGE_VALIDATION_PROVIDER_BLOCKED',
            category: 'provider_safety_filter',
            metadata: {
              sceneId: params.input.logContext?.sceneId,
              attempt: params.input.logContext?.attempt,
              validationAttemptKind: attemptKind,
              passKind: params.passKind,
              passId: params.passId,
            },
          });
        }
        logger.warn(
          { ...params.input.logContext, attemptKind, error: errorMsg },
          'Segmented image validation provider blocked request; trying fallback if available'
        );
        continue;
      }

      passManifest.outcome = 'failed';
      if (params.recordModeration !== false) {
        void recordModerationDecision({
          storyId: params.input.logContext?.storyId,
          stage: 'generated_image_validation',
          source: 'image_validation_provider',
          subjectType: 'scene_image',
          subjectRefHash: hashModerationSubject(
            `${params.input.logContext?.storyId ?? 'story'}:${params.input.logContext?.sceneId ?? 'scene'}:${params.input.logContext?.attempt ?? 'attempt'}:${attemptKind}`
          ),
          decision: 'failed',
          code: 'IMAGE_VALIDATION_FAILED',
          metadata: {
            sceneId: params.input.logContext?.sceneId,
            attempt: params.input.logContext?.attempt,
            validationAttemptKind: attemptKind,
            passKind: params.passKind,
            passId: params.passId,
            errorName: error instanceof Error ? error.name : typeof error,
          },
        });
      }
      logger.error(
        {
          ...params.input.logContext,
          attemptKind,
          err:
            error instanceof Error
              ? { message: error.message, name: error.name, stack: error.stack }
              : String(error),
        },
        'Segmented image validation failed'
      );
      throw new Error(`Segmented image validation failed: ${errorMsg}`);
    }
  }

  return {
    result: null,
    providerBlocked: true,
    providerError: lastBlockedError || 'All segmented validation provider attempts were blocked',
    attemptKind: lastBlockedAttemptKind || `${params.passKind}_${params.passId}_all_blocked`,
  };
}

function buildProviderBlockedCharacterResult(
  character: ProductImageValidationInput['expectedCharacters'][number],
  error: string | undefined
): ImageValidationResult['characters'][0] {
  return {
    name: character.name,
    characterKind: character.characterKind,
    found: true,
    duplicated: false,
    recognizableScore: 1,
    faceMatchesReference: character.characterKind === 'human' ? null : null,
    hairMatchesReference: character.characterKind === 'human' ? null : null,
    ageReadMatchesReference: character.characterKind === 'human' ? null : null,
    proportionsMatchReference: null,
    matchesColors: true,
    matchesOutfit: true,
    actualVisibleDescription: null,
    identityComparisonSummary:
      'Provider blocked segmented character validation; no visual verdict.',
    issue: error
      ? `provider_blocked_no_visual_verdict: ${error}`
      : 'provider_blocked_no_visual_verdict',
  };
}

function buildCharacterCropUnavailableResult(
  character: ProductImageValidationInput['expectedCharacters'][number],
  reason: string
): ImageValidationResult['characters'][0] {
  return {
    name: character.name,
    characterKind: character.characterKind,
    found: false,
    duplicated: false,
    recognizableScore: 0,
    faceMatchesReference: null,
    hairMatchesReference: null,
    ageReadMatchesReference: null,
    proportionsMatchReference: null,
    matchesColors: false,
    matchesOutfit: true,
    actualVisibleDescription: null,
    identityComparisonSummary:
      'Character identity was not validated because the full-image QA pass did not return a usable character crop.',
    issue: `character_crop_unavailable: ${reason}`,
  };
}

export async function runSegmentedProductImageValidation(
  textProvider: ITextProvider,
  input: ProductImageValidationInput,
  options: ProductImageValidationOptions = {}
): Promise<ImageValidationResult> {
  const visionModel = options.visionModel;
  const operation = options.operation ?? 'image_validation_segmented';

  const preparedGeneratedImage = await prepareImageForValidation(
    input.imageData,
    input.mimeType,
    config.image.validationSceneMaxSide
  );

  const preparedReferenceImagesRaw =
    input.referenceImages && input.referenceImages.length > 0
      ? await Promise.all(
          input.referenceImages.map(async (ref) => {
            if (!ref.imageData) {
              return {
                ...ref,
                mimeType: normalizeVisionMimeType(ref.mimeType),
              } as PreparedValidationReferenceImage;
            }
            const prepared = await prepareImageForValidation(
              Buffer.from(ref.imageData, 'base64'),
              ref.mimeType,
              config.image.validationReferenceMaxSide
            );
            return {
              ...ref,
              imageData: prepared.buffer.toString('base64'),
              mimeType: prepared.mimeType,
            } as PreparedValidationReferenceImage;
          })
        )
      : undefined;

  const preparedReferenceImages =
    preparedReferenceImagesRaw?.filter((ref) => ref.referenceKind !== 'layout_template') ??
    undefined;
  const characterReferences =
    preparedReferenceImages?.filter((ref) => ref.referenceKind !== 'layout_template') ?? [];
  const manifestReferenceImages = input.expectedCharacters
    .map((character) => findReferenceForCharacter(character.name, characterReferences, 'identity'))
    .filter((ref): ref is PreparedValidationReferenceImage => !!ref)
    .filter((ref, index, refs) => refs.indexOf(ref) === index);
  const sceneQaReferenceImages = input.expectedCharacters.length > 1 ? manifestReferenceImages : [];
  const includeBubbleChecks = input.includeBubbleChecks !== false;
  const includeWardrobeChecks = input.includeWardrobeChecks !== false;
  const passesManifest: Array<Record<string, unknown>> = [];
  const imageOrder = [
    '1_generated_illustration',
    ...manifestReferenceImages.map(
      (r, i) => `${i + 2}_${validationReferenceImageOrderRole(r)}_${r.characterName}`
    ),
  ];
  const requestManifest: Record<string, unknown> = {
    version: 1,
    validationSystemInstruction: 'image_validation_segmented_v1',
    operation,
    mode: input.includeLayoutChecks
      ? 'segmented_parallel_scene_qa_layout_plus_character_identity'
      : 'segmented_parallel_scene_qa_plus_character_identity',
    includeLayoutChecks: input.includeLayoutChecks === true,
    includeBubbleChecks,
    includeWardrobeChecks,
    imageOrder,
    generatedImage: {
      role: 'generated_scene',
      mimeType: preparedGeneratedImage.mimeType,
      width: preparedGeneratedImage.width,
      height: preparedGeneratedImage.height,
      originalWidth: preparedGeneratedImage.originalWidth,
      originalHeight: preparedGeneratedImage.originalHeight,
      resized: preparedGeneratedImage.resized,
      sha256: sha256Short(preparedGeneratedImage.buffer),
    },
    references: manifestReferenceImages.map((r, i) => ({
      imageIndex: i + 2,
      characterName: r.characterName,
      referenceKind: r.referenceKind ?? 'identity',
      identitySource: r.identitySource,
      mimeType: r.mimeType,
      delivery: r.fileUri ? 'file_uri' : 'inline_base64',
      sha256: r.imageData ? sha256Short(Buffer.from(r.imageData, 'base64')) : undefined,
    })),
    sceneQaReferenceCount: sceneQaReferenceImages.length,
    characterCrops: [],
    passes: passesManifest,
  };

  logger.info(
    {
      ...input.logContext,
      mode: 'segmented_parallel',
      expectedCharacterCount: input.expectedCharacters.length,
      expectedRoster: input.expectedCharacters.map((c) => ({
        name: c.name,
        characterKind: c.characterKind,
        speciesSubtype: c.speciesSubtype,
        validateOutfit: includeWardrobeChecks && c.validateOutfit === true,
      })),
      generatedImage: {
        mimeType: preparedGeneratedImage.mimeType,
        sizeBytes: preparedGeneratedImage.buffer.length,
        originalSizeBytes: input.imageData.length,
        width: preparedGeneratedImage.width,
        height: preparedGeneratedImage.height,
        originalWidth: preparedGeneratedImage.originalWidth,
        originalHeight: preparedGeneratedImage.originalHeight,
        resized: preparedGeneratedImage.resized,
        role: 'image_1_generated_scene',
      },
      passCount: input.expectedCharacters.length + 1,
      referenceCount: manifestReferenceImages.length,
      imageOrderToModel: imageOrder,
    },
    input.includeLayoutChecks
      ? 'Segmented image validation: sending scene QA/layout and per-character passes to Vision model'
      : 'Segmented image validation: sending scene QA and per-character passes to Vision model'
  );

  const sceneQaPass = await runSegmentedStructuredPass<SegmentedSceneQaValidationResult>({
    textProvider,
    fallbackTextProvider: options.fallbackTextProvider,
    model: visionModel,
    fallbackModel: options.fallbackVisionModel,
    passKind: 'scene_qa',
    passId: 'global',
    prompt: buildSegmentedSceneQaPrompt({
      sceneVisual: input.sceneVisual,
      expectedCharacters: input.expectedCharacters,
      referenceImages: sceneQaReferenceImages,
      includeLayoutChecks: input.includeLayoutChecks === true,
      includeBubbleChecks,
      includeWardrobeChecks,
    }),
    schema: buildSegmentedSceneQaSchema(input.includeLayoutChecks === true, includeBubbleChecks),
    imageData: [
      imageDataForGenerated(
        preparedGeneratedImage,
        'Image 1: GENERATED SCENE/PANEL IMAGE. Validate expected cast and global quality only.'
      ),
      ...sceneQaReferenceImages.map((ref, index) => imageDataForReference(ref, index + 2)),
    ],
    input,
    operation,
    manifestPasses: passesManifest,
    recordModeration: options.recordModeration,
  });

  const sceneQa = sceneQaPass?.result;
  const sceneQaProviderBlocked = sceneQaPass?.providerBlocked === true;
  const characterBoxes = sceneQa?.characterBoundingBoxes || [];
  requestManifest.characterBoundingBoxes = characterBoxes;

  const characterCropManifest = requestManifest.characterCrops as Array<Record<string, unknown>>;

  const characterPromises = input.expectedCharacters.map(async (character) => {
    const identityReference = findReferenceForCharacter(
      character.name,
      characterReferences,
      'identity'
    );
    const characterBox = findCharacterBoundingBox(character.name, characterBoxes);
    if (sceneQaProviderBlocked) {
      return {
        character: withCharacterValidationLocalization(
          buildProviderBlockedCharacterResult(character, sceneQaPass?.providerError),
          {
            characterBoundingBox: characterBoundingBoxForResult(characterBox),
            characterCropRect: null,
          }
        ),
        pass: sceneQaPass,
      };
    }

    if (!characterBox) {
      const reason = 'missing_bbox_from_scene_qa';
      characterCropManifest.push({ characterName: character.name, status: 'missing_bbox' });
      return {
        character: withCharacterValidationLocalization(
          buildCharacterCropUnavailableResult(character, reason),
          {
            characterBoundingBox: null,
            characterCropRect: null,
          }
        ),
        pass: null,
      };
    }

    const characterCrop = await extractCharacterCropForValidation({
      preparedGeneratedImage,
      characterName: character.name,
      normalizedBox: characterBox,
    });

    if (!characterCrop) {
      const reason = characterBox.found
        ? 'invalid_bbox_from_scene_qa'
        : 'scene_qa_marked_not_visible';
      characterCropManifest.push({
        characterName: character.name,
        status: reason,
        normalizedBox: characterBox,
      });
      return {
        character: withCharacterValidationLocalization(
          buildCharacterCropUnavailableResult(character, reason),
          {
            characterBoundingBox: characterBoundingBoxForResult(characterBox),
            characterCropRect: null,
          }
        ),
        pass: null,
      };
    }

    characterCropManifest.push({
      characterName: character.name,
      status: 'cropped',
      normalizedBox: characterCrop.normalizedBox,
      cropRect: characterCrop.cropRect,
      cropMimeType: characterCrop.imageData.mimeType,
      inlineBase64Chars: characterCrop.imageData.data.length,
    });

    const imageData: ImageData[] = [characterCrop.imageData];
    if (identityReference)
      imageData.push(imageDataForReference(identityReference, imageData.length + 1));

    const pass = await runSegmentedStructuredPass<SegmentedCharacterValidationResult>({
      textProvider,
      fallbackTextProvider: options.fallbackTextProvider,
      model: visionModel,
      fallbackModel: options.fallbackVisionModel,
      passKind: 'character_identity',
      passId: character.name,
      prompt: buildSegmentedCharacterPrompt({
        character,
        sceneVisual: input.sceneVisual,
        identityReference,
        includeWardrobeChecks,
      }),
      schema: buildSegmentedCharacterSchema(),
      imageData,
      input,
      operation,
      manifestPasses: passesManifest,
      recordModeration: options.recordModeration,
    });

    if (!pass.result) {
      return {
        character: withCharacterValidationLocalization(
          buildProviderBlockedCharacterResult(character, pass.providerError),
          {
            characterBoundingBox: characterBoundingBoxForResult(characterBox),
            characterCropRect: characterCropRectForResult(characterCrop.cropRect),
          }
        ),
        pass,
      };
    }

    return {
      character: withCharacterValidationLocalization(
        compactSegmentedCharacterResult(
          pass.result,
          character,
          [identityReference].filter((ref): ref is PreparedValidationReferenceImage => !!ref)
        ),
        {
          characterBoundingBox: characterBoundingBoxForResult(characterBox),
          characterCropRect: characterCropRectForResult(characterCrop.cropRect),
        }
      ),
      pass,
      raw: pass.result,
    };
  });

  const characterPasses = await Promise.all(characterPromises);
  const characters = characterPasses.map((pass) =>
    withSceneQaDuplicateEvidence(
      pass.character,
      findCharacterBoundingBox(pass.character.name, characterBoxes)
    )
  );
  const sceneQaMissingExpectedCharacters = Array.isArray(sceneQa?.missingExpectedCharacters)
    ? sceneQa.missingExpectedCharacters.filter((name): name is string => typeof name === 'string')
    : [];
  const missingExpectedCharacters = Array.from(
    new Set([
      ...sceneQaMissingExpectedCharacters,
      ...characters.filter((character) => !character.found).map((character) => character.name),
    ])
  );
  const issueSummaries = characters
    .map((c) => summarizeValidationIssues(c, input.expectedCharacters, characterReferences))
    .filter((s): s is string => s != null);
  const overallParts = [
    sceneQa?.overallFeedback,
    missingExpectedCharacters.length > 0
      ? `Missing expected characters: ${missingExpectedCharacters.join(', ')}.`
      : null,
    sceneQa?.hasUnexpectedCharacters && sceneQa.unexpectedCharacterNotes
      ? `Unexpected characters: ${sceneQa.unexpectedCharacterNotes}.`
      : null,
    ...characters
      .filter((character) => !character.found || character.issue)
      .map(
        (character) =>
          `${character.name}: ${character.issue || character.identityComparisonSummary}`
      ),
  ].filter((value): value is string => !!value?.trim());

  const validation: ImageValidationResult = {
    validationStatus: 'completed',
    validationAttemptKind: 'segmented_parallel',
    validationModelUsed: visionModel,
    requestManifest,
    characterCount: characters.reduce(
      (count, character) =>
        count +
        expectedCharacterInstanceCount(
          character,
          findCharacterBoundingBox(character.name, characterBoxes)
        ),
      0
    ),
    expectedCharacterCount: input.expectedCharacters.length,
    characters,
    hasUnexpectedCharacters: sceneQa?.hasUnexpectedCharacters ?? false,
    missingExpectedCharacters,
    unexpectedCharacterNotes: sceneQa?.unexpectedCharacterNotes ?? null,
    hasTextOrLetters: sceneQa?.hasTextOrLetters ?? false,
    hasRenderingArtifacts: sceneQa?.hasRenderingArtifacts ?? false,
    hasSceneCompositionMismatch: sceneQa?.hasSceneCompositionMismatch ?? false,
    overallFeedback:
      overallParts.length > 0 ? overallParts.join(' ') : 'Segmented validation completed.',
  };

  if (input.includeLayoutChecks) {
    validation.hasArtworkOutsidePanelBounds = sceneQa?.hasArtworkOutsidePanelBounds ?? false;
    validation.hasArtworkOverSpeechBubbles =
      sceneQa?.hasArtworkOverSpeechBubbles ?? (includeBubbleChecks ? false : undefined);
    validation.hasExtraPanelStructure = sceneQa?.hasExtraPanelStructure ?? false;
    validation.layoutFeedback = sceneQaProviderBlocked
      ? `provider-blocked: ${sceneQaPass?.providerError || 'no scene QA verdict'}`
      : sceneQa?.layoutFeedback || 'ok';
  }

  logger.info(
    {
      ...input.logContext,
      attemptKind: validation.validationAttemptKind,
      characterCount: validation.characterCount,
      expectedCharacterCount: validation.expectedCharacterCount,
      hasUnexpected: validation.hasUnexpectedCharacters,
      missingExpectedCharacters: validation.missingExpectedCharacters,
      hasText: validation.hasTextOrLetters,
      passCount: passesManifest.length,
      issues: issueSummaries,
    },
    'Segmented image validation result'
  );

  return validation;
}

export async function runGraphicNovelPanelImageValidation(
  textProvider: ITextProvider,
  input: GraphicNovelPanelValidationInput,
  options: ProductImageValidationOptions = {}
): Promise<GraphicNovelPanelImageValidationResult> {
  const operation = options.operation ?? 'image_validation_graphic_novel_panels';
  const pageCharacters =
    input.pageCharacters && input.pageCharacters.length > 0
      ? input.pageCharacters
      : Array.from(
          new Map(
            input.panels
              .flatMap((panel) => panel.expectedCharacters)
              .map((character) => [
                stripCharacterIdFromName(character.name).trim().toLowerCase(),
                character,
              ])
          ).values()
        );

  if (input.panels.length === 1) {
    const panel = input.panels[0];
    const validation = await runSegmentedProductImageValidation(
      textProvider,
      {
        imageData: input.imageData,
        mimeType: input.mimeType,
        expectedCharacters: panel.expectedCharacters,
        sceneVisual: buildSinglePanelSceneVisual(panel),
        referenceImages: input.referenceImages,
        logContext: input.logContext,
        onUsage: input.onUsage,
        includeWardrobeChecks: input.includeWardrobeChecks,
      },
      {
        ...options,
        operation,
      }
    );
    const result = adaptSegmentedValidationToSinglePanelResult({
      input,
      panel,
      validation,
    });

    logger.info(
      {
        ...input.logContext,
        attemptKind: result.validationAttemptKind,
        pageNumber: result.pageNumber,
        panelNumber: panel.panelNumber,
        panelId: panel.panelId,
        expectedCharacterCount: panel.expectedCharacters.length,
        characterCount: validation.characterCount,
        hasUnexpected: validation.hasUnexpectedCharacters,
        hasText: validation.hasTextOrLetters,
      },
      'Graphic novel single-panel validation used segmented scene validator'
    );

    return result;
  }

  const preparedGeneratedImage = await prepareImageForValidation(
    input.imageData,
    input.mimeType,
    config.image.validationSceneMaxSide
  );

  const preparedReferenceImages =
    input.referenceImages && input.referenceImages.length > 0
      ? await Promise.all(
          input.referenceImages.map(async (ref) => {
            if (!ref.imageData) {
              return {
                ...ref,
                mimeType: normalizeVisionMimeType(ref.mimeType),
              } as PreparedValidationReferenceImage;
            }
            const prepared = await prepareImageForValidation(
              Buffer.from(ref.imageData, 'base64'),
              ref.mimeType,
              config.image.validationReferenceMaxSide
            );
            return {
              ...ref,
              imageData: prepared.buffer.toString('base64'),
              mimeType: prepared.mimeType,
            } as PreparedValidationReferenceImage;
          })
        )
      : undefined;

  const prompt = buildGraphicNovelPanelValidationPrompt({
    pageNumber: input.pageNumber,
    panels: input.panels,
    pageCharacters,
    referenceImages: preparedReferenceImages,
    includeWardrobeChecks: input.includeWardrobeChecks,
  });
  const imageData: ImageData[] = [
    imageDataForGenerated(
      preparedGeneratedImage,
      'Image 1: GENERATED FULL COMIC PAGE. Validate panel-by-panel against the expected panel list.'
    ),
    ...(preparedReferenceImages || []).map((ref, index) => imageDataForReference(ref, index + 2)),
  ];
  const passesManifest: Array<Record<string, unknown>> = [];
  const includeWardrobeChecks = input.includeWardrobeChecks !== false;
  const imageOrder = [
    '1_generated_graphic_novel_page',
    ...(preparedReferenceImages ?? []).map(
      (r, i) => `${i + 2}_${validationReferenceImageOrderRole(r)}_${r.characterName}`
    ),
  ];
  const requestManifest: Record<string, unknown> = {
    version: 1,
    validationSystemInstruction: 'image_validation_graphic_novel_panels_v1',
    operation,
    mode: 'single_request_panel_array',
    includeLayoutChecks: true,
    includeBubbleChecks: false,
    includeWardrobeChecks,
    pageNumber: input.pageNumber,
    expectedPanelCount: input.panels.length,
    pageCharacterCount: pageCharacters.length,
    referenceCount: preparedReferenceImages?.length ?? 0,
    imageOrder,
    promptLength: prompt.length,
    pageCharacters: pageCharacters.map((character) => ({
      name: character.name,
      characterKind: character.characterKind,
      speciesSubtype: character.speciesSubtype,
      validateOutfit: includeWardrobeChecks && character.validateOutfit === true,
    })),
    expectedPanels: input.panels.map((panel) => ({
      panelNumber: panel.panelNumber,
      panelId: panel.panelId,
      expectedVisualFocus: panel.expectedVisualFocus,
      expectedSetting: panel.expectedSetting ?? null,
      expectedCharacters: panel.expectedCharacters.map((character) => ({
        name: character.name,
        characterKind: character.characterKind,
        speciesSubtype: character.speciesSubtype,
        validateOutfit: includeWardrobeChecks && character.validateOutfit === true,
      })),
    })),
    generatedImage: {
      role: 'generated_graphic_novel_page',
      mimeType: preparedGeneratedImage.mimeType,
      width: preparedGeneratedImage.width,
      height: preparedGeneratedImage.height,
      originalWidth: preparedGeneratedImage.originalWidth,
      originalHeight: preparedGeneratedImage.originalHeight,
      resized: preparedGeneratedImage.resized,
      sha256: sha256Short(preparedGeneratedImage.buffer),
    },
    references: (preparedReferenceImages ?? []).map((ref, index) => ({
      imageIndex: index + 2,
      characterName: ref.characterName,
      referenceKind: ref.referenceKind ?? 'identity',
      identitySource: ref.identitySource,
      mimeType: ref.mimeType,
      delivery: ref.fileUri ? 'file_uri' : 'inline_base64',
      sha256: ref.imageData ? sha256Short(Buffer.from(ref.imageData, 'base64')) : undefined,
    })),
    prompt,
    passes: passesManifest,
  };

  logger.info(
    {
      ...input.logContext,
      mode: 'single_request_panel_array',
      pageNumber: input.pageNumber,
      expectedPanelCount: input.panels.length,
      referenceCount: preparedReferenceImages?.length ?? 0,
      imageOrderToModel: imageOrder,
      generatedImage: {
        mimeType: preparedGeneratedImage.mimeType,
        sizeBytes: preparedGeneratedImage.buffer.length,
        width: preparedGeneratedImage.width,
        height: preparedGeneratedImage.height,
        resized: preparedGeneratedImage.resized,
      },
    },
    'Graphic novel panel image validation: sending one panel-array request to Vision model'
  );

  const pass = await runSegmentedStructuredPass<GraphicNovelPanelImageValidationResult>({
    textProvider,
    fallbackTextProvider: options.fallbackTextProvider,
    model: options.visionModel,
    fallbackModel: options.fallbackVisionModel,
    passKind: 'comic_panel_page',
    passId: `page_${input.pageNumber}`,
    prompt,
    schema: buildGraphicNovelPanelValidationSchema(),
    imageData,
    input: {
      imageData: input.imageData,
      mimeType: input.mimeType,
      expectedCharacters: input.panels.flatMap((panel) => panel.expectedCharacters),
      sceneVisual: {
        setting: `Graphic novel page ${input.pageNumber} panel-array validation.`,
        lighting: 'N/A',
        cameraComposition: {
          shot: `Full page with ${input.panels.length} expected panels.`,
          characters: [],
        },
      },
      logContext: input.logContext,
      onUsage: input.onUsage,
    },
    operation,
    manifestPasses: passesManifest,
    recordModeration: options.recordModeration,
  });

  if (!pass.result) {
    return {
      validationStatus: 'provider_blocked',
      validationAttemptKind: pass.attemptKind,
      validationModelUsed: pass.modelUsed,
      providerError: pass.providerError,
      requestManifest,
      pageNumber: input.pageNumber,
      expectedPanelCount: input.panels.length,
      detectedPanelCount: 0,
      hasExtraPanelStructure: false,
      hasTextOrLetters: false,
      hasRenderingArtifacts: false,
      layoutFeedback: `provider-blocked: ${pass.providerError || 'no visual verdict'}`,
      panels: input.panels.map((panel) => ({
        panelNumber: panel.panelNumber,
        panelId: panel.panelId,
        panelDetected: false,
        matchedVisiblePanelDescription: 'provider blocked panel validation',
        visualMatchesExpectedMoment: false,
        unexpectedCharactersPresent: false,
        unexpectedNamedCharacters: [],
        renderingArtifacts: false,
        panelIssue: pass.providerError || 'provider_blocked_no_visual_verdict',
        characters: panel.expectedCharacters.map((character) => ({
          name: character.name,
          characterKind: character.characterKind,
          expectedPresent: true,
          found: false,
          recognizableScore: 0,
          faceMatchesReference: character.characterKind === 'human' ? null : null,
          hairMatchesReference: character.characterKind === 'human' ? null : null,
          ageReadMatchesReference: character.characterKind === 'human' ? null : null,
          proportionsMatchReference: null,
          matchesColors: false,
          matchesOutfit: true,
          actualVisibleDescription: null,
          sameOverallDesignRead: null,
          silhouetteDriftSeverity: null,
          identityComparisonSummary: 'Provider blocked panel validation; no visual verdict.',
          issue: pass.providerError || 'provider_blocked_no_visual_verdict',
        })),
      })),
      overallFeedback: `Provider blocked panel validation: ${pass.providerError || 'no visual verdict'}`,
    };
  }

  const result: GraphicNovelPanelImageValidationResult = {
    ...pass.result,
    validationStatus: 'completed',
    validationAttemptKind: pass.attemptKind,
    validationModelUsed: pass.modelUsed,
    requestManifest,
    pageNumber: pass.result.pageNumber || input.pageNumber,
    expectedPanelCount: pass.result.expectedPanelCount || input.panels.length,
  };
  normalizeGraphicNovelPanelOutfitVerdicts(result, input.panels);

  logger.info(
    {
      ...input.logContext,
      attemptKind: result.validationAttemptKind,
      pageNumber: result.pageNumber,
      expectedPanelCount: result.expectedPanelCount,
      detectedPanelCount: result.detectedPanelCount,
      hasExtraPanelStructure: result.hasExtraPanelStructure,
      panels: result.panels.map((panel) => ({
        panelNumber: panel.panelNumber,
        panelDetected: panel.panelDetected,
        characters: panel.characters.map((character) => ({
          name: character.name,
          found: character.found,
          recognizableScore: character.recognizableScore,
          issue: character.issue ?? null,
        })),
      })),
    },
    'Graphic novel panel image validation result'
  );

  return result;
}

/**
 * Run the compact validation pipeline: Image 1 = generated scene, then identity refs;
 * cached rules plus the runtime prompt, IMAGE_VALIDATION_SCHEMA, temperature 0.2, relaxed safety.
 */
export async function runProductImageValidation(
  textProvider: ITextProvider,
  input: ProductImageValidationInput,
  options: ProductImageValidationOptions = {}
): Promise<ImageValidationResult> {
  const visionModel = options.visionModel;
  const operation = options.operation ?? 'image_validation';

  const preparedGeneratedImage = await prepareImageForValidation(
    input.imageData,
    input.mimeType,
    config.image.validationSceneMaxSide
  );

  const validationReferenceImages = input.referenceImages?.filter(
    (ref) => ref.referenceKind !== 'layout_template'
  );

  const preparedReferenceImages =
    validationReferenceImages && validationReferenceImages.length > 0
      ? await Promise.all(
          validationReferenceImages.map(async (ref) => {
            if (!ref.imageData) return ref;
            const prepared = await prepareImageForValidation(
              Buffer.from(ref.imageData, 'base64'),
              ref.mimeType,
              config.image.validationReferenceMaxSide
            );
            return {
              ...ref,
              imageData: prepared.buffer.toString('base64'),
              mimeType: prepared.mimeType,
            };
          })
        )
      : undefined;

  const refMeta =
    preparedReferenceImages?.map((r) => ({
      characterName: r.characterName,
      referenceKind: r.referenceKind ?? 'identity',
      identitySource: r.identitySource,
      mimeType: r.mimeType,
      delivery: r.fileUri ? ('file_uri' as const) : ('inline_base64' as const),
    })) ?? [];

  logger.info(
    {
      ...input.logContext,
      expectedCharacterCount: input.expectedCharacters.length,
      expectedRoster: input.expectedCharacters.map((c) => ({
        name: c.name,
        characterKind: c.characterKind,
        speciesSubtype: c.speciesSubtype,
      })),
      generatedImage: {
        mimeType: preparedGeneratedImage.mimeType,
        sizeBytes: preparedGeneratedImage.buffer.length,
        originalSizeBytes: input.imageData.length,
        width: preparedGeneratedImage.width,
        height: preparedGeneratedImage.height,
        originalWidth: preparedGeneratedImage.originalWidth,
        originalHeight: preparedGeneratedImage.originalHeight,
        resized: preparedGeneratedImage.resized,
        role: 'image_1_generated_scene',
      },
      referenceCount: refMeta.length,
      referencesSent: refMeta,
      includeLayoutChecks: input.includeLayoutChecks === true,
      imageOrderToModel: [
        '1_generated_illustration',
        ...(preparedReferenceImages ?? []).map(
          (r, i) => `${i + 2}_${validationReferenceImageOrderRole(r)}_${r.characterName}`
        ),
      ],
      totalAttachmentCount: 1 + refMeta.length,
    },
    'Image validation: sending generated scene + identity references to Vision model'
  );

  const imageDataArray: Array<{
    mimeType: SupportedVisionMimeType;
    data: string;
    fileUri?: string;
    instructionText?: string;
  }> = [
    {
      mimeType: preparedGeneratedImage.mimeType,
      data: preparedGeneratedImage.buffer.toString('base64'),
      instructionText: buildValidationImageInstruction({ imageIndex: 1 }),
    },
  ];

  if (preparedReferenceImages && preparedReferenceImages.length > 0) {
    for (const ref of preparedReferenceImages) {
      imageDataArray.push({
        mimeType: normalizeVisionMimeType(ref.mimeType),
        data: ref.imageData || '',
        fileUri: ref.fileUri,
        instructionText: buildValidationImageInstruction({
          imageIndex: imageDataArray.length + 1,
          characterName: ref.characterName,
          referenceKind: ref.referenceKind ?? 'identity',
          identitySource: ref.identitySource,
        }),
      });
    }
  }

  const hasReferenceImages = (preparedReferenceImages?.length ?? 0) > 0;
  const cachedPrefix = getImageValidationCachedPrefix(hasReferenceImages);
  const includeWardrobeChecks = input.includeWardrobeChecks !== false;

  const imageOrder = [
    '1_generated_illustration',
    ...(preparedReferenceImages ?? []).map(
      (r, i) => `${i + 2}_${validationReferenceImageOrderRole(r)}_${r.characterName}`
    ),
  ];
  const requestManifest: Record<string, unknown> = {
    version: 1,
    validationSystemInstruction: 'image_validation_qa_v1',
    systemInstruction: IMAGE_VALIDATION_SYSTEM_INSTRUCTION,
    cacheKey: cachedPrefix.key,
    cachedPrefixContent: cachedPrefix.content,
    cachedPrefixChars: cachedPrefix.content.length,
    operation,
    includeLayoutChecks: input.includeLayoutChecks === true,
    includeBubbleChecks: input.includeBubbleChecks !== false,
    includeWardrobeChecks,
    imageOrder,
    generatedImage: {
      role: 'generated_scene',
      mimeType: preparedGeneratedImage.mimeType,
      width: preparedGeneratedImage.width,
      height: preparedGeneratedImage.height,
      originalWidth: preparedGeneratedImage.originalWidth,
      originalHeight: preparedGeneratedImage.originalHeight,
      resized: preparedGeneratedImage.resized,
      sha256: sha256Short(preparedGeneratedImage.buffer),
    },
    references: (preparedReferenceImages ?? []).map((r, i) => ({
      imageIndex: i + 2,
      characterName: r.characterName,
      referenceKind: r.referenceKind ?? 'identity',
      identitySource: r.identitySource,
      mimeType: r.mimeType,
      delivery: r.fileUri ? 'file_uri' : 'inline_base64',
      sha256: r.imageData ? sha256Short(Buffer.from(r.imageData, 'base64')) : undefined,
    })),
    attempts: [],
  };
  const manifestAttempts = requestManifest.attempts as Array<Record<string, unknown>>;

  const attemptSpecs: Array<{
    providerRole: ValidationProviderRole;
    provider: ITextProvider;
    model?: string;
    promptMode: ValidationPromptMode;
  }> = [
    { providerRole: 'primary', provider: textProvider, model: visionModel, promptMode: 'compact' },
    { providerRole: 'primary', provider: textProvider, model: visionModel, promptMode: 'reduced' },
  ];
  if (options.fallbackTextProvider) {
    attemptSpecs.push(
      {
        providerRole: 'fallback',
        provider: options.fallbackTextProvider,
        model: options.fallbackVisionModel,
        promptMode: 'compact',
      },
      {
        providerRole: 'fallback',
        provider: options.fallbackTextProvider,
        model: options.fallbackVisionModel,
        promptMode: 'reduced',
      }
    );
  }

  let lastBlockedError = '';
  let lastBlockedAttemptKind = '';

  for (const attemptSpec of attemptSpecs) {
    const promptMode = attemptSpec.promptMode;
    const expectedCharactersForPrompt = buildExpectedCharactersForPrompt(
      input.expectedCharacters,
      preparedReferenceImages,
      promptMode,
      includeWardrobeChecks
    );
    const sceneContext = buildCompactValidationSceneManifest(input.sceneVisual, promptMode);
    const prompt = buildImageValidationRuntimePrompt({
      expectedCharacters: expectedCharactersForPrompt,
      sceneContext,
      referenceImages: preparedReferenceImages,
      includeLayoutChecks: input.includeLayoutChecks,
      includeBubbleChecks: input.includeBubbleChecks,
    });
    const finalPromptText = cachedPrefix.content?.trim()
      ? `${cachedPrefix.content.trim()}\n\n${prompt}`
      : prompt;
    const inputParts = buildValidationInputParts(imageDataArray, finalPromptText);
    const attemptKind = `${attemptSpec.providerRole}_${promptMode}`;
    const attemptManifest: Record<string, unknown> = {
      attemptKind,
      providerRole: attemptSpec.providerRole,
      promptMode,
      model: attemptSpec.model,
      cacheKey: cachedPrefix.key,
      cachedPrefixChars: cachedPrefix.content.length,
      runtimePromptChars: prompt.length,
      combinedPromptChars: cachedPrefix.content.length + 2 + prompt.length,
      runtimePrompt: prompt,
      input: summarizeValidationInputParts(inputParts),
    };
    manifestAttempts.push(attemptManifest);

    try {
      const raw = await attemptSpec.provider.generateStructured<ImageValidationResult>({
        model: attemptSpec.model,
        systemInstruction: IMAGE_VALIDATION_SYSTEM_INSTRUCTION,
        prompt,
        cachedPrefix,
        inputParts,
        imageData: imageDataArray,
        schema: buildImageValidationSchema({
          includeLayoutChecks: input.includeLayoutChecks,
          includeBubbleChecks: input.includeBubbleChecks,
        }),
        temperature: 0.2,
        relaxedSafety: true,
        onUsage: input.onUsage,
        operation,
      });

      const result = normalizeImageValidationResult(
        raw,
        input.expectedCharacters,
        preparedReferenceImages,
        input.includeLayoutChecks === true,
        input.includeBubbleChecks !== false
      );
      result.validationStatus = 'completed';
      result.validationAttemptKind = attemptKind;
      result.validationModelUsed = attemptSpec.model;
      result.requestManifest = requestManifest;
      attemptManifest.outcome = 'completed';

      const issueSummaries = result.characters
        .map((c) => summarizeValidationIssues(c, input.expectedCharacters, input.referenceImages))
        .filter((s): s is string => s != null);

      logger.info(
        {
          ...input.logContext,
          attemptKind,
          characterCount: result.characterCount,
          expectedCharacterCount: result.expectedCharacterCount,
          hasUnexpected: result.hasUnexpectedCharacters,
          hasText: result.hasTextOrLetters,
          issues: issueSummaries,
        },
        'Image validation result'
      );

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      attemptManifest.error = errorMsg;

      if (isProviderBlockedError(errorMsg)) {
        attemptManifest.outcome = 'provider_blocked';
        lastBlockedError = errorMsg;
        lastBlockedAttemptKind = attemptKind;
        if (options.recordModeration !== false) {
          void recordModerationDecision({
            storyId: input.logContext?.storyId,
            stage: 'generated_image_validation',
            source: 'image_validation_provider',
            subjectType: 'scene_image',
            subjectRefHash: hashModerationSubject(
              `${input.logContext?.storyId ?? 'story'}:${input.logContext?.sceneId ?? 'scene'}:${input.logContext?.attempt ?? 'attempt'}:${attemptKind}`
            ),
            decision: 'blocked',
            code: 'IMAGE_VALIDATION_PROVIDER_BLOCKED',
            category: 'provider_safety_filter',
            metadata: {
              sceneId: input.logContext?.sceneId,
              attempt: input.logContext?.attempt,
              validationAttemptKind: attemptKind,
              expectedCharacterCount: input.expectedCharacters.length,
            },
          });
        }
        logger.warn(
          { ...input.logContext, attemptKind, error: errorMsg },
          'Image validation provider blocked request; trying fallback/reduced validator if available'
        );
        continue;
      }

      attemptManifest.outcome = 'failed';
      if (options.recordModeration !== false) {
        void recordModerationDecision({
          storyId: input.logContext?.storyId,
          stage: 'generated_image_validation',
          source: 'image_validation_provider',
          subjectType: 'scene_image',
          subjectRefHash: hashModerationSubject(
            `${input.logContext?.storyId ?? 'story'}:${input.logContext?.sceneId ?? 'scene'}:${input.logContext?.attempt ?? 'attempt'}:${attemptKind}`
          ),
          decision: 'failed',
          code: 'IMAGE_VALIDATION_FAILED',
          metadata: {
            sceneId: input.logContext?.sceneId,
            attempt: input.logContext?.attempt,
            validationAttemptKind: attemptKind,
            errorName: error instanceof Error ? error.name : typeof error,
          },
        });
      }
      logger.error(
        {
          ...input.logContext,
          attemptKind,
          err:
            error instanceof Error
              ? { message: error.message, name: error.name, stack: error.stack }
              : String(error),
        },
        'Image validation failed'
      );
      throw new Error(`Image validation failed: ${errorMsg}`);
    }
  }

  logger.warn(
    { ...input.logContext, lastBlockedAttemptKind, error: lastBlockedError },
    'All image validation provider attempts were blocked; returning inconclusive provider_blocked result'
  );

  const blockedResult: ImageValidationResult = {
    validationStatus: 'provider_blocked',
    validationAttemptKind: lastBlockedAttemptKind || 'all_blocked',
    validationModelUsed:
      (manifestAttempts[manifestAttempts.length - 1]?.model as string | undefined) ?? visionModel,
    providerError: lastBlockedError || 'All image validation provider attempts were blocked',
    requestManifest,
    characterCount: input.expectedCharacters.length,
    expectedCharacterCount: input.expectedCharacters.length,
    characters: input.expectedCharacters.map((c) => ({
      name: c.name,
      characterKind: c.characterKind,
      found: true,
      duplicated: false,
      recognizableScore: 1,
      faceMatchesReference: null,
      hairMatchesReference: null,
      ageReadMatchesReference: null,
      proportionsMatchReference: null,
      matchesColors: true,
      matchesOutfit: true,
      actualVisibleDescription: null,
      identityComparisonSummary: 'Provider blocked validation; no visual verdict.',
      issue: 'provider_blocked_no_visual_verdict',
    })),
    hasUnexpectedCharacters: false,
    hasTextOrLetters: false,
    hasRenderingArtifacts: false,
    hasSceneCompositionMismatch: false,
    overallFeedback: `provider-blocked: ${lastBlockedError || 'no visual verdict'}`,
  };
  if (input.includeLayoutChecks) {
    blockedResult.hasArtworkOutsidePanelBounds = false;
    if (input.includeBubbleChecks !== false) {
      blockedResult.hasArtworkOverSpeechBubbles = false;
    }
    blockedResult.hasExtraPanelStructure = false;
    blockedResult.layoutFeedback = 'provider_blocked_no_layout_verdict';
  }
  return blockedResult;
}
