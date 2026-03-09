/**
 * Dump sceneVisual for each scene of a story.
 * Usage: npx tsx src/scripts/dumpSceneVisuals.ts <storyId>
 */

import path from 'path';
import { db } from '../db';
import { stories } from '../db/schema';
import { eq } from 'drizzle-orm';

const storyId = process.argv[2] || '8fd4906d-76c0-4123-8034-d317c28b752c';

async function run() {
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.log('Story not found:', storyId);
    process.exit(1);
  }

  const scenes = ((story.scenes as any[]) || []).sort((a: any, b: any) => a.sceneId - b.sceneId);

  console.log('Story:', story.title);
  console.log('Scenes:', scenes.length);
  console.log('');

  scenes.forEach((s: any) => {
    const sv = s.sceneVisual || {};
    console.log('═'.repeat(60));
    console.log(`Scene ${s.sceneId} | environmentId: ${s.environmentId || '?'}`);
    console.log('═'.repeat(60));
    console.log('\nsetting:');
    console.log(sv.setting || '(empty)');
    const cam = sv.cameraComposition;
    if (cam) {
      console.log('\ncameraComposition:');
      if (typeof cam === 'object') {
        console.log('  shot:', cam.shot);
        (cam.characters || []).forEach((c: any) => {
          console.log(`  - ${c.name}: ${c.description || ''}`);
        });
      } else {
        console.log(' ', cam);
      }
    }
    console.log('\nlighting:');
    console.log(sv.lighting || '(empty)');
    console.log('');
  });

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
