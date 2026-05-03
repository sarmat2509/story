/**
 * Single implementation of product image validation (Vision + structured JSON).
 * Used by ImageDomainService and diagnostic scripts so prompt, schema, image order, and temperature match production.
 */

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
} from '../../prompts/image/ImageValidationPrompt';
import { IMAGE_VALIDATION_SCHEMA } from '../story/schemas';
import { flattenCameraComposition, type SceneVisual } from '../../services/types';
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
    referenceKind?: 'identity' | 'outfit_plate';
  }>;
  /** Optional ids for structured logs (what we send to the vision model). */
  logContext?: { storyId?: string; sceneId?: number; attempt?: number };
  onUsage?: (usage: UsageMetadata) => void;
};

export type ProductImageValidationOptions = {
  /** Model id passed to the text provider (e.g. gemini-2.5-flash, gpt-4o). */
  visionModel?: string;
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

function normalizeVisionMimeType(mimeType: string): SupportedVisionMimeType {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === 'image/jpg' || normalized === 'image/jpeg') return 'image/jpeg';
  if (normalized === 'image/webp') return 'image/webp';
  if (normalized === 'image/gif') return 'image/gif';
  return 'image/png';
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
  refs: ReadonlyArray<{ characterName: string; imageData?: string; fileUri?: string }> | undefined
): boolean {
  if (!refs?.length) return false;
  return refs.some((r) => validationNamesMatch(r.characterName, charName));
}

/**
 * Strip legacy model field and log structural inconsistencies (acceptance uses score only in orchestration).
 */
export function normalizeImageValidationResult(
  result: ImageValidationResult & { isValid?: boolean },
  expectedCharacters: ProductImageValidationInput['expectedCharacters'],
  referenceImages: ProductImageValidationInput['referenceImages'] | undefined
): ImageValidationResult {
  const { isValid: _ignored, ...rest } = result;
  const out = { ...rest } as ImageValidationResult;

  for (const c of out.characters) {
    const exp = findExpectedForValidationChar(c.name, expectedCharacters);
    const expectedKind = exp?.characterKind ?? null;
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
      imageOrderToModel: [
        '1_generated_illustration',
        ...(preparedReferenceImages ?? []).map((r, i) => `${i + 2}_reference_${r.characterName}`),
      ],
      totalAttachmentCount: 1 + refMeta.length,
    },
    'Image validation: sending generated scene + identity references to Vision model'
  );

  const imageDataArray: Array<{
    mimeType: SupportedVisionMimeType;
    data: string;
    fileUri?: string;
  }> = [
    {
      mimeType: preparedGeneratedImage.mimeType,
      data: preparedGeneratedImage.buffer.toString('base64'),
    },
  ];

  if (preparedReferenceImages && preparedReferenceImages.length > 0) {
    for (const ref of preparedReferenceImages) {
      imageDataArray.push({
        mimeType: normalizeVisionMimeType(ref.mimeType),
        data: ref.imageData || '',
        fileUri: ref.fileUri,
      });
    }
  }

  const { text: compositionText } = flattenCameraComposition(input.sceneVisual.cameraComposition);
  const sceneSetting = input.sceneVisual.setting?.trim();
  const sceneLighting = input.sceneVisual.lighting?.trim();
  const cameraComposition = input.sceneVisual.cameraComposition;
  const shotText =
    typeof cameraComposition === 'string' ? undefined : cameraComposition.shot?.trim();
  const characterDirectionLines =
    typeof cameraComposition === 'string'
      ? []
      : cameraComposition.characters
          .map((char) => {
            const description = char.description?.trim();
            return description ? `${char.name}: ${description}` : char.name;
          })
          .filter(Boolean);
  const outfitLine = input.sceneCharacterOutfitsText?.trim();
  const sceneContext = [
    'This designer scene brief is authoritative for the specific scene moment.',
    'If it requests temporary scene-driven changes like transparency, glow, shimmering outline, magical aura, expression, pose, motion, or emotional state, those details have priority over the neutral/default state visible in identity references.',
    sceneSetting ? `SETTING: ${sceneSetting}` : undefined,
    sceneLighting ? `LIGHTING: ${sceneLighting}` : undefined,
    shotText ? `SHOT: ${shotText}` : undefined,
    characterDirectionLines.length > 0
      ? `CHARACTER DIRECTIONS:\n${characterDirectionLines.map((line) => `- ${line}`).join('\n')}`
      : compositionText
        ? `CAMERA COMPOSITION:\n${compositionText}`
        : undefined,
    outfitLine
      ? `CHARACTER OUTFITS (authoritative for clothing and accessories in this scene; identity references are not wardrobe ground truth): ${outfitLine}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const hasReferenceImages = (input.referenceImages?.length ?? 0) > 0;
  const prompt = buildImageValidationRuntimePrompt({
    expectedCharacters: input.expectedCharacters,
    sceneContext: sceneContext || undefined,
    referenceImages: preparedReferenceImages,
  });
  const cachedPrefix = getImageValidationCachedPrefix(hasReferenceImages);

  try {
    const raw = await textProvider.generateStructured<ImageValidationResult>({
      model: visionModel,
      prompt,
      cachedPrefix,
      imageData: imageDataArray,
      schema: IMAGE_VALIDATION_SCHEMA,
      temperature: 0.2,
      relaxedSafety: true,
      onUsage: input.onUsage,
      operation,
    });

    const result = normalizeImageValidationResult(
      raw,
      input.expectedCharacters,
      preparedReferenceImages
    );

    const issueSummaries = result.characters
      .map((c) => summarizeValidationIssues(c, input.expectedCharacters, input.referenceImages))
      .filter((s): s is string => s != null);

    logger.info(
      {
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

    if (errorMsg.includes('PROHIBITED_CONTENT') || errorMsg.includes('blocked')) {
      void recordModerationDecision({
        storyId: input.logContext?.storyId,
        stage: 'generated_image_validation',
        source: 'image_validation_provider',
        subjectType: 'scene_image',
        subjectRefHash: hashModerationSubject(
          `${input.logContext?.storyId ?? 'story'}:${input.logContext?.sceneId ?? 'scene'}:${input.logContext?.attempt ?? 'attempt'}`
        ),
        decision: 'blocked',
        code: 'IMAGE_VALIDATION_PROVIDER_BLOCKED',
        category: 'provider_safety_filter',
        metadata: {
          sceneId: input.logContext?.sceneId,
          attempt: input.logContext?.attempt,
          expectedCharacterCount: input.expectedCharacters.length,
        },
      });
      logger.warn(
        { ...input.logContext, error: errorMsg },
        'Image validation blocked by safety filter — returning skipped result (no auto-pass)'
      );

      // Return a deterministic "skipped" result. recognizableScore is deliberately below the
      // default acceptance threshold so orchestration does not silently accept the image; the
      // retry loop / catch path decides what to do next. Identity booleans stay null so nothing
      // downstream can mistake this for a real vision verdict.
      return {
        characterCount: input.expectedCharacters.length,
        expectedCharacterCount: input.expectedCharacters.length,
        characters: input.expectedCharacters.map((c) => ({
          name: c.name,
          characterKind: c.characterKind,
          found: false,
          duplicated: false,
          recognizableScore: 0.5,
          faceMatchesReference: null,
          hairMatchesReference: null,
          ageReadMatchesReference: null,
          proportionsMatchReference: null,
          matchesColors: false,
          matchesOutfit: false,
          identityComparisonSummary: 'Validation safety-auto-skipped — no visual verdict.',
          issue: 'safety_auto_skipped',
        })),
        hasUnexpectedCharacters: false,
        hasTextOrLetters: false,
        hasRenderingArtifacts: false,
        overallFeedback: `safety-auto-skipped: ${errorMsg}`,
      };
    }

    void recordModerationDecision({
      storyId: input.logContext?.storyId,
      stage: 'generated_image_validation',
      source: 'image_validation_provider',
      subjectType: 'scene_image',
      subjectRefHash: hashModerationSubject(
        `${input.logContext?.storyId ?? 'story'}:${input.logContext?.sceneId ?? 'scene'}:${input.logContext?.attempt ?? 'attempt'}`
      ),
      decision: 'failed',
      code: 'IMAGE_VALIDATION_FAILED',
      metadata: {
        sceneId: input.logContext?.sceneId,
        attempt: input.logContext?.attempt,
        errorName: error instanceof Error ? error.name : typeof error,
      },
    });
    logger.error(
      {
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
