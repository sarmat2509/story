/**
 * Backfill M9 Character Data
 * 
 * This script backfills missing M9 data for stories created before the migration:
 * - charactersPresent: Array of normalized character names per scene
 * - imageUrl: Denormalized storage path from assets table
 * - isReferenceImage: Flag for first image in story (used as reference)
 */

import { db } from '../db/index.js';
import { stories, scenes, assets, childProfiles } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { buildCharacterRegistry } from '../utils/characterNormalization.js';
import logger from '../utils/logger.js';

async function backfillSceneCharacters(storyId: string) {
  console.log(`\n=== Backfilling M9 data for story ${storyId} ===\n`);
  
  // 1. Load story
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  
  if (!story) {
    throw new Error(`Story not found: ${storyId}`);
  }
  
  console.log('✓ Story loaded:', story.title);
  
  // 2. Load all scenes
  const storyScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyId, storyId))
    .orderBy(scenes.sceneId);
  
  console.log(`✓ Loaded ${storyScenes.length} scenes`);
  
  // 3. Build character registry
  const metadata = story.metadata as any;
  
  // Get child profile if exists
  let childProfile: any = undefined;
  if (story.childProfileId) {
    const [profile] = await db.select().from(childProfiles).where(eq(childProfiles.id, story.childProfileId));
    childProfile = profile;
  }
  
  const registry = buildCharacterRegistry(
    metadata?.mergedCharacters || [],
    childProfile,
    metadata?.llmGeneratedCharacters || []
  );
  
  console.log(`✓ Character registry built with ${registry.size} characters:`);
  for (const [normalized, info] of registry.entries()) {
    console.log(`  - ${info.normalizedName} (original: ${info.originalName}, source: ${info.source})`);
  }
  
  // 4. Process each scene
  let firstImageFound = false;
  let updatedCount = 0;
  
  for (const scene of storyScenes) {
    console.log(`\nProcessing Scene ${scene.sceneId}...`);
    
    // 4.1 Find character mentions in scene text
    const presentCharacters: string[] = [];
    
    for (const [normalizedName, info] of registry.entries()) {
      // Check if original name appears in scene text
      const found = scene.text.toLowerCase().includes(info.originalName.toLowerCase());
      
      if (found) {
        presentCharacters.push(normalizedName);
      }
    }
    
    console.log(`  Characters present: ${presentCharacters.join(', ') || 'none'}`);
    
    // 4.2 Find imageUrl from assets table
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(
        eq(assets.sceneId, scene.id),
        eq(assets.assetType, 'image')
      ))
      .limit(1);
    
    const imageUrl = asset?.storagePath || null;
    
    if (imageUrl) {
      console.log(`  ✓ Has image: ${imageUrl}`);
    } else {
      console.log(`  - No image`);
    }
    
    // 4.3 Determine if this is the reference image (first image in story)
    const isReference = imageUrl && !firstImageFound;
    if (isReference) {
      firstImageFound = true;
      console.log(`  ★ Marking as REFERENCE IMAGE (first image in story)`);
    }
    
    // 4.4 Update scene in database
    await db.update(scenes)
      .set({
        charactersPresent: presentCharacters.length > 0 ? presentCharacters : null,
        imageUrl: imageUrl,
        isReferenceImage: isReference || false
      })
      .where(eq(scenes.id, scene.id));
    
    updatedCount++;
    console.log(`  ✓ Scene updated`);
  }
  
  console.log(`\n=== Backfill Complete ===`);
  console.log(`✓ Updated ${updatedCount} scenes`);
  console.log(`✓ Reference image: ${firstImageFound ? 'SET' : 'NOT FOUND'}`);
  
  // 5. Verify results
  console.log(`\n=== Verification ===`);
  const updatedScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyId, storyId))
    .orderBy(scenes.sceneId);
  
  for (const scene of updatedScenes) {
    if (scene.imageUrl || scene.charactersPresent || scene.isReferenceImage) {
      console.log(`\nScene ${scene.sceneId}:`);
      console.log(`  Characters: ${(scene.charactersPresent as string[])?.join(', ') || 'none'}`);
      console.log(`  Image: ${scene.imageUrl ? '✓' : '✗'}`);
      console.log(`  Reference: ${scene.isReferenceImage ? '★ YES' : 'no'}`);
    }
  }
}

// Main execution
const storyId = process.argv[2];

if (!storyId) {
  console.error('Usage: npx tsx src/scripts/backfillSceneCharacters.ts <storyId>');
  process.exit(1);
}

backfillSceneCharacters(storyId)
  .then(() => {
    console.log('\n✓ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Error:', error);
    process.exit(1);
  });
