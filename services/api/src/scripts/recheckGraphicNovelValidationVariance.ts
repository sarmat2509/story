/**
 * Re-run the graphic novel image validator several times against the same stored validation image.
 *
 * Usage from services/api:
 *   pnpm exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id 44cdace0-2131-44bb-b84d-ec00f173d7c8 --runs 3
 *   pnpm exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id 44cdace0-2131-44bb-b84d-ec00f173d7c8 --provider openai --model gpt-5.4-nano
 *   pnpm exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id 44cdace0-2131-44bb-b84d-ec00f173d7c8 --dump-prompt-file /tmp/validation-prompt.txt
 *   pnpm exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id 44cdace0-2131-44bb-b84d-ec00f173d7c8 --mode presence-first --model gemini-3.1-flash-lite
 *   pnpm exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id 44cdace0-2131-44bb-b84d-ec00f173d7c8 --mode segmented --model gemini-3.1-flash-lite
 */

import './loadEnvForScripts';

import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { stripCharacterIdFromName } from '@wondertales/shared';
import config from '../config';
import {
  IMAGE_VALIDATION_SYSTEM_INSTRUCTION,
  runGraphicNovelPanelImageValidation,
  runProductImageValidation,
  runSegmentedProductImageValidation,
  type GraphicNovelPanelValidationInput,
} from '../domain/image/imageValidationRun';
import { computeValidationScore } from '../services/storyOrchestrationService';
import type { ImageData, JsonSchema } from '../providers/base/JsonSchema';
import type { ITextProvider } from '../providers/base/ITextProvider';
import type { UsageMetadata } from '../providers/base/UsageMetadata';
import { GeminiTextProvider } from '../providers/text/gemini';
import { OpenAITextProvider } from '../providers/text/openai';
import { getImageValidationCachedPrefix } from '../prompts/image/ImageValidationPrompt';
import { type GraphicNovelPanelScript, type PlannedGraphicNovelPage } from '../domain/graphicNovel';
import type { ImageValidationResult } from '../ai/types';
import type { SceneVisual } from '../services/types';

const API_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_ROOT = path.join(API_ROOT, 'uploads');

type Args = {
  validationId: string;
  runs: number;
  provider: 'gemini' | 'openai';
  model?: string;
  mode: 'full' | 'presence-first' | 'segmented' | 'comic-panels';
  dumpPromptFile?: string;
};

type GraphicNovelCharacterManifest = Array<{
  name: string;
  canonicalName?: string;
  nameAliases?: string[];
  type?: string;
  description?: string;
  references?: Array<{
    storagePath: string;
    source: string;
    type: string;
    isTurnaround?: boolean;
  }>;
}>;

type ValidationReferenceImage = {
  characterName: string;
  imageData?: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  referenceKind: 'identity';
  identitySource?: 'turnaround' | 'reference_photo';
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let validationId = '';
  let runs = 3;
  let provider: Args['provider'] = 'gemini';
  let model: string | undefined;
  let mode: Args['mode'] = 'full';
  let dumpPromptFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--validation-id' && argv[i + 1]) {
      validationId = argv[++i];
    } else if (arg === '--runs' && argv[i + 1]) {
      runs = Number(argv[++i]);
    } else if (arg === '--provider' && argv[i + 1]) {
      const value = argv[++i].trim().toLowerCase();
      if (value !== 'gemini' && value !== 'openai') {
        throw new Error('--provider must be "gemini" or "openai"');
      }
      provider = value;
    } else if (arg === '--model' && argv[i + 1]) {
      model = argv[++i].trim();
    } else if (arg === '--mode' && argv[i + 1]) {
      const value = argv[++i].trim().toLowerCase();
      if (
        value !== 'full' &&
        value !== 'presence-first' &&
        value !== 'segmented' &&
        value !== 'comic-panels'
      ) {
        throw new Error('--mode must be "full", "presence-first", "segmented", or "comic-panels"');
      }
      mode = value;
    } else if (arg === '--dump-prompt-file' && argv[i + 1]) {
      dumpPromptFile = argv[++i].trim();
    }
  }

  if (!validationId) {
    throw new Error('Missing --validation-id');
  }
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error('--runs must be an integer from 1 to 10');
  }

  return { validationId, runs, provider, model: model || undefined, mode, dumpPromptFile };
}

function buildPrimaryProvider(args: Args): {
  provider: ITextProvider;
  model: string;
  fallback?: ITextProvider;
  fallbackModel?: string;
} {
  if (args.provider === 'openai') {
    const model = args.model || config.ai.openaiValidationModel;
    if (!config.ai.openaiApiKey?.trim()) {
      throw new Error('OPENAI_API_KEY is required for --provider openai');
    }
    return {
      provider: new OpenAITextProvider(config.ai.openaiApiKey, model),
      model,
    };
  }

  const model = args.model || config.ai.validationModel;
  const fallback = config.ai.openaiApiKey?.trim()
    ? new OpenAITextProvider(config.ai.openaiApiKey, config.ai.openaiValidationModel)
    : undefined;
  return {
    provider: new GeminiTextProvider(config.ai.geminiApiKey, model),
    model,
    fallback,
    fallbackModel: fallback ? config.ai.openaiValidationModel : undefined,
  };
}

function normalizeName(value: string): string {
  return stripCharacterIdFromName(value).trim().toLowerCase();
}

function mimeFromPath(filePath: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function localUploadPath(storagePath: string): string {
  return path.isAbsolute(storagePath) ? storagePath : path.join(UPLOADS_ROOT, storagePath);
}

function resolveOutputPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

async function readUploadImage(storagePath: string): Promise<{
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}> {
  const fullPath = localUploadPath(storagePath);
  return {
    buffer: await fs.readFile(fullPath),
    mimeType: mimeFromPath(fullPath),
  };
}

function graphicNovelCharacterKind(type?: string): 'human' | 'animal' | 'imaginary' {
  const normalized = (type || '').toLowerCase();
  if (normalized === 'animal') return 'animal';
  if (normalized === 'imaginary' || normalized === 'creature' || normalized === 'object') {
    return 'imaginary';
  }
  return 'human';
}

function panelCharacterNames(panel: GraphicNovelPanelScript): string[] {
  const names: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed && !names.includes(trimmed)) names.push(trimmed);
  };

  for (const name of panel.charactersPresent || []) push(name);
  for (const line of [...(panel.dialogue || []), ...(panel.thoughts || [])]) push(line.speaker);
  const composition = panel.visual.sceneVisual.cameraComposition;
  if (typeof composition !== 'string') {
    for (const character of composition.characters || []) push(character.name);
  }

  return names;
}

function buildPageCharacterNames(page: PlannedGraphicNovelPage): Set<string> {
  const names = new Set<string>();
  for (const panel of page.panels) {
    for (const name of panelCharacterNames(panel.script)) {
      names.add(normalizeName(name));
    }
  }
  return names;
}

function characterMatchesPage(
  character: GraphicNovelCharacterManifest[number],
  pageNames: Set<string>
): boolean {
  const names = [character.name, character.canonicalName, ...(character.nameAliases || [])].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  return names.some((name) => pageNames.has(normalizeName(name)));
}

function buildExpectedCharacters(
  page: PlannedGraphicNovelPage,
  characters: GraphicNovelCharacterManifest
) {
  const pageNames = buildPageCharacterNames(page);
  return characters
    .filter((character) => characterMatchesPage(character, pageNames))
    .map((character) => ({
      name: character.name,
      characterKind: graphicNovelCharacterKind(character.type),
      description: character.description,
    }));
}

function buildPanelValidationInputs(
  page: PlannedGraphicNovelPage,
  expectedCharacters: ReturnType<typeof buildExpectedCharacters>
): GraphicNovelPanelValidationInput['panels'] {
  const byName = new Map(
    expectedCharacters.map((character) => [normalizeName(character.name), character])
  );
  return page.panels.map((panel, index) => {
    const expectedPanelCharacters = panelCharacterNames(panel.script)
      .map((name) => byName.get(normalizeName(name)))
      .filter(
        (character): character is ReturnType<typeof buildExpectedCharacters>[number] => !!character
      );

    return {
      panelNumber: index + 1,
      panelId: panel.script.panelId || `p${page.pageNumber}-${index + 1}`,
      expectedVisualFocus: panel.script.visual.primaryRead,
      expectedSetting: panel.script.visual.sceneVisual.setting,
      expectedCharacters: expectedPanelCharacters,
    };
  });
}

function buildGraphicNovelPageValidationSceneVisual(
  page: PlannedGraphicNovelPage,
  options?: { includeBubbleChecks?: boolean }
): SceneVisual {
  const panelBoxLines = page.panels.map((panel, index) => {
    const rect = panel.templatePanel.rect;
    return `Panel ${index + 1}: x=${rect.x.toFixed(4)}, y=${rect.y.toFixed(4)}, width=${rect.width.toFixed(4)}, height=${rect.height.toFixed(4)}`;
  });
  const includeBubbleChecks = options?.includeBubbleChecks !== false;

  return {
    setting: [
      `Graphic novel page ${page.pageNumber} using model-chosen free layout ${page.template.id}.`,
      `The page must visually contain exactly ${page.panels.length} panels, no more and no fewer.`,
      includeBubbleChecks
        ? 'Validate that each planned panel is one continuous illustration/story moment, artwork stays inside panel boxes, and artwork does not cover reserved/server-rendered bubbles.'
        : 'Validate that each planned panel is one continuous illustration/story moment and artwork stays inside panel boxes.',
      `Allowed panel boxes: ${panelBoxLines.join(' | ')}`,
    ].join(' '),
    lighting: 'N/A. This is a layout validation pass for a rendered graphic novel page.',
    cameraComposition: {
      shot: includeBubbleChecks
        ? `Full page view with exactly ${page.panels.length} planned panel boxes, gutters, and server-rendered speech/thought/caption bubbles. Extra visual panels, fake gutters, inset panels, split-screen dividers, or multiple story beats inside one planned panel are invalid.`
        : `Full page view with exactly ${page.panels.length} planned panel boxes and gutters. Extra visual panels, fake gutters, inset panels, split-screen dividers, or multiple story beats inside one planned panel are invalid.`,
      characters: page.panels.map((panel, index) => ({
        name: `Panel ${index + 1}`,
        description: [
          `Expected visual focus: ${panel.script.visual.primaryRead}`,
          `Environment id: ${panel.script.visual.environmentId}`,
          `Scene setting delta: ${panel.script.visual.sceneVisual.setting}`,
          includeBubbleChecks ? `Bubble count: ${panel.bubbles.length}` : null,
          `Characters named in panel: ${panelCharacterNames(panel.script).join(', ') || 'none'}`,
        ]
          .filter(Boolean)
          .join('. '),
      })),
    },
  };
}

async function buildValidationReferenceImages(params: {
  page: PlannedGraphicNovelPage;
  characters: GraphicNovelCharacterManifest;
}): Promise<ValidationReferenceImage[]> {
  const pageNames = buildPageCharacterNames(params.page);
  const refs: ValidationReferenceImage[] = [];

  const seenStoragePaths = new Set<string>();
  for (const character of params.characters) {
    if (!characterMatchesPage(character, pageNames)) continue;
    const ref = character.references?.find((item) => !seenStoragePaths.has(item.storagePath));
    if (!ref) continue;
    seenStoragePaths.add(ref.storagePath);

    const image = await readUploadImage(ref.storagePath);
    refs.push({
      characterName: character.name,
      imageData: image.buffer.toString('base64'),
      mimeType: image.mimeType,
      referenceKind: 'identity',
      identitySource: ref.isTurnaround ? 'turnaround' : 'reference_photo',
    });
  }

  return refs;
}

function summarizeCharacter(result: ImageValidationResult, name: string) {
  const row = result.characters.find(
    (character) => normalizeName(character.name) === normalizeName(name)
  );
  if (!row) return null;
  return {
    found: row.found,
    recognizableScore: row.recognizableScore,
    faceMatchesReference: row.faceMatchesReference,
    hairMatchesReference: row.hairMatchesReference,
    ageReadMatchesReference: row.ageReadMatchesReference,
    proportionsMatchReference: row.proportionsMatchReference,
    matchesColors: row.matchesColors,
    matchesOutfit: row.matchesOutfit,
    sameOverallDesignRead: row.sameOverallDesignRead,
    silhouetteDriftSeverity: row.silhouetteDriftSeverity,
    issue: row.issue ?? null,
    identityComparisonSummary: row.identityComparisonSummary,
  };
}

type PresenceFirstResult = {
  characters: Array<{
    name: string;
    referenceImageIndex: number;
    sameCharacterPresent: boolean;
    confidence: number;
    decisionEvidence: string;
    mainDifferences: string;
  }>;
  overallNotes: string;
};

function buildPresenceFirstSchema(): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['characters', 'overallNotes'],
    properties: {
      characters: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'referenceImageIndex',
            'sameCharacterPresent',
            'confidence',
            'decisionEvidence',
            'mainDifferences',
          ],
          properties: {
            name: { type: 'string' },
            referenceImageIndex: { type: 'integer' },
            sameCharacterPresent: { type: 'boolean' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            decisionEvidence: { type: 'string' },
            mainDifferences: { type: 'string' },
          },
        },
      },
      overallNotes: { type: 'string' },
    },
  };
}

function buildPresenceFirstPrompt(
  expectedCharacters: ReturnType<typeof buildExpectedCharacters>,
  referenceImages: ValidationReferenceImage[]
): string {
  const identityRefs = referenceImages.filter((ref) => ref.referenceKind === 'identity');
  const roster = expectedCharacters
    .map((character) => `- "${character.name}" (${character.characterKind})`)
    .join('\n');
  const refs = identityRefs
    .map(
      (ref, index) =>
        `- Image ${index + 2}: TURNAROUND identity reference for "${ref.characterName}"`
    )
    .join('\n');

  return [
    'Task: presence-first identity check.',
    'Image 1 is the generated graphic novel page. The following images are turnaround identity references only.',
    'Do not evaluate layout, bubbles, panel geometry, story text, outfit correctness, pose, facial expression, or temporary scene action.',
    'For each reference character, answer only this first-stage question: is the SAME stable character design from the turnaround visibly present anywhere in Image 1?',
    'Decision order for every character:',
    '1. Search all panels of Image 1 for a candidate that could be this exact referenced character.',
    '2. Compare stable identity only: human face/head read, age read, hairstyle structure, hair color zoning, body proportions, silhouette; for creatures compare body type, subtype/species read, silhouette, proportions, and stable markings/colors.',
    '3. If the image contains only a generic substitute or a different stable design, set sameCharacterPresent=false even if the role/name/slot seems similar.',
    '4. Only after deciding presence, briefly list the strongest matching evidence and the strongest differences.',
    'Be strict for turnaround references, but keep the task simple: first decide presence of the same model-sheet character, then explain.',
    '',
    `EXPECTED ROSTER:\n${roster}`,
    '',
    `REFERENCE IMAGE ORDER:\n${refs}`,
    '',
    'Return JSON only.',
  ].join('\n');
}

function buildPresenceFirstImageData(
  image: { buffer: Buffer; mimeType: ValidationReferenceImage['mimeType'] },
  referenceImages: ValidationReferenceImage[]
): ImageData[] {
  const imageData: ImageData[] = [
    {
      mimeType: image.mimeType,
      data: image.buffer.toString('base64'),
      instructionText:
        'Image 1: GENERATED GRAPHIC NOVEL PAGE. Search this image for the exact characters from the turnaround references.',
    },
  ];

  for (const ref of referenceImages.filter((item) => item.referenceKind === 'identity')) {
    imageData.push({
      mimeType: ref.mimeType,
      data: ref.imageData || '',
      instructionText: `Image ${imageData.length + 1}: TURNAROUND identity reference for "${ref.characterName}". Use as strict stable identity ground truth.`,
    });
  }

  return imageData;
}

function fullValidationAttachmentInstruction(params: {
  imageIndex: number;
  characterName?: string;
  referenceKind?: ValidationReferenceImage['referenceKind'];
  identitySource?: ValidationReferenceImage['identitySource'];
}): string {
  if (params.imageIndex === 1) {
    return 'Image 1: GENERATED ILLUSTRATION to inspect. Validate this image against the expected roster and references that follow.';
  }
  const name = params.characterName || 'unknown';
  if (params.identitySource === 'turnaround') {
    return `Image ${params.imageIndex}: IDENTITY TURNAROUND model sheet for "${name}". This is strict multi-view identity ground truth for face/head read, hairstyle, hair color zones, age read, body proportions, silhouette, palette, stable markings, and default clothing only when no outfit plate or scene wardrobe text exists.`;
  }
  return `Image ${params.imageIndex}: IDENTITY reference for "${name}". Use this for face, hair, age read, body proportions, silhouette, palette, stable markings, and default clothing only when no outfit plate or scene wardrobe text exists.`;
}

function buildFullValidationImageData(
  image: { buffer: Buffer; mimeType: ValidationReferenceImage['mimeType'] },
  referenceImages: ValidationReferenceImage[]
): ImageData[] {
  const imageData: ImageData[] = [
    {
      mimeType: image.mimeType,
      data: image.buffer.toString('base64'),
      instructionText: fullValidationAttachmentInstruction({ imageIndex: 1 }),
    },
  ];

  for (const ref of referenceImages) {
    imageData.push({
      mimeType: ref.mimeType,
      data: ref.imageData || '',
      instructionText: fullValidationAttachmentInstruction({
        imageIndex: imageData.length + 1,
        characterName: ref.characterName,
        referenceKind: ref.referenceKind,
        identitySource: ref.identitySource,
      }),
    });
  }

  return imageData;
}

async function writePromptDump(params: {
  filePath: string;
  provider: string;
  model: string;
  systemInstruction: string;
  cachedPrefix?: { key: string; content: string };
  runtimePrompt: string;
  imageData: ImageData[];
  requestManifest?: unknown;
}): Promise<void> {
  const outputPath = resolveOutputPath(params.filePath);
  const attachmentText = params.imageData
    .map((image, index) =>
      [
        `Image ${index + 1}:`,
        `  mimeType: ${image.mimeType}`,
        image.fileUri ? `  fileUri: ${image.fileUri}` : `  inlineBase64Bytes: ${image.data.length}`,
        image.instructionText ? `  instructionText: ${image.instructionText}` : undefined,
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');
  const content = [
    `PROVIDER: ${params.provider}`,
    `MODEL: ${params.model}`,
    '',
    '=== SYSTEM INSTRUCTION ===',
    params.systemInstruction,
    '',
    params.cachedPrefix
      ? `=== CACHED PREFIX (${params.cachedPrefix.key}) ===\n${params.cachedPrefix.content}`
      : '=== CACHED PREFIX ===\nnone',
    '',
    '=== RUNTIME PROMPT ===',
    params.runtimePrompt,
    '',
    '=== IMAGE ATTACHMENTS ===',
    attachmentText,
    '',
    params.requestManifest
      ? `=== REQUEST MANIFEST ===\n${JSON.stringify(params.requestManifest, null, 2)}`
      : undefined,
  ]
    .filter((section): section is string => section != null)
    .join('\n');

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, 'utf8');
  console.log(`Prompt dump written to ${outputPath}`);
}

async function runPresenceFirstValidation(params: {
  args: Args;
  primary: ReturnType<typeof buildPrimaryProvider>;
  image: { buffer: Buffer; mimeType: ValidationReferenceImage['mimeType'] };
  expectedCharacters: ReturnType<typeof buildExpectedCharacters>;
  referenceImages: ValidationReferenceImage[];
}): Promise<void> {
  const prompt = buildPresenceFirstPrompt(params.expectedCharacters, params.referenceImages);
  const imageData = buildPresenceFirstImageData(params.image, params.referenceImages);
  if (params.args.dumpPromptFile) {
    await writePromptDump({
      filePath: params.args.dumpPromptFile,
      provider: params.args.provider,
      model: params.primary.model,
      systemInstruction:
        'You are a visual identity QA inspector. Inspect only observable visual identity and return JSON.',
      runtimePrompt: prompt,
      imageData,
    });
  }

  const summaries: PresenceFirstResult[] = [];
  for (let index = 1; index <= params.args.runs; index++) {
    const result = await params.primary.provider.generateStructured<PresenceFirstResult>({
      model: params.primary.model,
      systemInstruction:
        'You are a visual identity QA inspector. Inspect only observable visual identity and return JSON.',
      prompt,
      schema: buildPresenceFirstSchema(),
      imageData,
      temperature: 0.1,
      relaxedSafety: true,
      operation: 'image_validation_presence_first_recheck',
    });
    summaries.push(result);
    console.log(`\n--- Presence Run ${index} ---`);
    console.log(JSON.stringify(result, null, 2));
  }

  console.log('\n--- Presence Summary ---');
  console.log(
    JSON.stringify(
      summaries.map((summary, index) => ({
        run: index + 1,
        emilia: summary.characters.find(
          (character) => normalizeName(character.name) === normalizeName('Емілія')
        ),
      })),
      null,
      2
    )
  );
}

function summarizeUsage(usages: UsageMetadata[]) {
  const totals = usages.reduce(
    (acc, usage) => {
      acc.inputUnits += usage.inputUnits ?? 0;
      acc.effectiveInputUnits += usage.effectiveInputUnits ?? usage.inputUnits ?? 0;
      acc.outputUnits += usage.outputUnits ?? 0;
      acc.cachedInputUnits += usage.cachedInputUnits ?? 0;
      acc.imageTokens += usage.imageTokens ?? 0;
      acc.durationMs += usage.durationMs ?? (usage.durationSeconds ?? 0) * 1000;
      return acc;
    },
    {
      inputUnits: 0,
      effectiveInputUnits: 0,
      outputUnits: 0,
      cachedInputUnits: 0,
      imageTokens: 0,
      durationMs: 0,
    }
  );
  return {
    calls: usages.length,
    totals,
    byOperation: usages.map((usage) => ({
      provider: usage.provider,
      model: usage.model,
      operation: usage.operation,
      inputUnits: usage.inputUnits,
      effectiveInputUnits: usage.effectiveInputUnits ?? null,
      outputUnits: usage.outputUnits ?? null,
      cachedInputUnits: usage.cachedInputUnits ?? null,
      imageTokens: usage.imageTokens ?? null,
      durationMs:
        usage.durationMs ?? (usage.durationSeconds != null ? usage.durationSeconds * 1000 : null),
    })),
  };
}

async function runSegmentedValidation(params: {
  args: Args;
  primary: ReturnType<typeof buildPrimaryProvider>;
  image: { buffer: Buffer; mimeType: ValidationReferenceImage['mimeType'] };
  page: PlannedGraphicNovelPage;
  storyId: string;
  pageNumber: number;
  originalAttempt: number;
  expectedCharacters: ReturnType<typeof buildExpectedCharacters>;
  sceneVisual: SceneVisual;
  referenceImages: ValidationReferenceImage[];
}): Promise<void> {
  const summaries: Array<Record<string, unknown>> = [];
  for (let index = 1; index <= params.args.runs; index++) {
    const usages: UsageMetadata[] = [];
    const validation = await runSegmentedProductImageValidation(
      params.primary.provider,
      {
        imageData: params.image.buffer,
        mimeType: params.image.mimeType,
        expectedCharacters: params.expectedCharacters,
        sceneVisual: params.sceneVisual,
        referenceImages: params.referenceImages,
        logContext: {
          storyId: params.storyId,
          sceneId: params.pageNumber,
          attempt: params.originalAttempt,
        },
        includeLayoutChecks: true,
        includeBubbleChecks: false,
        onUsage: (usage) => {
          usages.push(usage);
        },
      },
      {
        visionModel: params.primary.model,
        fallbackTextProvider: params.primary.fallback,
        fallbackVisionModel: params.primary.fallbackModel,
        operation: 'image_validation_graphic_novel_segmented_recheck',
        recordModeration: false,
      }
    );
    const referenceNamesNormalized = new Set(
      params.referenceImages
        .filter((ref) => ref.referenceKind === 'identity')
        .map((ref) => normalizeName(ref.characterName))
    );
    const score =
      validation.validationStatus === 'provider_blocked'
        ? null
        : computeValidationScore(validation, {
            referenceNamesNormalized,
            expectedCharacters: params.expectedCharacters,
            sceneVisual: params.sceneVisual,
            validationReferenceImages: params.referenceImages,
          });
    const summary = {
      run: index,
      score,
      validationStatus: validation.validationStatus ?? 'completed',
      validationModelUsed: validation.validationModelUsed ?? null,
      validationAttemptKind: validation.validationAttemptKind ?? null,
      passCount: Array.isArray(validation.requestManifest?.passes)
        ? validation.requestManifest.passes.length
        : null,
      layoutFeedback: validation.layoutFeedback ?? null,
      emilia: summarizeCharacter(validation, 'Емілія'),
      flash: summarizeCharacter(validation, 'Флеш'),
      syiavyk: summarizeCharacter(validation, 'Сяйвик'),
      usage: summarizeUsage(usages),
    };
    summaries.push(summary);
    console.log(`\n--- Segmented Run ${index} ---`);
    console.log(JSON.stringify(summary, null, 2));
  }

  console.log('\n--- Segmented Summary ---');
  console.log(
    JSON.stringify(
      summaries.map((summary) => ({
        run: summary.run,
        score: summary.score,
        passCount: summary.passCount,
        emilia: summary.emilia,
        usage: summary.usage,
      })),
      null,
      2
    )
  );
}

async function runComicPanelValidation(params: {
  args: Args;
  primary: ReturnType<typeof buildPrimaryProvider>;
  image: { buffer: Buffer; mimeType: ValidationReferenceImage['mimeType'] };
  page: PlannedGraphicNovelPage;
  storyId: string;
  pageNumber: number;
  originalAttempt: number;
  panelInputs: GraphicNovelPanelValidationInput['panels'];
  referenceImages: ValidationReferenceImage[];
}): Promise<void> {
  const summaries: Array<Record<string, unknown>> = [];
  for (let index = 1; index <= params.args.runs; index++) {
    const usages: UsageMetadata[] = [];
    const validation = await runGraphicNovelPanelImageValidation(
      params.primary.provider,
      {
        imageData: params.image.buffer,
        mimeType: params.image.mimeType,
        pageNumber: params.pageNumber,
        panels: params.panelInputs,
        referenceImages: params.referenceImages,
        logContext: {
          storyId: params.storyId,
          sceneId: params.pageNumber,
          attempt: params.originalAttempt,
        },
        onUsage: (usage) => usages.push(usage),
      },
      {
        visionModel: params.primary.model,
        fallbackTextProvider: params.primary.fallback,
        fallbackVisionModel: params.primary.fallbackModel,
        operation: 'image_validation_graphic_novel_panel_recheck',
        recordModeration: false,
      }
    );

    const summary = {
      run: index,
      validationStatus: validation.validationStatus ?? 'completed',
      validationModelUsed: validation.validationModelUsed ?? null,
      validationAttemptKind: validation.validationAttemptKind ?? null,
      expectedPanelCount: validation.expectedPanelCount,
      detectedPanelCount: validation.detectedPanelCount,
      hasExtraPanelStructure: validation.hasExtraPanelStructure,
      hasTextOrLetters: validation.hasTextOrLetters,
      hasRenderingArtifacts: validation.hasRenderingArtifacts,
      layoutFeedback: validation.layoutFeedback,
      overallFeedback: validation.overallFeedback,
      panels: validation.panels.map((panel) => ({
        panelNumber: panel.panelNumber,
        panelId: panel.panelId,
        panelDetected: panel.panelDetected,
        visualMatchesExpectedMoment: panel.visualMatchesExpectedMoment,
        panelIssue: panel.panelIssue ?? null,
        matchedVisiblePanelDescription: panel.matchedVisiblePanelDescription,
        characters: panel.characters.map((character) => ({
          name: character.name,
          found: character.found,
          recognizableScore: character.recognizableScore,
          faceMatchesReference: character.faceMatchesReference ?? null,
          hairMatchesReference: character.hairMatchesReference ?? null,
          ageReadMatchesReference: character.ageReadMatchesReference ?? null,
          proportionsMatchReference: character.proportionsMatchReference ?? null,
          sameOverallDesignRead: character.sameOverallDesignRead ?? null,
          silhouetteDriftSeverity: character.silhouetteDriftSeverity ?? null,
          matchesColors: character.matchesColors,
          matchesOutfit: character.matchesOutfit,
          issue: character.issue ?? null,
          identityComparisonSummary: character.identityComparisonSummary,
        })),
      })),
      usage: summarizeUsage(usages),
    };
    summaries.push(summary);

    if (index === 1 && params.args.dumpPromptFile) {
      await writePromptDump({
        filePath: params.args.dumpPromptFile,
        provider: params.args.provider,
        model: params.primary.model,
        systemInstruction: IMAGE_VALIDATION_SYSTEM_INSTRUCTION,
        runtimePrompt: String(validation.requestManifest?.prompt ?? ''),
        imageData: buildFullValidationImageData(params.image, params.referenceImages),
        requestManifest: validation.requestManifest,
      });
    }

    console.log(`\n--- Comic Panel Run ${index} ---`);
    console.log(JSON.stringify(summary, null, 2));
  }

  console.log('\n--- Comic Panel Summary ---');
  console.log(
    JSON.stringify(
      summaries.map((summary) => ({
        run: summary.run,
        expectedPanelCount: summary.expectedPanelCount,
        detectedPanelCount: summary.detectedPanelCount,
        hasExtraPanelStructure: summary.hasExtraPanelStructure,
        panels: summary.panels,
        usage: summary.usage,
      })),
      null,
      2
    )
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://kazka:devpass@localhost:5432/kazka_dev',
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

    if (!validationRow) throw new Error(`Validation row not found: ${args.validationId}`);

    const pageRow = (
      await pool.query(
        `
          select p.layout_manifest, gp.layout_json
          from graphic_novel_projects p
          join graphic_novel_pages gp on gp.project_id = p.id
          where p.story_id = $1 and gp.page_number = $2
          limit 1
        `,
        [validationRow.story_id, validationRow.scene_index]
      )
    ).rows[0] as
      | {
          layout_manifest: { characters?: GraphicNovelCharacterManifest } | null;
          layout_json: PlannedGraphicNovelPage;
        }
      | undefined;

    if (!pageRow) {
      throw new Error(
        `Graphic novel page not found for story ${validationRow.story_id}, page ${validationRow.scene_index}`
      );
    }

    const page = pageRow.layout_json;
    const characters = pageRow.layout_manifest?.characters || [];
    const expectedCharacters = buildExpectedCharacters(page, characters);
    const panelInputs = buildPanelValidationInputs(page, expectedCharacters);
    const referenceImages = await buildValidationReferenceImages({ page, characters });
    const characterReferenceImages = referenceImages.filter(
      (ref) => ref.referenceKind === 'identity'
    );
    const referenceNamesNormalized = new Set(
      characterReferenceImages.map((ref) => normalizeName(ref.characterName))
    );
    const sceneVisual = buildGraphicNovelPageValidationSceneVisual(page, {
      includeBubbleChecks: false,
    });
    const image = await readUploadImage(validationRow.image_storage_path);

    const primary = buildPrimaryProvider(args);

    console.log(
      JSON.stringify(
        {
          validationId: validationRow.id,
          storyId: validationRow.story_id,
          pageNumber: validationRow.scene_index,
          originalScore: validationRow.validation_score,
          originalVisionModel: validationRow.vision_model,
          provider: args.provider,
          model: primary.model,
          mode: args.mode,
          runs: args.runs,
          expectedCharacters,
          expectedPanels: panelInputs.map((panel) => ({
            panelNumber: panel.panelNumber,
            panelId: panel.panelId,
            expectedCharacters: panel.expectedCharacters.map((character) => character.name),
            expectedVisualFocus: panel.expectedVisualFocus,
          })),
          references: referenceImages.map((ref, index) => ({
            imageIndex: index + 2,
            characterName: ref.characterName,
            referenceKind: ref.referenceKind,
            identitySource: ref.identitySource ?? null,
          })),
        },
        null,
        2
      )
    );

    if (args.mode === 'presence-first') {
      await runPresenceFirstValidation({
        args,
        primary,
        image,
        expectedCharacters,
        referenceImages,
      });
      return;
    }

    if (args.mode === 'segmented') {
      await runSegmentedValidation({
        args,
        primary,
        image,
        page,
        storyId: validationRow.story_id,
        pageNumber: validationRow.scene_index,
        originalAttempt: validationRow.attempt,
        expectedCharacters,
        sceneVisual,
        referenceImages,
      });
      return;
    }

    if (args.mode === 'comic-panels') {
      await runComicPanelValidation({
        args,
        primary,
        image,
        page,
        storyId: validationRow.story_id,
        pageNumber: validationRow.scene_index,
        originalAttempt: validationRow.attempt,
        panelInputs,
        referenceImages,
      });
      return;
    }

    const summaries: Array<Record<string, unknown>> = [];
    for (let index = 1; index <= args.runs; index++) {
      const usages: UsageMetadata[] = [];
      const validation = await runProductImageValidation(
        primary.provider,
        {
          imageData: image.buffer,
          mimeType: image.mimeType,
          expectedCharacters,
          sceneVisual,
          referenceImages,
          logContext: {
            storyId: validationRow.story_id,
            sceneId: validationRow.scene_index,
            attempt: validationRow.attempt,
          },
          includeLayoutChecks: true,
          includeBubbleChecks: false,
          onUsage: (usage) => {
            usages.push(usage);
          },
        },
        {
          visionModel: primary.model,
          fallbackTextProvider: primary.fallback,
          fallbackVisionModel: primary.fallbackModel,
          operation: 'image_validation_graphic_novel_recheck',
          recordModeration: false,
        }
      );

      const score =
        validation.validationStatus === 'provider_blocked'
          ? null
          : computeValidationScore(validation, {
              referenceNamesNormalized,
              expectedCharacters,
              sceneVisual,
              validationReferenceImages: referenceImages,
            });

      const summary = {
        run: index,
        score,
        validationStatus: validation.validationStatus ?? 'completed',
        validationModelUsed: validation.validationModelUsed ?? null,
        validationAttemptKind: validation.validationAttemptKind ?? null,
        layoutFeedback: validation.layoutFeedback ?? null,
        emilia: summarizeCharacter(validation, 'Емілія'),
        flash: summarizeCharacter(validation, 'Флеш'),
        syiavyk: summarizeCharacter(validation, 'Сяйвик'),
        usage: summarizeUsage(usages),
      };
      summaries.push(summary);
      if (index === 1 && args.dumpPromptFile) {
        const requestManifest = validation.requestManifest as
          | { attempts?: Array<{ runtimePrompt?: string; cacheKey?: string }> }
          | undefined;
        const runtimePrompt = requestManifest?.attempts?.[0]?.runtimePrompt;
        if (!runtimePrompt) {
          throw new Error('Validation result did not include runtimePrompt in requestManifest');
        }
        const cachedPrefix = getImageValidationCachedPrefix(referenceImages.length > 0);
        await writePromptDump({
          filePath: args.dumpPromptFile,
          provider: args.provider,
          model: primary.model,
          systemInstruction: IMAGE_VALIDATION_SYSTEM_INSTRUCTION,
          cachedPrefix,
          runtimePrompt,
          imageData: buildFullValidationImageData(image, referenceImages),
          requestManifest: validation.requestManifest,
        });
      }
      console.log(`\n--- Run ${index} ---`);
      console.log(JSON.stringify(summary, null, 2));
    }

    console.log('\n--- Summary ---');
    console.log(
      JSON.stringify(
        summaries.map((summary) => ({
          run: summary.run,
          score: summary.score,
          emilia: summary.emilia,
          usage: summary.usage,
        })),
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
