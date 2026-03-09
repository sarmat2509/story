/**
 * Check environments and characterOutfits for a story.
 * Usage: npx tsx src/scripts/checkEnvOutfits.ts <storyId>
 *
 * Note: intermediateData (with environments) is cleared after image generation.
 * For completed stories we reconstruct env list from story.scenes (environmentId per scene).
 */

import path from 'path';
import { db } from '../db';
import { stories, storyRequests } from '../db/schema';
import { eq } from 'drizzle-orm';

const storyId = process.argv[2] || '8fd4906d-76c0-4123-8034-d317c28b752c';

async function run() {
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.log('Story not found:', storyId);
    process.exit(1);
  }

  let req = (await db.select().from(storyRequests).where(eq(storyRequests.storyId, storyId)))[0];
  if (!req && (story as any).storyRequestId) {
    req = (await db.select().from(storyRequests).where(eq(storyRequests.id, (story as any).storyRequestId)))[0];
  }

  const data = (req?.intermediateData as Record<string, unknown>) || {};
  const text = (data.validatedText || data.text) as { environments?: any[]; scenes?: any[] } | undefined;
  const scenes = text?.scenes || (story.scenes as any[]) || [];

  let envs = text?.environments || [];

  if (!envs.length && scenes.length) {
    const envIds = [...new Set(scenes.map((s: any) => s.environmentId).filter(Boolean))];
    envs = envIds.map((id: string) => {
      const scenesInEnv = scenes.filter((s: any) => s.environmentId === id);
      const charNames = [...new Set(scenesInEnv.flatMap((s: any) =>
        (s.sceneVisual?.cameraComposition?.characters || []).map((c: any) => c.name?.replace(/\s*\[ID:.*?\]/g, '').trim()).filter(Boolean)
      ))];
      return { id, name: id.replace(/_/g, ' '), characterOutfits: '(not persisted — intermediateData cleared)', _chars: charNames };
    });
    console.log('Story:', story.title);
    console.log('Note: intermediateData cleared after completion. Reconstructed envs from story.scenes.\n');
  }

  if (!envs.length) {
    console.log('Story:', story.title);
    console.log('No environments (story.scenes may lack environmentId)');
    process.exit(0);
  }

  console.log('Story:', story.title);
  console.log('Environments:', envs.length);
  console.log('Scenes:', scenes.length);
  console.log('');

  envs.forEach((e: any, i: number) => {
    const scenesInEnv = scenes.filter((s: any) => s.environmentId === e.id);
    const charNames = e._chars ?? [...new Set(scenesInEnv.flatMap((s: any) =>
      (s.sceneVisual?.cameraComposition?.characters || []).map((c: any) => c.name?.replace(/\s*\[ID:.*?\]/g, '').trim()).filter(Boolean)
    ))];

    console.log('--- Environment', i + 1, '---');
    console.log('id:', e.id);
    console.log('name:', e.name);
    console.log('characterOutfits:', typeof e.characterOutfits === 'object' ? JSON.stringify(e.characterOutfits) : e.characterOutfits ?? '(empty)');
    console.log('Characters in scenes:', charNames.join(', ') || 'none');
    if (e.characterOutfits === '(not persisted — intermediateData cleared)' || !e.characterOutfits || (typeof e.characterOutfits === 'string' && !e.characterOutfits.trim())) {
      console.log('⚠️  characterOutfits missing — images use character descriptions without per-env outfit');
    }
    console.log('');
  });

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
