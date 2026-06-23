/**
 * Re-run the current image validator against a stored validation image.
 *
 * Default target is the problematic validation row from story 3d0de735...
 *
 * Usage from services/api:
 *   pnpm exec tsx src/scripts/recheckProblemImageValidation.ts
 *   pnpm exec tsx src/scripts/recheckProblemImageValidation.ts --validation-id c3bd695d-6aa4-43de-8847-f85cc9583483
 *   pnpm exec tsx src/scripts/recheckProblemImageValidation.ts --validation-id ... --show-prompts
 *   pnpm exec tsx src/scripts/recheckProblemImageValidation.ts --validation-id ... --edit-repair
 *   pnpm exec tsx src/scripts/recheckProblemImageValidation.ts --validation-id ... --edit-repair --identity-ref front
 *   pnpm exec tsx src/scripts/recheckProblemImageValidation.ts --validation-id ... --edit-repair --identity-ref front --replace-head-for-hair
 *   pnpm exec tsx src/scripts/recheckProblemImageValidation.ts --validation-id ... --edit-repair --identity-ref front --force-head-repair
 *   pnpm exec tsx src/scripts/recheckProblemImageValidation.ts --validation-id ... --edit-repair --identity-ref front --force-head-repair --hair-crop-reference
 */

import './loadEnvForScripts';

import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { stripCharacterIdFromName } from '@wondertales/shared';
import config from '../config';
import { getImageDomainService } from '../services/aiService';
import { GeminiTextProvider } from '../providers/text/gemini';
import { OpenAITextProvider } from '../providers/text/openai';
import { runProductImageValidation } from '../domain/image/imageValidationRun';
import { computeValidationScore } from '../services/storyOrchestrationService';
import {
  buildImageEditSystemInstruction,
  type ImageEditRepairManifest,
  type ImageEditRepairIssue,
  type ImageEditRepairIssueKind,
} from '../prompts/image/ImageEditPrompt';
import type { SceneVisual } from '../services/types';
import type { ImageValidationResult } from '../ai/types';
import type { ITextProvider } from '../providers/base/ITextProvider';
import type { UsageMetadata } from '../providers/base/UsageMetadata';

const DEFAULT_VALIDATION_ID = '8675d127-d68d-4fee-b11d-94cd27aa1313';
const API_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_ROOT = path.join(API_ROOT, 'uploads');

type IdentityRefMode = 'turnaround' | 'front';

type Args = {
  validationId: string;
  showPrompts: boolean;
  editRepair: boolean;
  identityRefMode: IdentityRefMode;
  replaceHeadForHair: boolean;
  forceHeadRepair: boolean;
  hairCropReference: boolean;
  outputDir?: string;
};

type CharacterRow = {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  descriptionEn?: string | null;
  ai_generated_description: string | null;
  aiGeneratedDescription?: string | null;
  description_en: string | null;
  referencePhotos?: unknown;
  reference_photos: unknown;
  turnaroundSheet?: unknown;
  turnaround_sheet: unknown;
  source?: string;
};

type StoryScene = {
  sceneId: number;
  primaryRead?: string;
  text?: string;
  environmentId?: string;
  sceneVisual?: SceneVisual;
  characterOutfitIds?: Record<string, string>;
};

type ValidationReferenceImage = {
  characterName: string;
  imageData: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  referenceKind: 'identity' | 'outfit_plate' | 'hairstyle_crop';
  source: string;
  outfitId?: string;
  outfitText?: string;
  environmentId?: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let validationId = DEFAULT_VALIDATION_ID;
  let showPrompts = false;
  let editRepair = false;
  let identityRefMode: IdentityRefMode = 'turnaround';
  let replaceHeadForHair = false;
  let forceHeadRepair = false;
  let hairCropReference = false;
  let outputDir: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--validation-id' && argv[i + 1]) {
      validationId = argv[++i];
    } else if (arg === '--show-prompts') {
      showPrompts = true;
    } else if (arg === '--edit-repair') {
      editRepair = true;
    } else if (arg === '--replace-head-for-hair' || arg === '--head-repair') {
      replaceHeadForHair = true;
    } else if (arg === '--force-head-repair') {
      forceHeadRepair = true;
    } else if (arg === '--hair-crop-reference' || arg === '--hairstyle-crop') {
      hairCropReference = true;
    } else if ((arg === '--identity-ref' || arg === '--identity-reference') && argv[i + 1]) {
      const value = argv[++i];
      if (value !== 'front' && value !== 'turnaround') {
        throw new Error(`Invalid --identity-ref value "${value}". Expected "front" or "turnaround".`);
      }
      identityRefMode = value;
    } else if (arg === '--output-dir' && argv[i + 1]) {
      outputDir = argv[++i];
    }
  }

  return {
    validationId,
    showPrompts,
    editRepair,
    identityRefMode,
    replaceHeadForHair,
    forceHeadRepair,
    hairCropReference,
    outputDir,
  };
}

function mimeFromPath(filePath: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function extensionFromMime(mimeType: string): 'jpg' | 'png' | 'webp' | 'gif' {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'jpg';
}

function extractStoragePath(value: string): string {
  const trimmed = value.trim();
  const apiAssetMarker = '/api/v1/assets/';
  const markerIndex = trimmed.indexOf(apiAssetMarker);
  if (markerIndex >= 0) return trimmed.slice(markerIndex + apiAssetMarker.length);
  if (trimmed.startsWith('uploads/')) return trimmed.slice('uploads/'.length);
  if (/^(development|production|test)\//.test(trimmed)) return trimmed;
  return trimmed;
}

function localUploadPath(storagePathOrUrl: string): string | null {
  const storagePath = extractStoragePath(storagePathOrUrl);
  if (path.isAbsolute(storagePath) && fs.existsSync(storagePath)) return storagePath;
  const candidate = path.join(UPLOADS_ROOT, storagePath);
  return fs.existsSync(candidate) ? candidate : null;
}

async function readImage(storagePathOrUrl: string): Promise<{
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  source: string;
}> {
  const local = localUploadPath(storagePathOrUrl);
  if (local) {
    return {
      buffer: fs.readFileSync(local),
      mimeType: mimeFromPath(local),
      source: local,
    };
  }

  if (/^https?:\/\//i.test(storagePathOrUrl)) {
    const response = await fetch(storagePathOrUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${storagePathOrUrl}: ${response.status}`);
    }
    const contentType = response.headers.get('content-type') || 'image/png';
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: contentType.includes('jpeg')
        ? 'image/jpeg'
        : contentType.includes('webp')
          ? 'image/webp'
          : contentType.includes('gif')
            ? 'image/gif'
            : 'image/png',
      source: storagePathOrUrl,
    };
  }

  throw new Error(`Cannot resolve image path or URL: ${storagePathOrUrl}`);
}

function normalizeName(name: string): string {
  return stripCharacterIdFromName(name).trim().toLowerCase();
}

function kindForCharacter(type: string): 'human' | 'animal' | 'imaginary' {
  if (type === 'animal') return 'animal';
  if (type === 'imaginary' || type === 'creature') return 'imaginary';
  return 'human';
}

function characterDescription(char: CharacterRow): string {
  return (
    char.descriptionEn?.trim() ||
    char.description_en?.trim() ||
    char.aiGeneratedDescription?.trim() ||
    char.ai_generated_description?.trim() ||
    char.description?.trim() ||
    char.name
  );
}

function turnaroundUrl(char: CharacterRow, mode: IdentityRefMode = 'turnaround'): string | undefined {
  const sheet = (char.turnaround_sheet || char.turnaroundSheet) as
    | { frontUrl?: string; url?: string }
    | null
    | undefined;
  if (mode === 'front') return sheet?.frontUrl?.trim() || undefined;
  return sheet?.url?.trim() || sheet?.frontUrl?.trim() || undefined;
}

function referencePhotoUrl(char: CharacterRow): string | undefined {
  const photoValue = char.reference_photos || char.referencePhotos;
  const photos = Array.isArray(photoValue) ? photoValue : [];
  const first = photos.find((photo) => photo && typeof photo === 'object' && 'url' in photo) as
    | { url?: string }
    | undefined;
  return first?.url?.trim() || undefined;
}

function hasVisualReference(char: CharacterRow): boolean {
  return Boolean(turnaroundUrl(char, 'turnaround') || turnaroundUrl(char, 'front') || referencePhotoUrl(char));
}

function mergeCharacterRows(dbCharacters: CharacterRow[], metadata: Record<string, unknown> | null) {
  const rows: CharacterRow[] = [];
  const merged = metadata?.mergedCharacters;
  const llm = metadata?.llmGeneratedCharacters;
  if (Array.isArray(merged)) rows.push(...(merged as CharacterRow[]));
  if (Array.isArray(llm)) rows.push(...(llm as CharacterRow[]));
  rows.push(...dbCharacters);

  const byName = new Map<string, CharacterRow>();
  for (const row of rows) {
    if (!row?.name) continue;
    const key = normalizeName(row.name);
    if (!key) continue;

    const existing = byName.get(key);
    if (!existing || (!hasVisualReference(existing) && hasVisualReference(row))) {
      byName.set(key, row);
    }
  }

  return [...byName.values()];
}

async function buildReferenceImages(
  characters: CharacterRow[],
  expectedNames: string[],
  identityRefMode: IdentityRefMode
) {
  const refs: ValidationReferenceImage[] = [];

  for (const name of expectedNames) {
    const char = characters.find((c) => normalizeName(c.name) === normalizeName(name));
    if (!char) continue;

    const sourceUrl = turnaroundUrl(char, identityRefMode) || referencePhotoUrl(char);
    if (!sourceUrl) continue;

    const image = await readImage(sourceUrl);
    refs.push({
      characterName: char.name,
      imageData: image.buffer.toString('base64'),
      mimeType: image.mimeType,
      referenceKind: 'identity',
      source: image.source,
    });
  }

  return refs;
}

async function buildOutfitPlateReferenceImages(params: {
  pool: Pool;
  storyId: string;
  scene: StoryScene;
}): Promise<ValidationReferenceImage[]> {
  const refs: ValidationReferenceImage[] = [];
  const characterOutfitIds = params.scene.characterOutfitIds;
  if (!characterOutfitIds || Object.keys(characterOutfitIds).length === 0) return refs;

  for (const [characterName, outfitId] of Object.entries(characterOutfitIds)) {
    if (!outfitId?.trim() || /^o_.*natural/i.test(outfitId)) continue;

    const characterKey = `${normalizeName(characterName)}::${outfitId.trim()}`;
    const exactEnvironmentQuery = params.scene.environmentId
      ? await params.pool.query(
          `
            select sop.story_environment_id, opc.storage_path, opc.outfit_text
            from story_outfit_plate_cache sop
            join outfit_plate_cache opc on opc.id = sop.cache_id
            where sop.story_id = $1
              and sop.character_key = $2
              and sop.story_environment_id = $3
            order by sop.created_at desc
            limit 1
          `,
          [params.storyId, characterKey, params.scene.environmentId]
        )
      : { rows: [] };
    const fallbackQuery =
      exactEnvironmentQuery.rows[0] ||
      (
        await params.pool.query(
          `
            select sop.story_environment_id, opc.storage_path, opc.outfit_text
            from story_outfit_plate_cache sop
            join outfit_plate_cache opc on opc.id = sop.cache_id
            where sop.story_id = $1
              and sop.character_key = $2
            order by sop.created_at desc
            limit 1
          `,
          [params.storyId, characterKey]
        )
      ).rows[0];
    const row = fallbackQuery as
      | {
          story_environment_id: string;
          storage_path: string;
          outfit_text: string;
        }
      | undefined;
    if (!row?.storage_path) continue;

    const image = await readImage(row.storage_path);
    refs.push({
      characterName,
      imageData: image.buffer.toString('base64'),
      mimeType: image.mimeType,
      referenceKind: 'outfit_plate',
      source: image.source,
      outfitId,
      outfitText: row.outfit_text,
      environmentId: row.story_environment_id,
    });
  }

  return refs;
}

function buildEditReferenceImages(refs: ValidationReferenceImage[]) {
  return refs.map((ref) => ({
    base64Data: ref.imageData,
    mimeType: ref.mimeType,
    characterName: ref.characterName,
    source: ref.source,
    referenceKind: ref.referenceKind === 'outfit_plate' ? ('object' as const) : ('character' as const),
    instructionText:
      ref.referenceKind === 'outfit_plate'
        ? 'CLOTHES SOURCE. Use only the clothing and accessories from this reference. Do not use this image for face, hair, body, age, silhouette, pose, background, or scene layout. Do not draw the mannequin.'
        : ref.referenceKind === 'hairstyle_crop'
          ? 'HAIRSTYLE SOURCE. Use this enlarged crop only for hairstyle structure and hair color zoning: hairline, parting, braids, ponytail/bun placement, natural/base-color regions, dyed/accent-color regions, and streak placement. Do not use this crop for clothing, body, pose, background, or scene layout.'
        : 'PERSON SOURCE. Use this reference only for identity traits listed in the validator issues: hairstyle, face/head identity, age read, body proportions, silhouette, skin and hair palette, and stable marks.',
  }));
}

async function createHairstyleCropReference(
  ref: ValidationReferenceImage
): Promise<ValidationReferenceImage | null> {
  try {
    const input = Buffer.from(ref.imageData, 'base64');
    const meta = await sharp(input, { animated: false }).rotate().metadata();
    if (!meta.width || !meta.height) return null;

    const cropHeight = Math.max(1, Math.min(meta.height, Math.round(meta.height * 0.42)));
    const crop = await sharp(input, { animated: false })
      .rotate()
      .extract({ left: 0, top: 0, width: meta.width, height: cropHeight })
      .resize({ width: 768, withoutEnlargement: false })
      .png()
      .toBuffer();

    return {
      ...ref,
      imageData: crop.toString('base64'),
      mimeType: 'image/png',
      referenceKind: 'hairstyle_crop',
      source: `${ref.source}#hairstyle-crop`,
    };
  } catch (error) {
    console.warn('Could not create hairstyle crop reference:', error);
    return null;
  }
}

function validationCharacterNeedsIdentityRepair(c: ImageValidationResult['characters'][0]): boolean {
  return (
    !c.found ||
    c.faceMatchesReference === false ||
    c.hairMatchesReference === false ||
    c.ageReadMatchesReference === false ||
    c.proportionsMatchReference === false ||
    c.sameOverallDesignRead === false ||
    (c.silhouetteDriftSeverity !== undefined && c.silhouetteDriftSeverity !== 'none') ||
    c.recognizableScore < config.image.validationScoring.humanLowRecognizableThreshold ||
    c.matchesColors === false
  );
}

function validationCharacterNeedsOutfitRepair(c: ImageValidationResult['characters'][0]): boolean {
  return !c.found || c.matchesOutfit === false;
}

function compactValidationText(text: string | null | undefined): string | null {
  const cleaned = text
    ?.replace(/\s+/g, ' ')
    .replace(/\s*\[ID:[^\]]+\]/gi, '')
    .trim();
  return cleaned || null;
}

function makeRepairIssue(kind: ImageEditRepairIssueKind, note: string | null | undefined): ImageEditRepairIssue {
  return {
    kind,
    note: note || 'Visual mismatch with the selected reference.',
  };
}

function shouldIncludeSilhouetteRepairIssue(c: ImageValidationResult['characters'][0]): boolean {
  if (!c.silhouetteDriftSeverity || c.silhouetteDriftSeverity === 'none') {
    return false;
  }

  const hasMoreSpecificIdentityIssue =
    c.faceMatchesReference === false ||
    c.hairMatchesReference === false ||
    c.ageReadMatchesReference === false ||
    c.proportionsMatchReference === false ||
    c.sameOverallDesignRead === false;

  return c.silhouetteDriftSeverity !== 'mild' || !hasMoreSpecificIdentityIssue;
}

function collectTargetedRepairIssues(
  validation: ImageValidationResult,
  options: { replaceHeadForHair?: boolean; forceHeadRepair?: boolean } = {}
): ImageEditRepairIssue[] {
  const issues: ImageEditRepairIssue[] = [];
  if (options.forceHeadRepair) {
    const human = validation.characters.find((c) => c.characterKind === 'human');
    if (human) {
      const note = compactValidationText(human.issue) || compactValidationText(human.identityComparisonSummary);
      return [
        makeRepairIssue('head', note || 'Forced diagnostic head-and-hair identity replacement.'),
      ];
    }
  }

  for (const c of validation.characters) {
    const needsRepair =
      validationCharacterNeedsIdentityRepair(c) ||
      validationCharacterNeedsOutfitRepair(c) ||
      c.duplicated;
    if (!needsRepair) continue;

    const note = compactValidationText(c.issue) || compactValidationText(c.identityComparisonSummary);
    if (!c.found) issues.push(makeRepairIssue('presence', note || 'Missing expected subject.'));
    if (c.duplicated) issues.push(makeRepairIssue('duplicate', note || 'Duplicate subject.'));
    if (c.faceMatchesReference === false) issues.push(makeRepairIssue('face', note || 'Face/head identity mismatch.'));
    if (c.hairMatchesReference === false) {
      issues.push(
        makeRepairIssue(
          options.replaceHeadForHair ? 'head' : 'hair',
          note || 'Hairstyle mismatch.'
        )
      );
    }
    if (c.ageReadMatchesReference === false) issues.push(makeRepairIssue('age', note || 'Age read mismatch.'));
    if (c.proportionsMatchReference === false) issues.push(makeRepairIssue('body', note || 'Body proportion mismatch.'));
    if (c.sameOverallDesignRead === false) issues.push(makeRepairIssue('design', note || 'Overall design mismatch.'));
    if (shouldIncludeSilhouetteRepairIssue(c)) {
      issues.push(makeRepairIssue('silhouette', note || `${c.silhouetteDriftSeverity} silhouette drift.`));
    }
    if (c.matchesColors === false) issues.push(makeRepairIssue('colors', note || 'Color mismatch.'));
    if (c.matchesOutfit === false) issues.push(makeRepairIssue('outfit', note || 'Wardrobe/accessory mismatch.'));
  }

  if (validation.hasUnexpectedCharacters) issues.push(makeRepairIssue('unexpected', 'Unexpected extra subject.'));
  if (validation.hasTextOrLetters) issues.push(makeRepairIssue('text', 'Visible text or lettering.'));

  const overall = compactValidationText(validation.overallFeedback);
  if (issues.length === 0 && overall) issues.push(makeRepairIssue('generic', overall));
  return issues.slice(0, 4);
}

async function buildTargetedEditRepairPlan(
  refs: ValidationReferenceImage[],
  validation: ImageValidationResult,
  options: {
    replaceHeadForHair?: boolean;
    forceHeadRepair?: boolean;
    hairCropReference?: boolean;
  } = {}
) {
  const needsByName = new Map<string, { displayName: string; identity: boolean; outfit: boolean }>();
  for (const c of validation.characters) {
    const key = normalizeName(c.name);
    if (!key) continue;
    const identity = validationCharacterNeedsIdentityRepair(c);
    const outfit = validationCharacterNeedsOutfitRepair(c);
    if (identity || outfit) needsByName.set(key, { displayName: c.name, identity, outfit });
  }

  if (options.forceHeadRepair && ![...needsByName.values()].some((needs) => needs.identity)) {
    const human = validation.characters.find((c) => c.characterKind === 'human');
    if (human) {
      const key = normalizeName(human.name);
      if (key) needsByName.set(key, { displayName: human.name, identity: true, outfit: false });
    }
  }

  const issues = collectTargetedRepairIssues(validation, options);
  let selectedRaw = refs.filter((ref) => {
    const needs = needsByName.get(normalizeName(ref.characterName));
    if (!needs) return false;
    if (ref.referenceKind === 'outfit_plate') return needs.outfit;
    return needs.identity;
  });

  const needsHairDetail = issues.some((issue) => issue.kind === 'hair' || issue.kind === 'head');
  if (options.hairCropReference && needsHairDetail) {
    const cropRefs = (
      await Promise.all(
        selectedRaw
          .filter((ref) => ref.referenceKind === 'identity')
          .map((ref) => createHairstyleCropReference(ref))
      )
    ).filter((ref): ref is ValidationReferenceImage => !!ref);
    selectedRaw = [...cropRefs, ...selectedRaw];
  }

  const selected = buildEditReferenceImages(selectedRaw);
  const needs = [...needsByName.values()];
  const identityNames = needs.filter((n) => n.identity).map((n) => n.displayName);
  const outfitNames = needs.filter((n) => n.outfit).map((n) => n.displayName);
  const hasIdentity = identityNames.length > 0;
  const hasOutfit = outfitNames.length > 0;
  const mode =
    hasIdentity && hasOutfit
      ? 'identity_and_outfit'
      : hasIdentity
        ? 'identity'
        : hasOutfit
          ? 'outfit'
          : 'none';

  return {
    mode,
    references: selected.length > 0 ? selected : undefined,
    rawReferences: selectedRaw,
    manifest: {
      referenceMode: mode as ImageEditRepairManifest['referenceMode'],
      issues,
    },
  };
}

function buildExpectedCharacters(
  sceneVisual: SceneVisual,
  characters: CharacterRow[],
  referenceNames: Set<string>
) {
  const names =
    typeof sceneVisual.cameraComposition === 'string'
      ? []
      : sceneVisual.cameraComposition.characters.map((char) => char.name);

  return names.map((name) => {
    const char = characters.find((c) => normalizeName(c.name) === normalizeName(name));
    const kind = kindForCharacter(char?.type || 'person');
    const hasRef = referenceNames.has(normalizeName(char?.name || name));
    return {
      name,
      characterKind: kind,
      speciesSubtype: char?.subtype || undefined,
      // Current validator uses reference images as primary identity ground truth.
      description: hasRef ? undefined : char ? characterDescription(char) : name,
      expectedOutfitForScene: undefined,
    };
  });
}

function summarizeResult(result: ImageValidationResult) {
  return {
    validationStatus: result.validationStatus ?? 'completed',
    validationAttemptKind: result.validationAttemptKind,
    validationModelUsed: result.validationModelUsed,
    providerError: result.providerError,
    overallFeedback: result.overallFeedback,
    characters: result.characters.map((char) => ({
      name: char.name,
      kind: char.characterKind,
      found: char.found,
      duplicated: char.duplicated,
      recognizableScore: char.recognizableScore,
      matchesColors: char.matchesColors,
      matchesOutfit: char.matchesOutfit,
      issue: char.issue,
      identityComparisonSummary: char.identityComparisonSummary,
    })),
  };
}

function scoreValidation(params: {
  result: ImageValidationResult;
  referenceNames: Set<string>;
  expectedCharacters: ReturnType<typeof buildExpectedCharacters>;
  sceneVisual: SceneVisual;
  refs: ValidationReferenceImage[];
}) {
  if (params.result.validationStatus !== 'completed') return null;
  return computeValidationScore(params.result, {
    referenceNamesNormalized: params.referenceNames,
    expectedCharacters: params.expectedCharacters,
    sceneVisual: params.sceneVisual,
    validationReferenceImages: params.refs,
  });
}

function resolveOutputDir(args: Args): string {
  if (args.outputDir) return path.resolve(args.outputDir);
  return path.join(UPLOADS_ROOT, 'validation-repair-checks', args.validationId);
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

async function validateImage(params: {
  primary: ITextProvider;
  fallback?: ITextProvider;
  imageData: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | string;
  expectedCharacters: ReturnType<typeof buildExpectedCharacters>;
  sceneVisual: SceneVisual;
  refs: ValidationReferenceImage[];
  storyId: string;
  sceneIndex: number;
  attempt: number;
  operation: string;
  usage: UsageMetadata[];
}) {
  const result = await runProductImageValidation(
    params.primary,
    {
      imageData: params.imageData,
      mimeType: params.mimeType,
      expectedCharacters: params.expectedCharacters,
      sceneVisual: params.sceneVisual,
      referenceImages: params.refs,
      logContext: {
        storyId: params.storyId,
        sceneId: params.sceneIndex,
        attempt: params.attempt,
      },
      onUsage: (event) => params.usage.push(event),
    },
    {
      visionModel: config.ai.validationModel,
      fallbackTextProvider: params.fallback,
      fallbackVisionModel: config.ai.openaiValidationModel,
      operation: params.operation,
      recordModeration: false,
    }
  );
  const referenceNames = new Set(params.refs.map((ref) => normalizeName(ref.characterName)));
  return {
    result,
    computedScore: scoreValidation({
      result,
      referenceNames,
      expectedCharacters: params.expectedCharacters,
      sceneVisual: params.sceneVisual,
      refs: params.refs,
    }),
  };
}

async function main() {
  const args = parseArgs();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://kazka:devpass@localhost:5432/kazka_dev',
  });

  try {
    const validationRow = (
      await pool.query(
        `
          select id, story_id, scene_index, attempt, image_storage_path, validation_score, vision_model
          from image_validation_results
          where id = $1
        `,
        [args.validationId]
      )
    ).rows[0] as
      | {
          id: string;
          story_id: string;
          scene_index: number;
          attempt: number;
          image_storage_path: string;
          validation_score: number | null;
          vision_model: string | null;
        }
      | undefined;

    if (!validationRow) {
      throw new Error(`Validation row not found: ${args.validationId}`);
    }

    const storyRow = (
      await pool.query(
        `
          select s.id, s.title, s.metadata, s.scenes, s.age_group,
                 sr.scenario_card_id, sr.image_style as request_image_style
          from stories s
          left join story_requests sr on sr.id = s.story_request_id or sr.story_id = s.id
          where s.id = $1
          limit 1
        `,
        [validationRow.story_id]
      )
    ).rows[0] as
      | { id: string; title: string; metadata: Record<string, unknown> | null; scenes: StoryScene[] }
        & { age_group: string; scenario_card_id: string | null; request_image_style: string | null }
      | undefined;
    if (!storyRow) throw new Error(`Story not found: ${validationRow.story_id}`);

    const scene = storyRow.scenes.find((item) => item.sceneId === validationRow.scene_index);
    if (!scene?.sceneVisual) {
      throw new Error(`Scene visual not found for scene ${validationRow.scene_index}`);
    }

    const dbCharacters = (
      await pool.query(
        `
          select c.id, c.name, c.type, c.subtype, c.description, c.ai_generated_description,
                 c.description_en, c.reference_photos, c.turnaround_sheet
          from story_characters sc
          join characters c on c.id = sc.character_id
          where sc.story_id = $1
        `,
        [validationRow.story_id]
      )
    ).rows as CharacterRow[];
    const characters = mergeCharacterRows(dbCharacters, storyRow.metadata);

    const targetImage = await readImage(validationRow.image_storage_path);
    const expectedNames =
      typeof scene.sceneVisual.cameraComposition === 'string'
        ? []
        : scene.sceneVisual.cameraComposition.characters.map((char) => char.name);
    const identityRefs = await buildReferenceImages(characters, expectedNames, args.identityRefMode);
    const outfitPlateRefs = await buildOutfitPlateReferenceImages({
      pool,
      storyId: validationRow.story_id,
      scene,
    });
    const refs = [...identityRefs, ...outfitPlateRefs];
    const referenceNames = new Set(refs.map((ref) => normalizeName(ref.characterName)));
    const expectedCharacters = buildExpectedCharacters(scene.sceneVisual, characters, referenceNames);

    const geminiKey = config.ai.geminiApiKey || process.env.GOOGLE_API_KEY || '';
    if (!geminiKey) {
      throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY');
    }

    const primary = new GeminiTextProvider(geminiKey, config.ai.validationModel);
    const fallback = config.ai.openaiApiKey
      ? new OpenAITextProvider(config.ai.openaiApiKey, config.ai.openaiValidationModel)
      : undefined;
    const usage: UsageMetadata[] = [];
    const editUsage: UsageMetadata[] = [];
    const style =
      (typeof storyRow.metadata?.imageStyle === 'string' ? storyRow.metadata.imageStyle : undefined) ||
      storyRow.request_image_style ||
      config.image.defaultStyle;
    const scenarioCardId =
      storyRow.scenario_card_id ||
      (typeof storyRow.metadata?.scenarioCardId === 'string'
        ? storyRow.metadata.scenarioCardId
        : undefined);

    console.log(
      JSON.stringify(
        {
          target: {
            validationId: validationRow.id,
            storyId: validationRow.story_id,
            title: storyRow.title,
            sceneIndex: validationRow.scene_index,
            previousScore: validationRow.validation_score,
            previousVisionModel: validationRow.vision_model,
            imageSource: targetImage.source,
          },
          validator: {
            primaryModel: config.ai.validationModel,
            fallbackModel: fallback ? config.ai.openaiValidationModel : null,
          },
          editRepair: args.editRepair
            ? {
                imageProvider: config.image.provider,
                identityRefMode: args.identityRefMode,
                replaceHeadForHair: args.replaceHeadForHair,
                forceHeadRepair: args.forceHeadRepair,
                hairCropReference: args.hairCropReference,
                style,
                ageGroup: storyRow.age_group,
                scenarioCardId,
              }
            : false,
          expectedCharacters,
          references: refs.map((ref, i) => ({
            imageIndex: i + 2,
            characterName: ref.characterName,
            referenceKind: ref.referenceKind,
            outfitId: ref.outfitId,
            mimeType: ref.mimeType,
            source: ref.source,
          })),
        },
        null,
        2
      )
    );

    const before = await validateImage({
      primary,
      fallback,
      imageData: targetImage.buffer,
      mimeType: targetImage.mimeType,
      expectedCharacters,
      sceneVisual: scene.sceneVisual,
      refs,
      storyId: validationRow.story_id,
      sceneIndex: validationRow.scene_index,
      attempt: validationRow.attempt,
      operation: 'image_validation_problem_recheck',
      usage,
    });

    console.log('\n--- Validation result: before edit ---');
    console.log(JSON.stringify({ computedScore: before.computedScore, ...summarizeResult(before.result) }, null, 2));

    const manifest = before.result.requestManifest as
      | { attempts?: Array<Record<string, unknown>> }
      | undefined;
    if (manifest?.attempts) {
      console.log('\n--- Attempt manifest ---');
      console.log(
        JSON.stringify(
          manifest.attempts.map((attempt) => {
            const { runtimePrompt, ...rest } = attempt;
            return args.showPrompts ? attempt : rest;
          }),
          null,
          2
        )
      );
    }

    if (usage.length > 0) {
      console.log('\n--- Validation usage ---');
      console.log(JSON.stringify(usage, null, 2));
    }

    if (!args.editRepair) return;

    const imageDomain = getImageDomainService();
    const outputDir = resolveOutputDir(args);
    fs.mkdirSync(outputDir, { recursive: true });

    console.log('\n--- Running imageEdit repair ---');
    const repairPlan = await buildTargetedEditRepairPlan(refs, before.result, {
      replaceHeadForHair: args.replaceHeadForHair,
      forceHeadRepair: args.forceHeadRepair,
      hairCropReference: args.hairCropReference,
    });
    console.log(JSON.stringify({
      repairMode: repairPlan.mode,
      selectedReferences: repairPlan.rawReferences.map((ref) => ({
        characterName: ref.characterName,
        referenceKind: ref.referenceKind,
        outfitId: ref.outfitId,
        source: ref.source,
      })),
      manifest: repairPlan.manifest,
    }, null, 2));

    const edited = await imageDomain.editSceneImage({
      originalImage: targetImage.buffer,
      originalMimeType: targetImage.mimeType,
      validationResult: before.result,
      aspectRatio: '16:9',
      referenceImages: repairPlan.references,
      targetedRepairManifest: repairPlan.manifest,
      systemInstruction: buildImageEditSystemInstruction(),
      personGeneration: 'allow_all',
      onUsage: (event) => editUsage.push(event),
    });

    const editedImagePath = path.join(
      outputDir,
      `scene_${validationRow.scene_index}_image_edit_${Date.now()}.${extensionFromMime(edited.mimeType)}`
    );
    fs.writeFileSync(editedImagePath, edited.imageData);

    const afterUsage: UsageMetadata[] = [];
    const after = await validateImage({
      primary,
      fallback,
      imageData: edited.imageData,
      mimeType: edited.mimeType,
      expectedCharacters,
      sceneVisual: scene.sceneVisual,
      refs,
      storyId: validationRow.story_id,
      sceneIndex: validationRow.scene_index,
      attempt: validationRow.attempt + 1,
      operation: 'image_validation_problem_recheck_after_edit',
      usage: afterUsage,
    });

    console.log('\n--- Validation result: after edit ---');
    console.log(JSON.stringify({ computedScore: after.computedScore, ...summarizeResult(after.result) }, null, 2));

    const reportPath = path.join(outputDir, `scene_${validationRow.scene_index}_edit_report.json`);
    const report = {
      target: {
        validationId: validationRow.id,
        storyId: validationRow.story_id,
        title: storyRow.title,
        sceneIndex: validationRow.scene_index,
        originalImageSource: targetImage.source,
        editedImagePath,
      },
      editRepair: {
        imageProvider: config.image.provider,
        identityRefMode: args.identityRefMode,
        style,
        ageGroup: storyRow.age_group,
        scenarioCardId,
        editedImage: {
          width: edited.width,
          height: edited.height,
          mimeType: edited.mimeType,
          format: edited.format,
        },
      },
      before: { computedScore: before.computedScore, ...summarizeResult(before.result) },
      after: { computedScore: after.computedScore, ...summarizeResult(after.result) },
      references: refs.map((ref, i) => ({
        imageIndex: i + 2,
        characterName: ref.characterName,
        referenceKind: ref.referenceKind,
        outfitId: ref.outfitId,
        mimeType: ref.mimeType,
        source: ref.source,
      })),
      repairPlan: {
        mode: repairPlan.mode,
        selectedReferences: repairPlan.rawReferences.map((ref) => ({
          characterName: ref.characterName,
          referenceKind: ref.referenceKind,
          outfitId: ref.outfitId,
          source: ref.source,
        })),
        manifest: repairPlan.manifest,
      },
      usage: {
        beforeValidation: usage,
        edit: editUsage,
        afterValidation: afterUsage,
      },
    };
    writeJson(reportPath, report);

    console.log('\n--- Edit repair artifacts ---');
    console.log(JSON.stringify({ editedImagePath, reportPath, editUsage, afterUsage }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
