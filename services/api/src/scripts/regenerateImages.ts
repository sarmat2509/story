/**
 * LEGACY / OPS ONLY — not the production image pipeline.
 * Uses generateSceneIllustration without character refs, env, or turnaround (unlike queue `image_batch` → processStoryImages).
 * Prefer fixing failed scenes via API regenerate or retry jobs. See storyOrchestrationService.processStoryImages.
 *
 * Run with: npx tsx src/scripts/regenerateImages.ts <storyId>
 */

import { db } from '../db';
import { stories, scenes, assets, storyRequests } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { ImageDomainService } from '../domain/image/ImageDomainService';
import { NanoBananaProProvider } from '../providers/image/nanobananapro/NanoBananaProProvider';
import { AssetStorageService } from '../services/assetStorageService';
import { config } from '../config';

async function regenerateImages() {
  const storyId = process.argv[2];
  
  if (!storyId) {
    console.error('Usage: npx tsx src/scripts/regenerateImages.ts <storyId>');
    process.exit(1);
  }
  
  logger.info({ storyId }, 'Starting image regeneration for story');
  
  try {
    // Get story details
    const [story] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1);
    
    if (!story) {
      logger.error({ storyId }, 'Story not found');
      process.exit(1);
    }
    
    // Get all scenes
    const storyScenes = await db
      .select()
      .from(scenes)
      .where(eq(scenes.storyId, storyId));
    
    logger.info({ sceneCount: storyScenes.length }, 'Found scenes');
    
    if (storyScenes.length === 0) {
      logger.warn('No scenes found for this story');
      process.exit(0);
    }
    
    // Initialize services
    const imageProvider = new NanoBananaProProvider(
      config.google.apiKey,
      config.image.simpleModel,
    );
    const imageDomain = new ImageDomainService(imageProvider);
    const assetStorage = new AssetStorageService();
    
    // Get story metadata for age group
    const metadata = story.metadata as any;
    const ageGroup = metadata?.ageGroup || '6-8';
    
    logger.info({ ageGroup }, 'Using age group from story metadata');
    
    // Generate images for each scene
    for (let i = 0; i < storyScenes.length; i++) {
      const scene = storyScenes[i];
      
      logger.info({ 
        sceneId: scene.sceneId,
        progress: `${i + 1}/${storyScenes.length}` 
      }, 'Generating image for scene');
      
      try {
        const startTime = Date.now();
        
        // Generate scene illustration (without references for simplicity)
        const image = await imageDomain.generateSceneIllustration({
          visualPrompt: scene.visualPrompt,
          sceneId: scene.sceneId,
          sceneText: scene.text,
          ageGroup: ageGroup,
          style: 'soft_watercolor',
          mode: 'without_references',
        });
        
        // Upload to storage
        const uploadResult = await assetStorage.uploadAsset({
          data: image.imageData,
          mimeType: image.mimeType,
          userId: story.userId,
          storyId: storyId,
          sceneId: scene.id,
          assetType: 'image',
        });
        
        // Save asset to database
        await db.insert(assets).values({
          storyId: storyId,
          sceneId: scene.id,
          assetType: 'image',
          storagePath: uploadResult.storagePath,
          storageUrl: uploadResult.storageUrl,
          signedUrl: uploadResult.signedUrl,
          signedUrlExpiresAt: uploadResult.signedUrlExpiresAt,
          mimeType: image.mimeType,
          fileSizeBytes: uploadResult.fileSizeBytes,
          generationParams: {
            mode: 'without_references',
            style: 'soft_watercolor',
            visualPrompt: scene.visualPrompt,
            regenerated: true,
          },
          generationTimeMs: Date.now() - startTime,
          status: 'completed',
        });
        
        logger.info({ 
          sceneId: scene.sceneId,
          duration: Date.now() - startTime,
          storageUrl: uploadResult.storageUrl,
        }, '✅ Scene image regenerated successfully');
        
      } catch (error: any) {
        logger.error({ 
          error: error.message,
          sceneId: scene.sceneId,
          stack: error.stack,
        }, '❌ Failed to generate image for scene');
        // Continue with other scenes
      }
    }
    
    logger.info({ storyId }, '✅ Image regeneration completed');
    process.exit(0);
    
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to regenerate images');
    process.exit(1);
  }
}

regenerateImages();
