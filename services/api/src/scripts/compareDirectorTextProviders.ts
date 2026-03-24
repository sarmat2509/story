/**
 * Run the same Director pipeline twice: buildDirectorPrompt + DIRECTOR_SCHEMA + temperature 0.7,
 * once with Gemini text and once with OpenAI text — for side-by-side comparison.
 *
 * Usage (from services/api):
 *   npx tsx src/scripts/compareDirectorTextProviders.ts --story <storyId> [--images N]
 *   npx tsx src/scripts/compareDirectorTextProviders.ts --fixture src/scripts/packs/director-compare.fixture.example.json
 *
 * From repo root:
 *   pnpm compare:director -- --story <storyId>
 *   pnpm compare:director -- --fixture services/api/src/scripts/packs/director-compare.fixture.example.json
 *
 * Docker:
 *   pnpm api:script npx tsx src/scripts/compareDirectorTextProviders.ts --fixture src/scripts/packs/director-compare.fixture.example.json
 *
 * Requires: GEMINI_API_KEY or GOOGLE_API_KEY, OPENAI_API_KEY (same as compare:image-validation).
 *
 * Optional env:
 *   COMPARE_GEMINI_MODEL  (default: config GEMINI_TEXT_MODEL / modelVersion)
 *   COMPARE_OPENAI_MODEL  (default: config openai model, often gpt-5.2)
 *
 * Flags:
 *   --temperature <n>     default 0.7 (matches StoryDomainService.callDirector)
 *   --out <dir>           write director-gemini.json and director-openai.json
 *   --prompt-only         print buildDirectorPrompt output and exit (no API calls)
 */

import './loadEnvForScripts';

import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import config from '../config';
import { DIRECTOR_SCHEMA } from '../domain/story/directorSchema';
import { buildDirectorPrompt, type DirectorPromptParams } from '../prompts/text/DirectorPrompt';
import { GeminiTextProvider } from '../providers/text/gemini';
import { OpenAITextProvider } from '../providers/text/openai';
import { db } from '../db';
import { stories, storyRequests } from '../db/schema';
import {
  getCharacterRepository,
  getChildProfileRepository,
  getSceneRepository,
} from '../repositories';
import { composeScenesIntoBlocks } from '../services/storyOrchestration/utilities';
import { buildPolicyProfile } from '../services/policyService';
import type { StorySpec } from '../ai/types';

const API_ROOT = path.resolve(__dirname, '../..');

type DirectorFixture = {
  imagesPerStory: number;
  scenes: Array<{ sceneId: number; text: string }>;
  userCharacters?: Array<{ id?: string; name: string }>;
  language?: string;
  ageGroup?: string;
  imageStyle?: string;
  scenarioCard?: { id: string; name?: string; description?: string };
};

function extractUserCharactersFromSceneText(text: string): Array<{ id?: string; name: string }> {
  const re = /([^\[\n]+?)\s*\[ID:\s*([a-f0-9-]{36})\]/gi;
  const byId = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    const id = m[2].trim();
    if (name && id && !byId.has(id)) byId.set(id, name);
  }
  return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
}

function resolveInputPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  const fromCwd = path.resolve(process.cwd(), p);
  if (fs.existsSync(fromCwd)) return fromCwd;
  const fromApi = path.resolve(API_ROOT, p);
  if (fs.existsSync(fromApi)) return fromApi;
  throw new Error(`Fixture not found: ${p}\n  tried: ${fromCwd}\n  tried: ${fromApi}`);
}

function parseArgs(argv: string[]): {
  storyId?: string;
  fixturePath?: string;
  images?: number;
  temperature: number;
  outDir?: string;
  promptOnly: boolean;
} {
  let storyId: string | undefined;
  let fixturePath: string | undefined;
  let images: number | undefined;
  let temperature = 0.7;
  let outDir: string | undefined;
  let promptOnly = false;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--story' && argv[i + 1]) {
      storyId = argv[++i];
    } else if (a === '--fixture' && argv[i + 1]) {
      fixturePath = argv[++i];
    } else if (a === '--images' && argv[i + 1]) {
      images = parseInt(argv[++i], 10);
      if (Number.isNaN(images) || images < 1) {
        console.error('Invalid --images');
        process.exit(1);
      }
    } else if (a === '--temperature' && argv[i + 1]) {
      temperature = parseFloat(argv[++i]);
      if (Number.isNaN(temperature)) {
        console.error('Invalid --temperature');
        process.exit(1);
      }
    } else if (a === '--out' && argv[i + 1]) {
      outDir = argv[++i];
    } else if (a === '--prompt-only') {
      promptOnly = true;
    }
  }

  if (!storyId && !fixturePath) {
    console.error(
      'Usage: npx tsx src/scripts/compareDirectorTextProviders.ts (--story <storyId> [--images N] | --fixture <fixture.json>) [--temperature 0.7] [--out dir] [--prompt-only]',
    );
    process.exit(1);
  }
  if (storyId && fixturePath) {
    console.error('Use either --story or --fixture, not both.');
    process.exit(1);
  }

  return { storyId, fixturePath, images, temperature, outDir, promptOnly };
}

async function loadDirectorParamsFromStory(
  storyId: string,
  imagesArg: number | undefined,
): Promise<DirectorPromptParams> {
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    throw new Error(`Story not found: ${storyId}`);
  }

  let sceneRows = await getSceneRepository().findByStoryId(storyId);
  let rows = sceneRows.map((r) => ({ sceneId: r.sceneId, text: r.text || '' }));
  if (rows.length === 0) {
    const legacy = (story.scenes as Array<{ sceneId: number; text?: string }> | null) || [];
    rows = legacy
      .map((s) => ({ sceneId: s.sceneId, text: s.text || '' }))
      .sort((a, b) => a.sceneId - b.sceneId);
  } else {
    rows.sort((a, b) => a.sceneId - b.sceneId);
  }

  if (rows.length === 0) {
    throw new Error(`No scenes for story ${storyId}`);
  }

  const meta = (story.metadata as Record<string, unknown>) || {};
  let imagesPerStory =
    imagesArg ??
    (Array.isArray(meta.sceneIdsWithImages) ? (meta.sceneIdsWithImages as number[]).length : undefined);

  if (imagesPerStory === undefined || imagesPerStory < 1) {
    imagesPerStory = 3;
    console.warn('[compareDirector] No --images and no metadata.sceneIdsWithImages; defaulting imagesPerStory=3');
  }

  const blocks = composeScenesIntoBlocks(rows, imagesPerStory);

  const [storyRequestRow] = story.storyRequestId
    ? await db.select().from(storyRequests).where(eq(storyRequests.id, story.storyRequestId))
    : [undefined];

  let userCharacters: Array<{ id?: string; name: string }> = [];
  if (storyRequestRow) {
    const charIds = (storyRequestRow.selectedCharacters as string[] | null)?.filter(Boolean) ?? [];
    const childIds = (storyRequestRow.selectedChildren as string[] | null)?.filter(Boolean) ?? [];
    if (charIds.length > 0) {
      const chars = await getCharacterRepository().findByIds(story.userId, charIds);
      userCharacters.push(...chars.filter((c) => c.name).map((c) => ({ id: c.id, name: c.name })));
    }
    if (childIds.length > 0) {
      const kids = await getChildProfileRepository().findByIds(story.userId, childIds);
      userCharacters.push(...kids.filter((k) => k.name).map((k) => ({ id: k.id, name: k.name })));
    }
  }

  const allText = rows.map((s) => s.text).join('\n');
  if (userCharacters.length === 0) {
    userCharacters = extractUserCharactersFromSceneText(allText);
    if (userCharacters.length > 0) {
      console.warn('[compareDirector] userCharacters extracted from scene text:', userCharacters.length);
    }
  }

  const policyProfile = await buildPolicyProfile(story.ageGroup, story.language);
  const imageStyle =
    (meta.imageStyle as string | undefined) || storyRequestRow?.imageStyle || 'soft_watercolor';
  const scenarioCardId = storyRequestRow?.scenarioCardId ?? undefined;

  const spec: StorySpec = {
    language: story.language,
    ageGroup: story.ageGroup,
    characters: [],
    policyProfile,
    imageStyle,
    ...(scenarioCardId
      ? { scenarioCard: { id: scenarioCardId, name: '', description: '' } }
      : {}),
  };

  return { blocks, imagesPerStory, spec, userCharacters };
}

async function loadDirectorParamsFromFixture(filePath: string): Promise<DirectorPromptParams> {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DirectorFixture;
  if (!raw.scenes?.length) {
    throw new Error('fixture.scenes must be a non-empty array');
  }
  const imagesPerStory = raw.imagesPerStory;
  if (!imagesPerStory || imagesPerStory < 1) {
    throw new Error('fixture.imagesPerStory must be a positive number');
  }
  const rows = [...raw.scenes].sort((a, b) => a.sceneId - b.sceneId);
  const blocks = composeScenesIntoBlocks(rows, imagesPerStory);
  const language = raw.language || 'uk';
  const ageGroup = raw.ageGroup || '6-8';
  const policyProfile = await buildPolicyProfile(ageGroup, language);
  const spec: StorySpec = {
    language,
    ageGroup,
    characters: [],
    policyProfile,
    imageStyle: raw.imageStyle || 'soft_watercolor',
    ...(raw.scenarioCard?.id
      ? {
          scenarioCard: {
            id: raw.scenarioCard.id,
            name: raw.scenarioCard.name || '',
            description: raw.scenarioCard.description || '',
          },
        }
      : {}),
  };
  return {
    blocks,
    imagesPerStory,
    spec,
    userCharacters: raw.userCharacters || [],
  };
}

async function main() {
  const { storyId, fixturePath, images, temperature, outDir, promptOnly } = parseArgs(process.argv);

  const params = fixturePath
    ? await loadDirectorParamsFromFixture(resolveInputPath(fixturePath))
    : await loadDirectorParamsFromStory(storyId!, images);

  const prompt = buildDirectorPrompt(params);
  console.error('[compareDirector] prompt length:', prompt.length, 'blocks:', params.blocks.length, 'imagesPerStory:', params.imagesPerStory);

  if (promptOnly) {
    console.log(prompt);
    return;
  }

  const geminiKey = config.ai.geminiApiKey || process.env.GOOGLE_API_KEY || '';
  const openaiKey = config.ai.openaiApiKey;
  if (!geminiKey) {
    throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY');
  }
  if (!openaiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const geminiModel =
    process.env.COMPARE_GEMINI_MODEL || config.ai.modelVersion || 'gemini-3-flash-preview';
  const openaiModel = process.env.COMPARE_OPENAI_MODEL || config.ai.openaiModel;

  const gemini = new GeminiTextProvider(geminiKey, config.ai.modelVersion);
  const openai = new OpenAITextProvider(openaiKey, config.ai.openaiModel);

  const structuredRequestBase = {
    prompt,
    schema: DIRECTOR_SCHEMA,
    temperature,
  } as const;

  console.log('\n=== Gemini (Director) ===', { model: geminiModel, temperature });
  const geminiResult = await gemini.generateStructured({
    ...structuredRequestBase,
    model: geminiModel,
    operation: 'director_compare_gemini',
  });
  console.log(JSON.stringify(geminiResult, null, 2));

  console.log('\n=== OpenAI (Director) ===', { model: openaiModel, temperature });
  let openaiResult: unknown;
  try {
    openaiResult = await openai.generateStructured({
      ...structuredRequestBase,
      model: openaiModel,
      operation: 'director_compare_openai',
    });
    console.log(JSON.stringify(openaiResult, null, 2));
  } catch (e) {
    console.error('OpenAI Director failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
    openaiResult = null;
  }

  if (outDir) {
    const dir = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'director-gemini.json'), JSON.stringify(geminiResult, null, 2), 'utf-8');
    if (openaiResult != null) {
      fs.writeFileSync(path.join(dir, 'director-openai.json'), JSON.stringify(openaiResult, null, 2), 'utf-8');
    }
    console.error('[compareDirector] wrote JSON to', dir);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
