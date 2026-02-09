import { db } from '../db/index.js';
import { scenes, assets } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

async function checkSceneImages() {
  const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';
  
  console.log('Checking story:', storyId);
  
  const storyScenes = await db.select().from(scenes).where(eq(scenes.storyId, storyId));
  console.log('\nScenes count:', storyScenes.length);
  
  for (const scene of storyScenes) {
    console.log('\n--- Scene', scene.sceneId, '---');
    console.log('Scene ID (DB):', scene.id);
    console.log('Image URL field:', scene.imageUrl);
    
    // Check assets table
    const sceneAssets = await db
      .select()
      .from(assets)
      .where(and(
        eq(assets.sceneId, scene.id),
        eq(assets.assetType, 'image')
      ));
    
    console.log('Assets count:', sceneAssets.length);
    if (sceneAssets.length > 0) {
      console.log('First asset URL:', sceneAssets[0].url);
      console.log('First asset storage path:', sceneAssets[0].storagePath);
    }
  }
  
  process.exit(0);
}

checkSceneImages().catch(console.error);
