/**
 * Single implementation of product image validation (Vision + structured JSON).
 * Used by ImageDomainService and diagnostic scripts so prompt, schema, image order, and temperature match production.
 */

import { createHash } from 'node:crypto';
import { stripCharacterIdFromName } from '@wondertales/shared';
import sharp from 'sharp';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { ImageData, JsonSchema } from '../../providers/base/JsonSchema';
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
    expectedOutfitForScene?: string;
  }>;
  sceneVisual: SceneVisual;
  sceneCharacterOutfitsText?: string;
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
type SegmentedValidationPassKind = 'layout' | 'character_identity' | 'comic_panel_page';

type PreparedValidationReferenceImage = NonNullable<
  ProductImageValidationInput['referenceImages']
>[number] & {
  mimeType: SupportedVisionMimeType;
};

type SegmentedCharacterValidationResult = {
  character: ImageValidationResult['characters'][0];
  hasUnexpectedCharacters?: boolean;
  hasRenderingArtifacts?: boolean;
  notes?: string;
};

type SegmentedLayoutValidationResult = {
  hasArtworkOutsidePanelBounds: boolean;
  hasArtworkOverSpeechBubbles?: boolean;
  hasExtraPanelStructure: boolean;
  hasTextOrLetters: boolean;
  hasRenderingArtifacts: boolean;
  layoutFeedback: string;
  overallFeedback: string;
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
      issue?: string | null;
    }>;
  }>;
  overallFeedback: string;
};

export const IMAGE_VALIDATION_SYSTEM_INSTRUCTION = [
  "You are an image quality assurance inspector for a safe children's book illustration app.",
  'The attached images are already-generated or approved visual references. Do not generate story content.',
  'Inspect only observable visual details and return the requested JSON object.',
  'If a child or fantasy character appears, treat the scene as benign storybook art and avoid sexualized or violent interpretations.',
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

function truncateText(text: string, maxChars: number): string {
  const compact = compactWhitespace(text);
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
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
  mode: ValidationPromptMode
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
    expectedOutfitForScene: mode === 'reduced' ? undefined : c.expectedOutfitForScene,
  }));
}

function buildCompactValidationSceneManifest(
  sceneVisual: SceneVisual,
  outfitLine: string | undefined,
  mode: ValidationPromptMode
): string | undefined {
  if (mode === 'reduced') {
    return outfitLine
      ? `VALIDATION MANIFEST:\nwardrobe_text: ${truncateText(outfitLine, 360)}`
      : undefined;
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
    outfitLine ? `wardrobe_text: ${truncateText(outfitLine, 360)}` : undefined,
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
  if (params.referenceKind === 'outfit_plate') {
    return `Image ${params.imageIndex}: OUTFIT PLATE for "${name}". Clothing only. Use this as the strongest wardrobe ground truth for this character in the generated illustration.`;
  }

  if (params.identitySource === 'turnaround') {
    return `Image ${params.imageIndex}: IDENTITY TURNAROUND model sheet for "${name}". This is strict multi-view identity ground truth for face/head read, hairstyle, hair color zones, age read, body proportions, silhouette, palette, stable markings, and default clothing only when no outfit plate or scene wardrobe text exists.`;
  }

  return `Image ${params.imageIndex}: IDENTITY reference for "${name}". Use this for face, hair, age read, body proportions, silhouette, palette, stable markings, and default clothing only when no outfit plate or scene wardrobe text exists.`;
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
    const exp = findExpectedForValidationChar(c.name, expectedCharacters);
    const expectedKind = exp?.characterKind ?? null;
    const hasIdentityReference = charHasIdentityReference(c.name, referenceImages);
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
  if (!c.found) parts.push('missing');
  if (c.duplicated) parts.push('duplicated');
  if ((c.recognizableScore ?? 1) < 0.5)
    parts.push(`lowRecognizable(${(c.recognizableScore ?? 0).toFixed(2)})`);
  if (!c.matchesColors) parts.push('colors');
  if (!c.matchesOutfit) parts.push('outfit');
  const exp = findExpectedForValidationChar(c.name, expectedCharacters);
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
    required: ['character', 'hasUnexpectedCharacters', 'hasRenderingArtifacts', 'notes'],
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
          found: { type: 'boolean' },
          duplicated: { type: 'boolean' },
          recognizableScore: { type: 'number', minimum: 0, maximum: 1 },
          faceMatchesReference: { type: ['boolean', 'null'] },
          hairMatchesReference: { type: ['boolean', 'null'] },
          ageReadMatchesReference: { type: ['boolean', 'null'] },
          proportionsMatchReference: { type: ['boolean', 'null'] },
          matchesColors: { type: 'boolean' },
          matchesOutfit: { type: 'boolean' },
          actualVisibleDescription: { type: ['string', 'null'] },
          sameOverallDesignRead: { type: ['boolean', 'null'] },
          silhouetteDriftSeverity: {
            type: ['string', 'null'],
            enum: ['none', 'mild', 'moderate', 'severe', null],
          },
          identityComparisonSummary: { type: 'string' },
          issue: { type: ['string', 'null'] },
        },
      },
      hasUnexpectedCharacters: { type: 'boolean' },
      hasRenderingArtifacts: { type: 'boolean' },
      notes: { type: ['string', 'null'] },
    },
  };
}

function buildSegmentedLayoutSchema(includeBubbleChecks: boolean): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'hasArtworkOutsidePanelBounds',
      'hasArtworkOverSpeechBubbles',
      'hasExtraPanelStructure',
      'hasTextOrLetters',
      'hasRenderingArtifacts',
      'layoutFeedback',
      'overallFeedback',
    ],
    properties: {
      hasArtworkOutsidePanelBounds: { type: 'boolean' },
      hasArtworkOverSpeechBubbles: includeBubbleChecks
        ? { type: 'boolean' }
        : { type: ['boolean', 'null'] },
      hasExtraPanelStructure: { type: 'boolean' },
      hasTextOrLetters: { type: 'boolean' },
      hasRenderingArtifacts: { type: 'boolean' },
      layoutFeedback: { type: 'string' },
      overallFeedback: { type: 'string' },
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
      hairMatchesReference: { type: ['boolean', 'null'] },
      ageReadMatchesReference: { type: ['boolean', 'null'] },
      proportionsMatchReference: { type: ['boolean', 'null'] },
      matchesColors: { type: 'boolean' },
      matchesOutfit: { type: 'boolean' },
      actualVisibleDescription: { type: ['string', 'null'] },
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
}): string {
  const referenceRows = (params.referenceImages || [])
    .map((ref, index) => {
      const role =
        ref.referenceKind === 'outfit_plate'
          ? 'outfit plate'
          : ref.identitySource === 'turnaround'
            ? 'turnaround identity reference'
            : 'identity reference';
      return `Image ${index + 2}: ${role} for "${ref.characterName}"`;
    })
    .join('\n');

  const pageCharacterRows =
    params.pageCharacters.length > 0
      ? params.pageCharacters
          .map((character) => {
            const subtype = character.speciesSubtype?.trim()
              ? `; subtype=${character.speciesSubtype.trim()}`
              : '';
            const desc = character.description?.trim()
              ? `; description=${character.description.trim()}`
              : '';
            return `- ${character.name} (${character.characterKind}${subtype}${desc})`;
          })
          .join('\n')
      : '- none';

  const panelRows = params.panels
    .map((panel) => {
      const expectedNames = new Set(
        panel.expectedCharacters.map((character) =>
          stripCharacterIdFromName(character.name).trim().toLowerCase()
        )
      );
      const notExpectedCharacters = params.pageCharacters.filter(
        (character) =>
          !expectedNames.has(stripCharacterIdFromName(character.name).trim().toLowerCase())
      );
      const characterRows =
        panel.expectedCharacters.length > 0
          ? panel.expectedCharacters
              .map((character) => {
                const subtype = character.speciesSubtype?.trim()
                  ? `; subtype=${character.speciesSubtype.trim()}`
                  : '';
                const desc = character.description?.trim()
                  ? `; description=${character.description.trim()}`
                  : '';
                const outfit = character.expectedOutfitForScene?.trim()
                  ? `; expected outfit=${character.expectedOutfitForScene.trim()}`
                  : '';
                return `  - ${character.name} (${character.characterKind}${subtype}${desc}${outfit})`;
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
    'Image 1 is the generated full comic page. The other images are character identity references and/or outfit plates.',
    '',
    'Panel matching rules:',
    '- Return exactly one panels[] item for each expected Panel N listed below, in the same order.',
    '- Match each expected panel to the best visible physical panel/region on Image 1 using expected visual focus, expected characters, and visual read, not only naive reading order.',
    '- If the artwork split one expected panel into multiple physical boxes or merged panels together, still return the expected panel item, set hasExtraPanelStructure=true, describe the split/merge in layoutFeedback and panelIssue, and evaluate characters from the best matching visible region.',
    '- Do not let a character visible in another panel satisfy presence for this panel. Character found=true must be panel-local.',
    '- The same character appearing once in multiple different panels is normal and is not duplication.',
    '- The expected characters listed for a panel are the only named page-roster characters allowed in that panel.',
    '- If a page-roster character listed under "should NOT be visible" appears in that panel, add it to unexpectedNamedCharacters and set unexpectedCharactersPresent=true.',
    '',
    'Character validation rules:',
    '- For every expected character in a panel, answer whether that exact named character is visible in that panel and whether it matches the reference/expected design.',
    '- Use the same identity rules as the standard image validator: humans require face/head, hairstyle, age read, proportions, silhouette, and stable marks; animals/imaginary creatures require body type, subtype/species read, silhouette, proportions, and stable colors/markings.',
    '- If the panel contains only a generic substitute or different stable design, set found=false or recognizableScore<=0.4, even if the role/slot is occupied.',
    '- If the character is present but details drift, keep found=true and mark the specific fields false.',
    '- For each missing or wrong expected character, actualVisibleDescription must describe the visible substitute/candidate in that panel using concrete visual words. Use null only when the expected character is correct or no substitute/candidate is visible.',
    '- For humans with identity reference, faceMatchesReference, hairMatchesReference, ageReadMatchesReference, and proportionsMatchReference must be booleans.',
    '- For animals/imaginary creatures, set human-only face/hair/age fields to null; use sameOverallDesignRead, silhouetteDriftSeverity, and proportionsMatchReference.',
    '- matchesOutfit validates clothing only when an outfit plate or expected outfit text exists; otherwise use visible default/reference clothing only as a weak clue.',
    '- unexpectedNamedCharacters is only for page-roster characters visible in a panel where they are not expected. Do not put environment objects, props, or unnamed background creatures there.',
    '',
    'Page-level rules:',
    '- detectedPanelCount is the number of visible physical comic panel boxes/regions.',
    '- hasExtraPanelStructure=true if visible physical panels do not match expectedPanelCount, or if there are fake gutters, inset panels, split panels, or merged story beats.',
    '- hasTextOrLetters=true for unwanted readable text/letters in artwork. Ignore server-rendered HTML speech bubbles if present.',
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
    'Return JSON only. Do not include markdown.',
  ].join('\n');
}

function buildSegmentedCharacterPrompt(params: {
  character: ProductImageValidationInput['expectedCharacters'][number];
  identityReference?: PreparedValidationReferenceImage;
  outfitReference?: PreparedValidationReferenceImage;
  sceneOutfitText?: string;
}): string {
  const { character } = params;
  const lines = [
    'Task: validate exactly ONE expected character in Image 1.',
    'Image 1 is the generated illustration or graphic novel page.',
    params.identityReference
      ? 'Image 2 is this character identity reference. If it is a turnaround/model sheet, treat it as strict stable identity ground truth.'
      : 'No identity reference is attached; use only the expected character description and visible scene evidence.',
    params.outfitReference
      ? `Image ${params.identityReference ? 3 : 2} is the outfit plate. Use it only for clothing/wardrobe.`
      : '',
    'Ignore page layout, panel geometry, bubbles, story pacing, and all other named characters except for duplicates of this same character.',
    'For comics/graphic novel pages, the same character may appear in multiple separate panels as normal sequential storytelling; do not mark duplicated=true for that. duplicated=true only means an unintended extra clone/copy in the same panel or same story moment.',
    'Decision order:',
    '1. Search all of Image 1 for a candidate matching this exact named character.',
    '2. If an identity reference exists, first decide whether the same stable design is present. Generic substitutes or different stable designs are not the named character.',
    '3. Then compare identity details: for humans use face/head read, age read, hairstyle structure, hair color zoning, body proportions, silhouette, and stable marks. For animals/imaginary creatures use body type, species/subtype read, silhouette, proportions, stable colors/markings.',
    params.outfitReference
      ? `4. Finally evaluate outfit against the outfit plate only. Set matchesOutfit=true if the character in Image 1 is wearing the clothing/wardrobe from Image ${params.identityReference ? 3 : 2}; do not compare clothing to Image 2 identity/default clothes.`
      : '4. Finally evaluate outfit only against scene outfit text, or identity/default outfit when no stronger wardrobe ground truth exists.',
    'If the same stable character design is absent, set found=false and recognizableScore <= 0.4 even if a similar role/slot is occupied.',
    'If the same character is present but hair/outfit/details drift, keep found=true and mark the specific fields false.',
    'Return one JSON object for this character only.',
    '',
    `EXPECTED CHARACTER: "${character.name}"`,
    `KIND: ${character.characterKind}`,
    character.speciesSubtype?.trim() ? `SUBTYPE: ${character.speciesSubtype.trim()}` : '',
    character.description?.trim() ? `DESCRIPTION: ${character.description.trim()}` : '',
    character.expectedOutfitForScene?.trim()
      ? `EXPECTED OUTFIT FOR THIS SCENE: ${character.expectedOutfitForScene.trim()}`
      : '',
    params.sceneOutfitText?.trim() ? `SCENE OUTFIT TEXT: ${params.sceneOutfitText.trim()}` : '',
    '',
    'Output field rules:',
    '- name must equal the expected character name.',
    '- characterKind must equal the expected KIND.',
    '- duplicated=false when the character appears once per panel across multiple comic panels; duplicated=true only for unintended clones inside the same panel/story moment.',
    '- For humans with identity reference, faceMatchesReference/hairMatchesReference/ageReadMatchesReference/proportionsMatchReference must be booleans.',
    '- For animals and imaginary creatures, set faceMatchesReference/hairMatchesReference/ageReadMatchesReference to null; use sameOverallDesignRead, silhouetteDriftSeverity, and proportionsMatchReference for identity.',
    '- sameOverallDesignRead is true only when first-glance stable design read is unchanged; use null when no identity reference exists.',
    params.outfitReference
      ? '- matchesOutfit is a wardrobe-only boolean: true means the visible clothing matches the outfit plate; false means the visible clothing does not match the outfit plate. Identity-reference clothing must not make matchesOutfit=false when an outfit plate is attached.'
      : '- matchesOutfit is a wardrobe-only boolean based on scene outfit text or default/reference clothing when no outfit plate is attached.',
    '- actualVisibleDescription must describe what is actually visible instead when this expected character is missing or replaced by a wrong design. Be concrete and visual, e.g. "blond girl in a blue dress", "brown dragon-like quadruped", "small green mushroom creature". Use null only when the expected character is clearly correct or no substitute/candidate is visible.',
    '- issue should be null when there is no concrete problem; otherwise list concise observed problems.',
    '- identityComparisonSummary must separately say what matches, what differs, and whether the first-glance design read drifted.',
  ];

  return lines.filter(Boolean).join('\n');
}

function buildSegmentedLayoutPrompt(params: {
  sceneVisual: SceneVisual;
  includeBubbleChecks: boolean;
}): string {
  const visual = params.sceneVisual;
  const shot =
    typeof visual.cameraComposition === 'string'
      ? visual.cameraComposition
      : visual.cameraComposition.shot;
  return [
    'Task: validate layout/artifact quality for Image 1 only.',
    'Do not validate character identity, outfit, pose, or story semantics in this pass.',
    'No preset layout guide is attached; use only the page brief below and the visible generated page structure.',
    'Set hasExtraPanelStructure=true for missing panels, extra panels, merged/split planned panels, fake dividers, inset panels, or one planned panel split into multiple story beats.',
    'Set hasArtworkOutsidePanelBounds=true when artwork spills into gutters/margins or crosses intended panel boxes.',
    params.includeBubbleChecks
      ? 'Set hasArtworkOverSpeechBubbles=true when art covers, touches confusingly, or reduces readability of speech/thought/caption bubbles, bubble tails, outlines, or bubble text.'
      : 'This is an art-only page before server-rendered bubbles; set hasArtworkOverSpeechBubbles=false unless a real rendered text bubble is already present and visibly covered.',
    'Set hasTextOrLetters=true for unwanted visible text/letters inside the artwork.',
    'Set hasRenderingArtifacts=true for broken anatomy, malformed objects, corrupted rendering, or severe incoherent artifacts. Do not use it for ordinary style choices.',
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

function compactSegmentedCharacterResult(
  raw: SegmentedCharacterValidationResult,
  expectedCharacter: ProductImageValidationInput['expectedCharacters'][number],
  references: ProductImageValidationInput['referenceImages']
): ImageValidationResult['characters'][0] {
  const character = {
    ...raw.character,
    name: expectedCharacter.name,
    characterKind: expectedCharacter.characterKind,
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
      hasUnexpectedCharacters: raw.hasUnexpectedCharacters ?? false,
      hasTextOrLetters: false,
      hasRenderingArtifacts: raw.hasRenderingArtifacts ?? false,
      overallFeedback: raw.notes || character.identityComparisonSummary,
    },
    [expectedCharacter],
    references
  );
  return normalized.characters[0];
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
    };
    params.manifestPasses.push(passManifest);

    try {
      const startedAt = Date.now();
      const result = await attempt.provider.generateStructured<T>({
        model: attempt.model,
        systemInstruction: IMAGE_VALIDATION_SYSTEM_INSTRUCTION,
        prompt: params.prompt,
        imageData: params.imageData,
        schema: params.schema,
        temperature: 0.1,
        relaxedSafety: true,
        onUsage: params.input.onUsage,
        operation:
          params.passKind === 'layout'
            ? `${params.operation}_layout`
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
  const sceneOutfitText = input.sceneCharacterOutfitsText?.trim();
  const includeBubbleChecks = input.includeBubbleChecks !== false;
  const passesManifest: Array<Record<string, unknown>> = [];
  const imageOrder = [
    '1_generated_illustration',
    ...(preparedReferenceImages ?? []).map(
      (r, i) =>
        `${i + 2}_${r.identitySource === 'turnaround' ? 'identity_turnaround' : (r.referenceKind ?? 'identity')}_${r.characterName}`
    ),
  ];
  const requestManifest: Record<string, unknown> = {
    version: 1,
    validationSystemInstruction: 'image_validation_segmented_v1',
    operation,
    mode: input.includeLayoutChecks
      ? 'segmented_parallel_layout_plus_character_identity'
      : 'segmented_parallel_character_identity',
    includeLayoutChecks: input.includeLayoutChecks === true,
    includeBubbleChecks,
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
      passCount: input.expectedCharacters.length + (input.includeLayoutChecks ? 1 : 0),
      referenceCount: preparedReferenceImages?.length ?? 0,
      imageOrderToModel: imageOrder,
    },
    input.includeLayoutChecks
      ? 'Segmented image validation: sending layout and per-character passes to Vision model'
      : 'Segmented image validation: sending per-character passes to Vision model'
  );

  const layoutPromise = input.includeLayoutChecks
    ? runSegmentedStructuredPass<SegmentedLayoutValidationResult>({
        textProvider,
        fallbackTextProvider: options.fallbackTextProvider,
        model: visionModel,
        fallbackModel: options.fallbackVisionModel,
        passKind: 'layout',
        passId: 'layout',
        prompt: buildSegmentedLayoutPrompt({
          sceneVisual: input.sceneVisual,
          includeBubbleChecks,
        }),
        schema: buildSegmentedLayoutSchema(includeBubbleChecks),
        imageData: [
          imageDataForGenerated(
            preparedGeneratedImage,
            'Image 1: GENERATED PAGE. Validate layout/artifact quality only.'
          ),
        ],
        input,
        operation,
        manifestPasses: passesManifest,
        recordModeration: options.recordModeration,
      })
    : Promise.resolve(null);

  const characterPromises = input.expectedCharacters.map(async (character) => {
    const identityReference = findReferenceForCharacter(
      character.name,
      characterReferences,
      'identity'
    );
    const outfitReference = findReferenceForCharacter(
      character.name,
      characterReferences,
      'outfit_plate'
    );
    const imageData: ImageData[] = [
      imageDataForGenerated(
        preparedGeneratedImage,
        `Image 1: GENERATED PAGE. Search all panels for "${character.name}" and validate only this character.`
      ),
    ];
    if (identityReference)
      imageData.push(imageDataForReference(identityReference, imageData.length + 1));
    if (outfitReference)
      imageData.push(imageDataForReference(outfitReference, imageData.length + 1));

    const pass = await runSegmentedStructuredPass<SegmentedCharacterValidationResult>({
      textProvider,
      fallbackTextProvider: options.fallbackTextProvider,
      model: visionModel,
      fallbackModel: options.fallbackVisionModel,
      passKind: 'character_identity',
      passId: character.name,
      prompt: buildSegmentedCharacterPrompt({
        character,
        identityReference,
        outfitReference,
        sceneOutfitText,
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
        character: buildProviderBlockedCharacterResult(character, pass.providerError),
        pass,
      };
    }

    return {
      character: compactSegmentedCharacterResult(
        pass.result,
        character,
        [identityReference, outfitReference].filter(
          (ref): ref is PreparedValidationReferenceImage => !!ref
        )
      ),
      pass,
      raw: pass.result,
    };
  });

  const [layoutPass, characterPasses] = await Promise.all([
    layoutPromise,
    Promise.all(characterPromises),
  ]);

  const layout = layoutPass?.result;
  const layoutProviderBlocked = layoutPass?.providerBlocked === true;
  const characters = characterPasses.map((pass) => pass.character);
  const issueSummaries = characters
    .map((c) => summarizeValidationIssues(c, input.expectedCharacters, characterReferences))
    .filter((s): s is string => s != null);
  const overallParts = [
    layout?.overallFeedback,
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
    characterCount: characters.filter((character) => character.found).length,
    expectedCharacterCount: input.expectedCharacters.length,
    characters,
    hasUnexpectedCharacters: characterPasses.some((pass) => pass.raw?.hasUnexpectedCharacters),
    hasTextOrLetters: layout?.hasTextOrLetters ?? false,
    hasRenderingArtifacts:
      (layout?.hasRenderingArtifacts ?? false) ||
      characterPasses.some((pass) => pass.raw?.hasRenderingArtifacts),
    overallFeedback:
      overallParts.length > 0 ? overallParts.join(' ') : 'Segmented validation completed.',
  };

  if (input.includeLayoutChecks) {
    validation.hasArtworkOutsidePanelBounds = layout?.hasArtworkOutsidePanelBounds ?? false;
    validation.hasArtworkOverSpeechBubbles =
      layout?.hasArtworkOverSpeechBubbles ?? (includeBubbleChecks ? false : undefined);
    validation.hasExtraPanelStructure = layout?.hasExtraPanelStructure ?? false;
    validation.layoutFeedback = layoutProviderBlocked
      ? `provider-blocked: ${layoutPass?.providerError || 'no layout verdict'}`
      : layout?.layoutFeedback || 'ok';
  }

  logger.info(
    {
      ...input.logContext,
      attemptKind: validation.validationAttemptKind,
      characterCount: validation.characterCount,
      expectedCharacterCount: validation.expectedCharacterCount,
      hasUnexpected: validation.hasUnexpectedCharacters,
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
  });
  const imageData: ImageData[] = [
    imageDataForGenerated(
      preparedGeneratedImage,
      'Image 1: GENERATED FULL COMIC PAGE. Validate panel-by-panel against the expected panel list.'
    ),
    ...(preparedReferenceImages || []).map((ref, index) => imageDataForReference(ref, index + 2)),
  ];
  const passesManifest: Array<Record<string, unknown>> = [];
  const requestManifest: Record<string, unknown> = {
    version: 1,
    validationSystemInstruction: 'image_validation_graphic_novel_panels_v1',
    operation,
    mode: 'single_request_panel_array',
    pageNumber: input.pageNumber,
    expectedPanelCount: input.panels.length,
    pageCharacters: pageCharacters.map((character) => ({
      name: character.name,
      characterKind: character.characterKind,
    })),
    expectedPanels: input.panels.map((panel) => ({
      panelNumber: panel.panelNumber,
      panelId: panel.panelId,
      expectedVisualFocus: panel.expectedVisualFocus,
      expectedSetting: panel.expectedSetting ?? null,
      expectedCharacters: panel.expectedCharacters.map((character) => ({
        name: character.name,
        characterKind: character.characterKind,
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
          matchesOutfit: false,
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
 * Run the same validation pipeline as production: Image 1 = generated scene, then identity refs;
 * prompt from buildImageValidationPrompt; schema IMAGE_VALIDATION_SCHEMA; temperature 0.2; relaxedSafety true.
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
          (r, i) =>
            `${i + 2}_${r.identitySource === 'turnaround' ? 'identity_turnaround' : (r.referenceKind ?? 'identity')}_${r.characterName}`
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

  const outfitLine = input.sceneCharacterOutfitsText?.trim();
  const hasReferenceImages = (preparedReferenceImages?.length ?? 0) > 0;
  const cachedPrefix = getImageValidationCachedPrefix(hasReferenceImages);

  const imageOrder = [
    '1_generated_illustration',
    ...(preparedReferenceImages ?? []).map(
      (r, i) =>
        `${i + 2}_${r.identitySource === 'turnaround' ? 'identity_turnaround' : (r.referenceKind ?? 'identity')}_${r.characterName}`
    ),
  ];
  const requestManifest: Record<string, unknown> = {
    version: 1,
    validationSystemInstruction: 'image_validation_qa_v1',
    cacheKey: cachedPrefix.key,
    operation,
    includeLayoutChecks: input.includeLayoutChecks === true,
    includeBubbleChecks: input.includeBubbleChecks !== false,
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
      promptMode
    );
    const sceneContext = buildCompactValidationSceneManifest(
      input.sceneVisual,
      outfitLine,
      promptMode
    );
    const prompt = buildImageValidationRuntimePrompt({
      expectedCharacters: expectedCharactersForPrompt,
      sceneContext,
      referenceImages: preparedReferenceImages,
      includeLayoutChecks: input.includeLayoutChecks,
      includeBubbleChecks: input.includeBubbleChecks,
    });
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
    };
    manifestAttempts.push(attemptManifest);

    try {
      const raw = await attemptSpec.provider.generateStructured<ImageValidationResult>({
        model: attemptSpec.model,
        systemInstruction: IMAGE_VALIDATION_SYSTEM_INSTRUCTION,
        prompt,
        cachedPrefix,
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
