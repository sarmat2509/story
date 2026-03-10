/**
 * Compare Director sceneVisual vs actual scene text for a story.
 * Usage: npx tsx src/scripts/dumpDirectorVsText.ts <storyId>
 */

import path from 'path';
import { db } from '../db';
import { stories } from '../db/schema';
import { eq } from 'drizzle-orm';
const storyId = process.argv[2];
if (!storyId) {
  console.log('Usage: npx tsx src/scripts/dumpDirectorVsText.ts <storyId>');
  process.exit(1);
}

async function run() {
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.log('Story not found:', storyId);
    process.exit(1);
  }

  const scenes = ((story.scenes as any[]) || []).sort((a: any, b: any) => a.sceneId - b.sceneId);
  // Scenes with sceneVisual are the illustrated ones (Director flow)
  const illustrationSceneIds = scenes
    .filter((s: any) => s.sceneVisual?.setting || s.sceneVisual?.cameraComposition)
    .map((s: any) => s.sceneId);

  console.log('Story:', story.title);
  console.log('Total scenes:', scenes.length);
  console.log('Illustration scene IDs:', illustrationSceneIds);
  console.log('');

  for (const sceneId of illustrationSceneIds) {
    const scene = scenes.find((s: any) => s.sceneId === sceneId);
    if (!scene) continue;

    const sv = scene.sceneVisual || {};
    const text = (scene.text || '').replace(/<[^>]+>/g, '').trim();

    console.log('═'.repeat(70));
    console.log(`SCENE ${sceneId} (illustrated) | env: ${scene.environmentId || '?'}`);
    console.log('═'.repeat(70));
    console.log('\n--- STORY TEXT (what reader sees) ---');
    console.log(text.substring(0, 600) + (text.length > 600 ? '...' : ''));
    console.log('\n--- DIRECTOR sceneVisual ---');
    console.log('setting:', (sv.setting || '(empty)').substring(0, 300));
    const cam = sv.cameraComposition;
    if (cam && typeof cam === 'object') {
      console.log('shot:', cam.shot);
      (cam.characters || []).forEach((c: any) => {
        console.log(`  - ${c.name}: ${(c.description || '').substring(0, 120)}`);
      });
    }
    console.log('lighting:', (sv.lighting || '(empty)').substring(0, 150));
    console.log('');
  }

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
