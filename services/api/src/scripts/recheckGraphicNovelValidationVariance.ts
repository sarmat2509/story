/**
 * Re-run the graphic novel image validator several times against the same stored validation image.
 *
 * Usage from services/api:
 *   pnpm exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id 44cdace0-2131-44bb-b84d-ec00f173d7c8 --runs 3
 *   pnpm exec tsx src/scripts/recheckGraphicNovelValidationVariance.ts --validation-id 44cdace0-2131-44bb-b84d-ec00f173d7c8 --provider openai --model gpt-5.4-nano
 */

import './loadEnvForScripts';

import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { stripCharacterIdFromName } from '@wondertales/shared';
import config from '../config';
import { runProductImageValidation } from '../domain/image/imageValidationRun';
import { computeValidationScore } from '../services/storyOrchestrationService';
import type { ITextProvider } from '../providers/base/ITextProvider';
import { GeminiTextProvider } from '../providers/text/gemini';
import { OpenAITextProvider } from '../providers/text/openai';
import {
  detectGraphicNovelTemplateColorResidue,
  renderGraphicNovelPageTemplate,
  type GraphicNovelPanelScript,
  type PlannedGraphicNovelPage,
} from '../domain/graphicNovel';
import type { ImageValidationResult } from '../ai/types';
import type { SceneVisual } from '../services/types';

const API_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_ROOT = path.join(API_ROOT, 'uploads');

type Args = {
  validationId: string;
  runs: number;
  provider: 'gemini' | 'openai';
  model?: string;
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
  referenceKind: 'identity' | 'layout_template';
  identitySource?: 'turnaround' | 'reference_photo';
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let validationId = '';
  let runs = 3;
  let provider: Args['provider'] = 'gemini';
  let model: string | undefined;

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
    }
  }

  if (!validationId) {
    throw new Error('Missing --validation-id');
  }
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error('--runs must be an integer from 1 to 10');
  }

  return { validationId, runs, provider, model: model || undefined };
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
      `Graphic novel page ${page.pageNumber} using template ${page.template.id}.`,
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
  const refs: ValidationReferenceImage[] = [
    {
      characterName: `Graphic novel page ${params.page.pageNumber} layout template`,
      imageData: (await renderGraphicNovelPageTemplate(params.page)).toString('base64'),
      mimeType: 'image/png',
      referenceKind: 'layout_template',
    },
  ];

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

function applyTemplateResidueCheck(
  validation: ImageValidationResult,
  residue: Awaited<ReturnType<typeof detectGraphicNovelTemplateColorResidue>>
): void {
  if (!residue.hasResidue) return;
  validation.hasTemplateColorResidue = true;
  (
    validation as ImageValidationResult & {
      templateColorResidueDetails?: typeof residue;
    }
  ).templateColorResidueDetails = residue;
  const residueSummary = residue.panels
    .filter((panel) => panel.matchedPixels > 0)
    .map(
      (panel) =>
        `panel ${panel.panelIndex} ${panel.guideColor}: ${panel.matchedPixels} px (${(panel.ratio * 100).toFixed(2)}%)`
    )
    .join('; ');
  validation.layoutFeedback =
    validation.layoutFeedback && validation.layoutFeedback !== 'ok'
      ? `${validation.layoutFeedback}; server pixel check found color-template residue: ${residueSummary}`
      : `server pixel check found color-template residue: ${residueSummary}`;
  validation.overallFeedback = `${validation.overallFeedback || 'Validation completed.'} Server pixel check found leftover color-template residue.`;
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
          runs: args.runs,
          expectedCharacters,
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

    const summaries: Array<Record<string, unknown>> = [];
    for (let index = 1; index <= args.runs; index++) {
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
        },
        {
          visionModel: primary.model,
          fallbackTextProvider: primary.fallback,
          fallbackVisionModel: primary.fallbackModel,
          operation: 'image_validation_graphic_novel_recheck',
          recordModeration: false,
        }
      );

      const residue = await detectGraphicNovelTemplateColorResidue(image.buffer, page);
      applyTemplateResidueCheck(validation, residue);
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
        hasTemplateColorResidue: validation.hasTemplateColorResidue ?? false,
        layoutFeedback: validation.layoutFeedback ?? null,
        emilia: summarizeCharacter(validation, 'Емілія'),
        flash: summarizeCharacter(validation, 'Флеш'),
        syiavyk: summarizeCharacter(validation, 'Сяйвик'),
      };
      summaries.push(summary);
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
