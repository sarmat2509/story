/**
 * Backfill stories.metadata.mapTile for existing stories.
 *
 * This script never updates scenes, story text, visual prompts, assets, or image choices.
 * It uses a lightweight map-tile-only Director prompt, not the full illustration Director flow.
 * It writes only stories.metadata.mapTile with exactly:
 *   - description
 *   - requiredFeatures
 *
 * Safe default: dry-run. Add --write to persist.
 *
 * Usage:
 *   pnpm --dir services/api exec tsx src/scripts/backfillMapTileMetadata.ts --story <storyId>
 *   pnpm --dir services/api exec tsx src/scripts/backfillMapTileMetadata.ts --limit 20 --write
 *   pnpm --dir services/api exec tsx src/scripts/backfillMapTileMetadata.ts --latest --limit 20 --write
 *   pnpm --dir services/api exec tsx src/scripts/backfillMapTileMetadata.ts --force --limit 5
 */

import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, closeDatabaseConnection } from '../db';
import { stories, storyRequests } from '../db/schema';
import {
  getCharacterRepository,
  getChildProfileRepository,
  getSceneRepository,
  getStoryRepository,
} from '../repositories';
import type { StorySpec } from '../ai/types';
import { canonicalizeMapTileFeatures } from '../domain/story/mapTileMasks';
import { buildPolicyProfile } from '../services/policyService';
import { getStoryDomainService } from '../services/aiService';
import { composeScenesIntoBlocks } from '../services/storyOrchestration/utilities';
import { resolveMapTileBriefImageCount } from '../services/mapTileBriefService';

const MapTileBriefSchema = z.object({
  description: z.string().trim().min(20),
  requiredFeatures: z.array(z.string().trim().min(1)).default([]),
});

type MapTileBrief = z.infer<typeof MapTileBriefSchema>;

type Args = {
  storyId?: string;
  limit: number;
  force: boolean;
  write: boolean;
  latest: boolean;
  images?: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    limit: 10,
    force: false,
    write: false,
    latest: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const value = argv[i];
    if (value === '--story' && argv[i + 1]) {
      args.storyId = argv[++i];
    } else if (value === '--limit' && argv[i + 1]) {
      const limit = Number(argv[++i]);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('Invalid --limit value');
      }
      args.limit = limit;
    } else if (value === '--images' && argv[i + 1]) {
      const images = Number(argv[++i]);
      if (!Number.isInteger(images) || images < 1) {
        throw new Error('Invalid --images value');
      }
      args.images = images;
    } else if (value === '--force') {
      args.force = true;
    } else if (value === '--write') {
      args.write = true;
    } else if (value === '--latest') {
      args.latest = true;
    } else if (!value.startsWith('-') && !args.storyId) {
      args.storyId = value;
    }
  }

  return args;
}

function extractUserCharactersFromSceneText(text: string): Array<{ id?: string; name: string }> {
  const re = /([^[\n]+?)\s*\[ID:\s*([a-f0-9-]{36})\]/gi;
  const byId = new Map<string, string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1].trim();
    const id = match[2].trim();
    if (name && id && !byId.has(id)) byId.set(id, name);
  }
  return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
}

async function loadSceneRows(
  storyId: string,
  legacyScenes: unknown
): Promise<Array<{ sceneId: number; text: string }>> {
  const rows = await getSceneRepository().findByStoryId(storyId);
  if (rows.length > 0) {
    return rows
      .map((row) => ({ sceneId: row.sceneId, text: row.text || '' }))
      .sort((a, b) => a.sceneId - b.sceneId);
  }

  return (
    (Array.isArray(legacyScenes) ? legacyScenes : []) as Array<{
      sceneId?: number;
      text?: string;
    }>
  )
    .filter((scene) => typeof scene.sceneId === 'number')
    .map((scene) => ({ sceneId: scene.sceneId!, text: scene.text || '' }))
    .sort((a, b) => a.sceneId - b.sceneId);
}

async function selectTargetStories(args: Args) {
  if (args.storyId) {
    const [story] = await db.select().from(stories).where(eq(stories.id, args.storyId));
    return story ? [story] : [];
  }

  const conditions = args.force
    ? sql`true`
    : sql`(${stories.metadata} IS NULL OR ${stories.metadata}->'mapTile' IS NULL)`;

  return db
    .select()
    .from(stories)
    .where(conditions)
    .orderBy(args.latest ? desc(stories.createdAt) : stories.createdAt)
    .limit(args.limit);
}

async function buildDirectorInput(story: typeof stories.$inferSelect, imagesOverride?: number) {
  const sceneRows = await loadSceneRows(story.id, story.scenes);
  if (sceneRows.length === 0) {
    throw new Error('No scenes found');
  }

  const metadata =
    story.metadata && typeof story.metadata === 'object'
      ? (story.metadata as Record<string, unknown>)
      : {};
  const imagesPerStory = resolveMapTileBriefImageCount({
    sceneCount: sceneRows.length,
    imagesOverride,
    metadata,
  });

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
        ...chars.filter((char) => char.name).map((char) => ({ id: char.id, name: char.name }))
      );
    }
    if (childIds.length > 0) {
      const children = await getChildProfileRepository().findByIds(story.userId, childIds);
      userCharacters.push(
        ...children
          .filter((child) => child.name)
          .map((child) => ({ id: child.id, name: child.name }))
      );
    }
  }

  if (userCharacters.length === 0) {
    userCharacters = extractUserCharactersFromSceneText(sceneRows.map((s) => s.text).join('\n'));
  }

  const spec: StorySpec = {
    language: story.language,
    ageGroup: story.ageGroup,
    characters: [],
    policyProfile: await buildPolicyProfile(story.ageGroup, story.language),
    imageStyle:
      (metadata.imageStyle as string | undefined) ||
      storyRequestRow?.imageStyle ||
      'soft_watercolor',
    ...(storyRequestRow?.scenarioCardId
      ? { scenarioCard: { id: storyRequestRow.scenarioCardId, name: '', description: '' } }
      : {}),
  };

  return {
    blocks: composeScenesIntoBlocks(sceneRows, imagesPerStory),
    imagesPerStory,
    spec,
    userCharacters,
  };
}

async function backfillStory(
  story: typeof stories.$inferSelect,
  args: Args
): Promise<{ storyId: string; title: string; mapTile: MapTileBrief; written: boolean }> {
  const metadata =
    story.metadata && typeof story.metadata === 'object'
      ? (story.metadata as Record<string, unknown>)
      : {};

  if (!args.force && metadata.mapTile) {
    const existing = MapTileBriefSchema.safeParse(metadata.mapTile);
    if (existing.success) {
      const canonicalExisting = {
        ...existing.data,
        requiredFeatures: canonicalizeMapTileFeatures(existing.data.requiredFeatures),
      };
      const changed =
        JSON.stringify(existing.data.requiredFeatures) !==
        JSON.stringify(canonicalExisting.requiredFeatures);
      if (args.write && changed) {
        await getStoryRepository().updateStory(story.id, {
          metadata: {
            ...metadata,
            mapTile: canonicalExisting,
          },
        });
      }
      return {
        storyId: story.id,
        title: story.title,
        mapTile: canonicalExisting,
        written: args.write && changed,
      };
    }
  }

  const input = await buildDirectorInput(story, args.images);
  const mapTileBrief = await getStoryDomainService().generateMapTileBrief(input);
  const parsed = MapTileBriefSchema.safeParse(mapTileBrief);
  if (!parsed.success) {
    throw new Error(
      `Map tile brief Director returned invalid mapTile: ${JSON.stringify(parsed.error.flatten())}`
    );
  }

  const mapTile = parsed.data;
  if (args.write) {
    await getStoryRepository().updateStory(story.id, {
      metadata: {
        ...metadata,
        mapTile: {
          description: mapTile.description,
          requiredFeatures: mapTile.requiredFeatures,
        },
      },
    });
  }

  return {
    storyId: story.id,
    title: story.title,
    mapTile,
    written: args.write,
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const targetStories = await selectTargetStories(args);
  if (targetStories.length === 0) {
    console.log('No target stories found.');
    return;
  }

  console.log(
    `Backfilling mapTile metadata for ${targetStories.length} story/stories (${args.write ? 'write' : 'dry-run'}).`
  );

  let ok = 0;
  let failed = 0;
  for (const story of targetStories) {
    try {
      const result = await backfillStory(story, args);
      ok += 1;
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify(
          {
            storyId: story.id,
            title: story.title,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
    }
  }

  console.log(`Done. ok=${ok}, failed=${failed}, mode=${args.write ? 'write' : 'dry-run'}`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
