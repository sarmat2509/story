/**
 * Diagnose why a story did not get environment images.
 * Usage: npx tsx src/scripts/diagnoseEnvImages.ts <storyId>
 *        (from project root, or with DATABASE_URL set)
 *
 * Checks:
 * 1. Story exists and has story_request_id
 * 2. Request intermediateData: text.environments, scenes[].environmentId
 * 3. story_environment_cache entries for this story
 * 4. ENABLE_ENVIRONMENT_REFERENCE config
 */

import { db } from '../db';
import { stories, storyRequests, storyEnvironmentCache, environmentImageCache, scenes as scenesTable, assets } from '../db/schema';
import { eq } from 'drizzle-orm';
import { config } from '../config';

const storyId = process.argv[2] || '54ee878b-316f-4acf-936d-0face9ebb1cd';

async function diagnose() {
  console.log('Diagnosing environment images for story:', storyId);
  console.log('='.repeat(80));

  // 1. Story
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.log('Story not found');
    return;
  }
  console.log('\nStory:', story.title, '| created:', story.createdAt);

  // Scenes from stories.scenes (full LLM output with environmentId)
  const storyScenes = (story.scenes as Array<{ sceneId: number; environmentId?: string }>) || [];
  const metadata = (story.metadata as Record<string, unknown>) || {};
  const sceneIdsWithImages = (metadata.sceneIdsWithImages as number[]) || [];

  console.log('\n--- Scenes (order, environmentId) from stories.scenes ---');
  console.log('Total scenes:', storyScenes.length);
  console.log('Scenes selected for images (sceneIdsWithImages):', sceneIdsWithImages.join(', ') || 'none');
  storyScenes.forEach((s: any, i: number) => {
    const envId = s.environmentId ?? 'MISSING';
    const hasImage = sceneIdsWithImages.includes(s.sceneId);
    console.log(`  ${i + 1}. sceneId=${s.sceneId} | env=${envId} | hasImage=${hasImage}`);
  });

  // 2. Request (by story_id in story_requests)
  const [request] = await db
    .select()
    .from(storyRequests)
    .where(eq(storyRequests.storyId, storyId));
  if (!request) {
    console.log('\nNo story request found with storyId (may use story_request_id from story)');
    const reqByStory = await db
      .select()
      .from(storyRequests)
      .where(eq(storyRequests.id, story.storyRequestId!));
    if (reqByStory.length === 0) {
      console.log('No request by story_request_id either');
    } else {
      console.log('Found request by story_request_id:', reqByStory[0].id);
    }
  }

  const req = request || (story.storyRequestId ? (await db.select().from(storyRequests).where(eq(storyRequests.id, story.storyRequestId!)))[0] : null);
  if (!req) {
    console.log('\nCannot find request — intermediateData unavailable');
  } else {
    const data = req.intermediateData as Record<string, unknown> | null;
    const text = (data?.validatedText || data?.text) as { environments?: unknown[]; scenes?: Array<{ environmentId?: string }> } | undefined;
    if (!text) {
      console.log('\nintermediateData has no text/validatedText');
    } else {
      const envs = text.environments;
      const scenes = text.scenes;
      console.log('\n--- Text structure ---');
      console.log('environments:', envs ? `${envs.length} items` : 'MISSING');
      if (envs?.length) {
        envs.forEach((e: any) => console.log('  -', e.id, '|', e.name?.substring(0, 40)));
      }
      console.log('scenes:', scenes ? `${scenes.length} items` : 'MISSING');
      if (scenes?.length) {
        scenes.forEach((s: any, i: number) =>
          console.log(`  scene ${i + 1}: environmentId=${s.environmentId ?? 'MISSING'}`)
        );
      }
      const missingEnvId = scenes?.filter((s: any) => !s.environmentId).length ?? 0;
      if (missingEnvId > 0) {
        console.log('\n⚠️', missingEnvId, 'scenes have no environmentId');
      }
      if (!envs?.length) {
        console.log('\n⚠️ No environments — environmentMap will be empty');
      }
    }
  }

  // 3. Assets (scenes with images)
  const assetRecords = await db.select().from(assets).where(eq(assets.storyId, storyId));
  const sceneRecords = await db.select().from(scenesTable).where(eq(scenesTable.storyId, storyId)).orderBy(scenesTable.sceneId);
  const scenesWithAssets = assetRecords
    .filter((a) => a.sceneId)
    .map((a) => sceneRecords.find((r) => r.id === a.sceneId)?.sceneId)
    .filter((id): id is number => id != null);
  console.log('\n--- Assets (scenes with images) ---');
  console.log('Scene IDs with assets:', [...new Set(scenesWithAssets)].sort((a, b) => a - b).join(', '));

  // 4. story_environment_cache
  const storyEnvEntries = await db
    .select()
    .from(storyEnvironmentCache)
    .where(eq(storyEnvironmentCache.storyId, storyId));
  console.log('\n--- story_environment_cache ---');
  console.log('Entries:', storyEnvEntries.length);
  storyEnvEntries.forEach((e) => console.log('  ', e.storyEnvironmentId, '->', e.cacheId));

  // 5. Envs in selected scenes vs cached
  const envsInSelectedScenes = new Set(
    storyScenes.filter((s) => sceneIdsWithImages.includes(s.sceneId) && s.environmentId).map((s) => s.environmentId)
  );
  const envsInCache = new Set(storyEnvEntries.map((e) => e.storyEnvironmentId));
  const missingEnvCache = Array.from(envsInSelectedScenes).filter((e) => e && !envsInCache.has(e));
  if (missingEnvCache.length > 0) {
    console.log('\n⚠️ Environments in selected scenes but NOT in cache:', missingEnvCache.join(', '));
  }

  // 6. Config
  console.log('\n--- Config ---');
  console.log('ENABLE_ENVIRONMENT_REFERENCE:', config.image.enableEnvironmentReference);
  console.log('GOOGLE_CLOUD_PROJECT:', config.image.imagen4Fast.projectId ? 'set' : 'MISSING');
  console.log('ENVIRONMENT_EMBEDDING_SIMILARITY_THRESHOLD:', config.image.environmentEmbeddingSimilarityThreshold);

  // 7. environment_image_cache count
  const cacheCount = await db.select().from(environmentImageCache);
  console.log('\nenvironment_image_cache total entries:', cacheCount.length);

  console.log('\n' + '='.repeat(80));
  process.exit(0);
}

diagnose().catch((err) => {
  console.error(err);
  process.exit(1);
});
