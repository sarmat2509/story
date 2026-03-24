/**
 * Re-run Director LLM for an existing story (diagnostic only — does not write the database).
 *
 * Usage (from repo root):
 *   pnpm api:script npx tsx src/scripts/rerunDirectorForStory.ts <storyId> [--images N] [--json out.json] [--prompt] [--prompt-only] [--prompt-out path.txt]
 *
 * Requires: DATABASE_URL, Gemini / text provider env (same as production Director).
 */

import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { stories, storyRequests } from '../db/schema';
import { getCharacterRepository, getChildProfileRepository, getSceneRepository } from '../repositories';
import { composeScenesIntoBlocks } from '../services/storyOrchestration/utilities';
import { buildPolicyProfile } from '../services/policyService';
import { getStoryDomainService } from '../services/aiService';
import type { StorySpec } from '../ai/types';
import { buildDirectorPrompt } from '../prompts/text/DirectorPrompt';

function parseArgs(argv: string[]): {
  storyId: string;
  images?: number;
  jsonOut?: string;
  printPrompt: boolean;
  promptOnly: boolean;
  promptOut?: string;
} {
  const positional: string[] = [];
  let images: number | undefined;
  let jsonOut: string | undefined;
  let printPrompt = false;
  let promptOnly = false;
  let promptOut: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--images' && argv[i + 1]) {
      images = parseInt(argv[++i], 10);
      if (Number.isNaN(images) || images < 1) {
        console.error('Invalid --images value');
        process.exit(1);
      }
    } else if (a === '--json' && argv[i + 1]) {
      jsonOut = argv[++i];
    } else if (a === '--prompt-out' && argv[i + 1]) {
      promptOut = argv[++i];
      printPrompt = true;
    } else if (a === '--prompt-only') {
      promptOnly = true;
      printPrompt = true;
    } else if (a === '--prompt') {
      printPrompt = true;
    } else if (!a.startsWith('-')) {
      positional.push(a);
    }
  }
  const storyId = positional[0];
  if (!storyId) {
    console.error(
      'Usage: npx tsx src/scripts/rerunDirectorForStory.ts <storyId> [--images N] [--json out.json] [--prompt] [--prompt-only] [--prompt-out path.txt]',
    );
    process.exit(1);
  }
  return { storyId, images, jsonOut, printPrompt, promptOnly, promptOut };
}

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

async function loadSceneRows(storyId: string): Promise<Array<{ sceneId: number; text: string }>> {
  const rows = await getSceneRepository().findByStoryId(storyId);
  if (rows.length === 0) return [];
  return rows.map((r) => ({ sceneId: r.sceneId, text: r.text || '' }));
}

async function run() {
  const { storyId, images: imagesArg, jsonOut, printPrompt, promptOnly, promptOut } = parseArgs(process.argv);

  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.error('Story not found:', storyId);
    process.exit(1);
  }

  let sceneRows = await loadSceneRows(storyId);
  if (sceneRows.length === 0) {
    const legacy = (story.scenes as Array<{ sceneId: number; text?: string }> | null) || [];
    sceneRows = legacy
      .map((s) => ({ sceneId: s.sceneId, text: s.text || '' }))
      .sort((a, b) => a.sceneId - b.sceneId);
  } else {
    sceneRows.sort((a, b) => a.sceneId - b.sceneId);
  }

  if (sceneRows.length === 0) {
    console.error('No scenes found for story', storyId);
    process.exit(1);
  }

  const meta = (story.metadata as Record<string, unknown>) || {};
  let imagesPerStory =
    imagesArg ??
    (Array.isArray(meta.sceneIdsWithImages) ? (meta.sceneIdsWithImages as number[]).length : undefined);

  if (imagesPerStory === undefined || imagesPerStory < 1) {
    imagesPerStory = 3;
    console.warn(
      'No --images and no metadata.sceneIdsWithImages; defaulting imagesPerStory=3',
    );
  }

  const blocks = composeScenesIntoBlocks(sceneRows, imagesPerStory);

  const [storyRequestRow] = story.storyRequestId
    ? await db.select().from(storyRequests).where(eq(storyRequests.id, story.storyRequestId))
    : [undefined];

  let userCharacters: Array<{ id?: string; name: string }> = [];
  if (storyRequestRow) {
    const charIds = (storyRequestRow.selectedCharacters as string[] | null)?.filter(Boolean) ?? [];
    const childIds = (storyRequestRow.selectedChildren as string[] | null)?.filter(Boolean) ?? [];
    if (charIds.length > 0) {
      const chars = await getCharacterRepository().findByIds(story.userId, charIds);
      userCharacters.push(
        ...chars.filter((c) => c.name).map((c) => ({ id: c.id, name: c.name })),
      );
    }
    if (childIds.length > 0) {
      const kids = await getChildProfileRepository().findByIds(story.userId, childIds);
      userCharacters.push(
        ...kids.filter((k) => k.name).map((k) => ({ id: k.id, name: k.name })),
      );
    }
  }

  const allText = sceneRows.map((s) => s.text).join('\n');
  if (userCharacters.length === 0) {
    userCharacters = extractUserCharactersFromSceneText(allText);
    if (userCharacters.length > 0) {
      console.log('userCharacters: extracted from scene text (Name [ID: uuid])', userCharacters.length);
    }
  }

  const policyProfile = await buildPolicyProfile(story.ageGroup, story.language);
  const imageStyle =
    (meta.imageStyle as string | undefined) ||
    storyRequestRow?.imageStyle ||
    'soft_watercolor';

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

  const params = {
    blocks,
    imagesPerStory,
    spec,
    userCharacters,
  };

  if (printPrompt) {
    const prompt = buildDirectorPrompt(params);
    console.error('[rerunDirectorForStory] buildDirectorPrompt length:', prompt.length);
    if (promptOut) {
      const outPath = path.isAbsolute(promptOut) ? promptOut : path.join(process.cwd(), promptOut);
      fs.writeFileSync(outPath, prompt, 'utf-8');
      console.error('[rerunDirectorForStory] wrote full prompt to', outPath);
    } else {
      console.log('===== DIRECTOR PROMPT (full) =====\n');
      console.log(prompt);
      console.log('\n===== END DIRECTOR PROMPT =====');
    }
    if (promptOnly) {
      process.exit(0);
    }
  }

  const storyDomain = getStoryDomainService();
  const result = await storyDomain.callDirector(params);

  const envPreview = (result.environments || []).map((e: { id: string; name?: string }) => ({
    id: e.id,
    name: e.name,
  }));

  const outfitsPreview = (result.outfits || []).map((o: { id: string; characterName?: string }) => ({
    id: o.id,
    characterName: o.characterName,
    descriptionPreview: String((o as { description?: string }).description || '').slice(0, 120),
  }));

  const illOutfitPreview = (result.illustrations || []).map(
    (
      ill: {
        environmentId?: string;
        sceneVisual?: { cameraComposition?: { characters?: Array<{ name?: string; outfitId?: string }> } };
      },
      i: number,
    ) => ({
      index: i,
      environmentId: ill.environmentId,
      cameraCharacters:
        ill.sceneVisual?.cameraComposition?.characters?.map((c) => ({
          name: c?.name,
          outfitId: c?.outfitId,
        })) ?? [],
    }),
  );

  console.log('Director summary:', {
    illustrationCount: result.illustrations?.length ?? 0,
    environmentCount: result.environments?.length ?? 0,
    outfitDefinitionCount: result.outfits?.length ?? 0,
    environments: envPreview,
    outfits: outfitsPreview,
    illustrationsCameraOutfits: illOutfitPreview,
  });

  const json = JSON.stringify(result, null, 2);
  console.log(json);

  if (jsonOut) {
    const outPath = path.isAbsolute(jsonOut) ? jsonOut : path.join(process.cwd(), jsonOut);
    fs.writeFileSync(outPath, json, 'utf-8');
    console.log('Wrote', outPath);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
