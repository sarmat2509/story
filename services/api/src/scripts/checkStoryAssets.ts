/**
 * Check assets for a specific story
 * Run with: npx tsx src/scripts/checkStoryAssets.ts <storyId>
 */

import { db } from '../db';
import { assets, scenes } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

async function checkStoryAssets() {
  const storyId = process.argv[2];
  
  if (!storyId) {
    console.error('Usage: npx tsx src/scripts/checkStoryAssets.ts <storyId>');
    process.exit(1);
  }
  
  logger.info({ storyId }, 'Checking assets for story');
  
  try {
    // Get all assets for the story
    const storyAssets = await db
      .select()
      .from(assets)
      .where(eq(assets.storyId, storyId));
    
    logger.info({ count: storyAssets.length }, 'Found assets');
    
    for (const asset of storyAssets) {
      logger.info({
        id: asset.id,
        sceneId: asset.sceneId,
        assetType: asset.assetType,
        storageUrl: asset.storageUrl,
        signedUrl: asset.signedUrl?.substring(0, 100) + '...',
        status: asset.status,
        generationParams: asset.generationParams,
      }, 'Asset');
    }
    
    // Get all scenes
    const storyScenes = await db
      .select()
      .from(scenes)
      .where(eq(scenes.storyId, storyId));
    
    logger.info({ count: storyScenes.length }, 'Found scenes');
    
    for (const scene of storyScenes) {
      logger.info({
        id: scene.id,
        sceneId: scene.sceneId,
        text: scene.text.substring(0, 100) + '...',
        visualPrompt: scene.visualPrompt.substring(0, 100) + '...',
      }, 'Scene');
    }
    
    process.exit(0);
    
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to check assets');
    process.exit(1);
  }
}

checkStoryAssets();
