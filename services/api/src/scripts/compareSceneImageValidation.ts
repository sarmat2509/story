/**
 * Run the same image validation pipeline as production (buildImageValidationPrompt + IMAGE_VALIDATION_SCHEMA,
 * image order: scene then turnaround refs, temperature 0.2, relaxedSafety) against two text providers for comparison.
 *
 * Usage: GEMINI_API_KEY + OPENAI_API_KEY. From repo root:
 *   npx tsx services/api/src/scripts/compareSceneImageValidation.ts --pack services/api/src/scripts/packs/....json
 * From services/api: npx tsx src/scripts/compareSceneImageValidation.ts --pack src/scripts/packs/....json
 * From repo root: pnpm compare:image-validation -- --pack src/scripts/packs/....json
 *
 * pack.json — image paths relative to services/api (uploads/...):
 * {
 *   "sceneImage": "uploads/development/USER_ID/STORY_ID/image/ASSET.jpg",
 *   "sceneCharacterOutfitsText": "optional, same as image pipeline",
 *   "sceneVisual": {
 *     "setting": "English delta text",
 *     "lighting": "English",
 *     "cameraComposition": { "shot": "...", "characters": [{ "name": "Емілія", "description": "...", "outfitId": "o_x" }] }
 *   },
 *   "expectedCharacters": [
 *     { "name": "Емілія", "characterKind": "human", "description": "optional", "expectedOutfitForScene": "optional" },
 *     { "name": "Флеш", "characterKind": "imaginary", "description": "optional" },
 *     { "name": "Хом'як", "characterKind": "animal", "speciesSubtype": "hamster" }
 *   ],
 *   // Legacy pack.json with "isImaginary": bool is auto-converted to characterKind.
 *   "references": [
 *     { "characterName": "Емілія", "path": "uploads/development/USER_ID/photos/child_turnaround/....jpg" },
 *     { "characterName": "Флеш", "path": "uploads/.../character_turnaround/....jpg" },
 *     { "characterName": "Сяйвик", "path": "uploads/.../character_turnaround/....jpg" }
 *   ]
 * }
 *
 * Optional env:
 *   COMPARE_GEMINI_MODEL   (default: GEMINI_VISION_MODEL or gemini-3-flash-preview)
 *   COMPARE_OPENAI_MODEL   (default: gpt-4o — must support vision + json_schema)
 *
 * Env files (loaded automatically before config): repo `.env` / `.env.local`, then `services/api/.env` / `.env.local`.
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import config from '../config';
import { GeminiTextProvider } from '../providers/text/gemini';
import { OpenAITextProvider } from '../providers/text/openai';
import { runProductImageValidation } from '../domain/image/imageValidationRun';
import type { SceneVisual } from '../services/types';

/** services/api — directory that contains uploads/ (independent of process.cwd()) */
const API_ROOT = path.resolve(__dirname, '../..');

type PackExpectedCharacter = {
  name: string;
  /** New-style explicit kind — preferred. */
  characterKind?: 'human' | 'animal' | 'imaginary';
  /** Optional species/role hint for animals or imaginary creatures. */
  speciesSubtype?: string;
  /** Legacy: older packs only knew human vs imaginary. */
  isImaginary?: boolean;
  description?: string;
  expectedOutfitForScene?: string;
};

type Pack = {
  sceneImage: string;
  sceneCharacterOutfitsText?: string;
  sceneVisual: SceneVisual;
  expectedCharacters: PackExpectedCharacter[];
  references: Array<{ characterName: string; path: string }>;
};

function normalizePackExpected(c: PackExpectedCharacter): {
  name: string;
  characterKind: 'human' | 'animal' | 'imaginary';
  speciesSubtype?: string;
  description?: string;
  expectedOutfitForScene?: string;
} {
  const kind: 'human' | 'animal' | 'imaginary' =
    c.characterKind ?? (c.isImaginary ? 'imaginary' : 'human');
  return {
    name: c.name,
    characterKind: kind,
    speciesSubtype: c.speciesSubtype,
    description: c.description,
    expectedOutfitForScene: c.expectedOutfitForScene,
  };
}

function mimeFromExt(filePath: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const e = path.extname(filePath).toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function readImageResolved(
  relativeOrAbsolute: string,
  cwd: string
): { buf: Buffer; mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' } {
  const resolved = path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(cwd, relativeOrAbsolute);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }
  return { buf: fs.readFileSync(resolved), mime: mimeFromExt(resolved) };
}

function parseArgs(): { pack: string } {
  const argv = process.argv.slice(2);
  let pack = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pack' && argv[i + 1]) {
      pack = argv[++i];
    }
  }
  if (!pack) {
    throw new Error(
      'Usage: npx tsx services/api/src/scripts/compareSceneImageValidation.ts --pack <pack.json>\n' +
        '  (from repo root) or cd services/api && npx tsx src/scripts/compareSceneImageValidation.ts --pack ...'
    );
  }
  return { pack };
}

function resolvePackFilePath(packPath: string): string {
  if (path.isAbsolute(packPath)) return packPath;
  const fromCwd = path.resolve(process.cwd(), packPath);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromApi = path.resolve(API_ROOT, packPath);
  if (fs.existsSync(fromApi)) return fromApi;
  throw new Error(
    `Pack not found: ${packPath}\n  tried: ${fromCwd}\n  tried: ${fromApi}\n  Run from repo root with path services/api/src/scripts/packs/....json`
  );
}

async function main() {
  const { pack: packPath } = parseArgs();
  const resolvedPack = resolvePackFilePath(packPath);
  const raw = JSON.parse(fs.readFileSync(resolvedPack, 'utf-8')) as Pack;

  const scene = readImageResolved(raw.sceneImage, API_ROOT);
  const referenceImages = raw.references.map((r) => {
    const { buf, mime } = readImageResolved(r.path, API_ROOT);
    return {
      characterName: r.characterName,
      mimeType: mime,
      imageData: buf.toString('base64'),
    };
  });

  const input = {
    imageData: scene.buf,
    mimeType: scene.mime,
    expectedCharacters: raw.expectedCharacters.map(normalizePackExpected),
    sceneVisual: raw.sceneVisual,
    sceneCharacterOutfitsText: raw.sceneCharacterOutfitsText,
    referenceImages,
  };

  const geminiKey = config.ai.geminiApiKey || process.env.GOOGLE_API_KEY || '';
  const openaiKey = config.ai.openaiApiKey;
  if (!geminiKey) {
    throw new Error(
      'Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env.local (repo root) or export in shell.'
    );
  }
  if (!openaiKey) {
    throw new Error('Missing OPENAI_API_KEY in .env.local (repo root) or export in shell.');
  }

  const geminiModel =
    process.env.COMPARE_GEMINI_MODEL || config.ai.geminiVisionModel || 'gemini-3-flash-preview';
  const openaiModel = process.env.COMPARE_OPENAI_MODEL || 'gpt-4o';

  const gemini = new GeminiTextProvider(geminiKey, config.ai.modelVersion);
  const openai = new OpenAITextProvider(openaiKey, config.ai.openaiModel);

  console.log('--- Gemini (same validator pipeline) ---', { model: geminiModel });
  const geminiResult = await runProductImageValidation(gemini, input, {
    visionModel: geminiModel,
    operation: 'image_validation_script_gemini',
  });
  console.log(JSON.stringify(geminiResult, null, 2));

  console.log('\n--- OpenAI (same validator pipeline) ---', { model: openaiModel });
  try {
    const openaiResult = await runProductImageValidation(openai, input, {
      visionModel: openaiModel,
      operation: 'image_validation_script_openai',
    });
    console.log(JSON.stringify(openaiResult, null, 2));
  } catch (e) {
    console.error('OpenAI run failed (schema/vision/model):', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
