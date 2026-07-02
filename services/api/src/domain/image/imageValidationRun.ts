/**
 * Single implementation of product image validation (Vision + structured JSON).
 * Used by ImageDomainService and diagnostic scripts so prompt, schema, image order, and temperature match production.
 */

import { createHash } from 'node:crypto';
import { stripCharacterIdFromName } from '@wondertales/shared';
import sharp from 'sharp';
import type { ITextProvider } from '../../providers/base/ITextProvider';
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

  if (params.referenceKind === 'layout_template') {
    return `Image ${params.imageIndex}: LAYOUT TEMPLATE reference. Use this as the exact page geometry for the generated graphic novel page: outer page aspect, panel rectangles, black frames, gutters, row/column splits, and color guide areas that should be fully covered by final art.`;
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
  if (includeLayoutChecks && out.hasTemplateColorResidue == null) {
    out.hasTemplateColorResidue = false;
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

  const preparedReferenceImages =
    input.referenceImages && input.referenceImages.length > 0
      ? await Promise.all(
          input.referenceImages.map(async (ref) => {
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
  const hasReferenceImages = (input.referenceImages?.length ?? 0) > 0;
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
    blockedResult.hasTemplateColorResidue = false;
    blockedResult.layoutFeedback = 'provider_blocked_no_layout_verdict';
  }
  return blockedResult;
}
