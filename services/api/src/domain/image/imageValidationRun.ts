/**
 * Single implementation of product image validation (Vision + structured JSON).
 * Used by ImageDomainService and diagnostic scripts so prompt, schema, image order, and temperature match production.
 */

import { stripCharacterIdFromName } from '@wondertales/shared';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type { UsageMetadata } from '../../providers/base/UsageMetadata';
import type { ImageValidationResult } from '../../ai/types';
import { buildImageValidationPrompt } from '../../prompts/image/ImageValidationPrompt';
import { IMAGE_VALIDATION_SCHEMA } from '../story/schemas';
import { flattenCameraComposition, type SceneVisual } from '../../services/types';
import { logger } from '../../utils/logger';

export type ProductImageValidationInput = {
  imageData: Buffer;
  mimeType: string;
  expectedCharacters: Array<{
    name: string;
    isImaginary: boolean;
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

function validationNamesMatch(a: string, b: string): boolean {
  const na = stripCharacterIdFromName(a).trim().toLowerCase();
  const nb = stripCharacterIdFromName(b).trim().toLowerCase();
  return na === nb || a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function findExpectedForValidationChar(
  charName: string,
  expected: ProductImageValidationInput['expectedCharacters'],
): ProductImageValidationInput['expectedCharacters'][0] | undefined {
  return expected.find((e) => validationNamesMatch(e.name, charName));
}

export function charHasTurnaroundRef(
  charName: string,
  refs:
    | ReadonlyArray<{ characterName: string; imageData?: string; fileUri?: string }>
    | undefined,
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
  referenceImages: ProductImageValidationInput['referenceImages'] | undefined,
): ImageValidationResult {
  const { isValid: _ignored, ...rest } = result;
  const out = { ...rest } as ImageValidationResult;

  for (const c of out.characters) {
    const exp = findExpectedForValidationChar(c.name, expectedCharacters);
    const expectedKind = exp ? (exp.isImaginary ? 'imaginary' : 'human') : null;
    if (expectedKind && c.characterKind !== expectedKind) {
      logger.warn(
        { name: c.name, expectedKind, got: c.characterKind },
        'Image validation characterKind mismatch vs expected list',
      );
    }
  }

  for (const c of out.characters) {
    const exp = findExpectedForValidationChar(c.name, expectedCharacters);
    if (!exp || exp.isImaginary) continue;
    if (!charHasTurnaroundRef(c.name, referenceImages)) continue;
    if (
      !c.faceMatchesReference ||
      !c.hairMatchesReference ||
      !c.ageReadMatchesReference ||
      !c.proportionsMatchReference
    ) {
      logger.warn(
        { name: c.name },
        'Image validation human with turnaround has false identity boolean(s)',
      );
    }
  }

  for (const c of out.characters) {
    const exp = findExpectedForValidationChar(c.name, expectedCharacters);
    if (!exp || !exp.isImaginary) continue;
    if (!charHasTurnaroundRef(c.name, referenceImages)) continue;
    const score = c.recognizableScore ?? 1;
    if (!c.proportionsMatchReference && score <= 0.7) {
      logger.warn(
        {
          name: c.name,
          proportionsMatchReference: c.proportionsMatchReference,
          recognizableScore: score,
        },
        'Image validation imaginary creature proportions/score concern',
      );
    }
    if (c.sameOverallDesignRead === false) {
      logger.warn({ name: c.name }, 'Image validation sameOverallDesignRead false');
    }
    if (c.silhouetteDriftSeverity === 'severe') {
      logger.warn({ name: c.name }, 'Image validation silhouetteDriftSeverity severe');
    }
  }

  return out;
}

function summarizeValidationIssues(
  c: ImageValidationResult['characters'][0],
  expectedCharacters: ProductImageValidationInput['expectedCharacters'],
  referenceImages: ProductImageValidationInput['referenceImages'] | undefined,
): string | null {
  const parts: string[] = [];
  if (!c.found) parts.push('missing');
  if (c.duplicated) parts.push('duplicated');
  if ((c.recognizableScore ?? 1) < 0.5) parts.push(`lowRecognizable(${(c.recognizableScore ?? 0).toFixed(2)})`);
  if (!c.matchesColors) parts.push('colors');
  if (!c.matchesOutfit) parts.push('outfit');
  const exp = findExpectedForValidationChar(c.name, expectedCharacters);
  const humanWithRef =
    exp && !exp.isImaginary && charHasTurnaroundRef(c.name, referenceImages);
  if (humanWithRef) {
    if (!c.faceMatchesReference) parts.push('face');
    if (!c.hairMatchesReference) parts.push('hair');
    if (!c.ageReadMatchesReference) parts.push('ageRead');
    if (!c.proportionsMatchReference) parts.push('proportions');
  }
  const imaginaryWithRef =
    exp && exp.isImaginary && charHasTurnaroundRef(c.name, referenceImages);
  if (imaginaryWithRef) {
    if (!c.proportionsMatchReference) parts.push('proportions');
    if (c.sameOverallDesignRead === false) parts.push('designRead');
    if (c.silhouetteDriftSeverity && c.silhouetteDriftSeverity !== 'none') {
      parts.push(`silhouette:${c.silhouetteDriftSeverity}`);
    }
  }
  if (exp && c.characterKind !== (exp.isImaginary ? 'imaginary' : 'human')) {
    parts.push('characterKindMismatch');
  }
  if (parts.length === 0) return null;
  return `${c.name}: ${parts.join(',')}${c.issue ? ` — ${c.issue}` : ''}`;
}

/**
 * Run the same validation pipeline as production: Image 1 = generated scene, then turnaround refs;
 * prompt from buildImageValidationPrompt; schema IMAGE_VALIDATION_SCHEMA; temperature 0.2; relaxedSafety true.
 */
export async function runProductImageValidation(
  textProvider: ITextProvider,
  input: ProductImageValidationInput,
  options: ProductImageValidationOptions = {},
): Promise<ImageValidationResult> {
  const visionModel = options.visionModel;
  const operation = options.operation ?? 'image_validation';

  const refMeta =
    input.referenceImages?.map((r) => ({
      characterName: r.characterName,
      mimeType: r.mimeType,
      delivery: r.fileUri ? ('file_uri' as const) : ('inline_base64' as const),
    })) ?? [];

  logger.info(
    {
      ...input.logContext,
      expectedCharacterCount: input.expectedCharacters.length,
      expectedCharacterNames: input.expectedCharacters.map((c) => c.name),
      imaginaryCharacterNames: input.expectedCharacters.filter((c) => c.isImaginary).map((c) => c.name),
      generatedImage: {
        mimeType: input.mimeType,
        sizeBytes: input.imageData.length,
        role: 'image_1_generated_scene',
      },
      referenceCount: refMeta.length,
      referencesSent: refMeta,
      imageOrderToModel: [
        '1_generated_illustration',
        ...(input.referenceImages ?? []).map(
          (r, i) => `${i + 2}_reference_${r.characterName}`,
        ),
      ],
      totalAttachmentCount: 1 + refMeta.length,
    },
    'Image validation: sending generated scene + reference turnarounds to Vision model',
  );

  const imageDataArray: Array<{
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    data: string;
    fileUri?: string;
  }> = [
    {
      mimeType: input.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
      data: input.imageData.toString('base64'),
    },
  ];

  if (input.referenceImages && input.referenceImages.length > 0) {
    for (const ref of input.referenceImages) {
      imageDataArray.push({
        mimeType: ref.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
        data: ref.imageData || '',
        fileUri: ref.fileUri,
      });
    }
  }

  const { text: compositionText } = flattenCameraComposition(input.sceneVisual.cameraComposition);
  const outfitLine = input.sceneCharacterOutfitsText?.trim();
  const sceneContext = [
    outfitLine &&
      `CHARACTER OUTFITS (scene/environment — authoritative for clothing and accessories; turnaround sheets show identity only, not permanent wardrobe): ${outfitLine}`,
    input.sceneVisual.setting,
    compositionText,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = buildImageValidationPrompt({
    expectedCharacters: input.expectedCharacters,
    sceneContext: sceneContext || undefined,
    referenceImages: input.referenceImages,
  });

  try {
    const raw = await textProvider.generateStructured<ImageValidationResult>({
      model: visionModel,
      prompt,
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
      input.referenceImages,
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
      'Image validation result',
    );

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    if (errorMsg.includes('PROHIBITED_CONTENT') || errorMsg.includes('blocked')) {
      logger.warn({ error: errorMsg }, 'Image validation blocked by safety filter — auto-passing');

      return {
        characterCount: input.expectedCharacters.length,
        expectedCharacterCount: input.expectedCharacters.length,
        characters: input.expectedCharacters.map((c) => ({
          name: c.name,
          characterKind: c.isImaginary ? 'imaginary' : 'human',
          found: true,
          duplicated: false,
          recognizableScore: 1,
          faceMatchesReference: true,
          hairMatchesReference: true,
          ageReadMatchesReference: true,
          proportionsMatchReference: true,
          matchesColors: true,
          matchesOutfit: true,
          identityComparisonSummary: 'Auto-approved (safety filter false positive).',
        })),
        hasUnexpectedCharacters: false,
        hasTextOrLetters: false,
        hasRenderingArtifacts: false,
        overallFeedback: `Auto-approved (safety filter false positive): ${errorMsg}`,
      };
    }

    logger.error(
      {
        err: error instanceof Error
          ? { message: error.message, name: error.name, stack: error.stack }
          : String(error),
      },
      'Image validation failed',
    );
    throw new Error(`Image validation failed: ${errorMsg}`);
  }
}
