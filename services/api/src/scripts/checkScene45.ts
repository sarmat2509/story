import { db } from '../db/index.js';
import { scenes } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function checkScene() {
  const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';
  
  const storyScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyId, storyId))
    .orderBy(scenes.sceneId);
  
  // Check scene 4 and 5
  for (const scene of [storyScenes[3], storyScenes[4]]) {
    console.log(`\n=== Scene ${scene.sceneId} ===`);
    console.log('Has image:', !!scene.imageUrl);
    console.log('Is reference:', scene.isReferenceImage);
    console.log('Characters present:', scene.charactersPresent);
    console.log('\nText:');
    console.log(scene.text);
  }
  
  process.exit(0);
}

checkScene().catch(console.error);
