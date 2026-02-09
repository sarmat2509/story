import { db } from '../db/index.js';
import { stories, scenes, assets, audioAssets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function checkStoryStatus() {
  const storyId = process.argv[2];

  if (!storyId) {
    console.log('Usage: npx tsx src/scripts/checkStoryStatus.ts <storyId>');
    process.exit(1);
  }

  console.log('📖 Checking story status for:', storyId);
  console.log('='.repeat(60));

  // Get story
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.log('❌ Story not found');
    process.exit(1);
  }

  console.log('\n✅ STORY FOUND:');
  console.log('  Title:', story.title);
  console.log('  Status:', story.isPublished ? 'Published' : 'Draft');
  console.log('  Created:', story.createdAt);
  console.log('  Has text:', !!story.text);
  console.log('  Has metadata:', !!story.metadata);
  console.log('  Has audio metadata:', !!story.audioMetadata);
  console.log('  Language:', (story.metadata as any)?.language || 'N/A');
  console.log('  Age group:', (story.metadata as any)?.ageGroup || 'N/A');

  // Get scenes
  const storyScenes = await db.select().from(scenes).where(eq(scenes.storyId, storyId));
  console.log('\n📑 SCENES:', storyScenes.length);
  if (storyScenes.length > 0) {
    for (const scene of storyScenes.sort((a, b) => a.sceneId - b.sceneId)) {
      const hasText = !!scene.text;
      const textPreview = scene.text ? scene.text.substring(0, 50) + '...' : 'No text';
      console.log(`  Scene ${scene.sceneId}: ${hasText ? '✅' : '❌'} ${textPreview}`);
    }
  } else {
    console.log('  ❌ No scenes found');
  }

  // Get images
  const imageAssets = await db.select().from(assets).where(eq(assets.storyId, storyId));
  console.log('\n🖼️  IMAGES:', imageAssets.length);
  if (imageAssets.length > 0) {
    const sortedImages = imageAssets.sort((a, b) => {
      const aScene = (a.metadata as any)?.sceneId || 0;
      const bScene = (b.metadata as any)?.sceneId || 0;
      return aScene - bScene;
    });
    for (const img of sortedImages) {
      const sceneId = (img.metadata as any)?.sceneId || 'N/A';
      console.log(`  Scene ${sceneId}: ${img.assetType} - Status: ${img.status}`);
    }
  } else {
    console.log('  ❌ No images found');
  }

  // Get audio
  const audioList = await db
    .select()
    .from(audioAssets)
    .where(eq(audioAssets.storyId, storyId));

  console.log('\n🔊 AUDIO ASSETS:', audioList.length);
  if (audioList.length > 0) {
    for (const audio of audioList.sort((a, b) => {
      const aIdx = a.sceneGroupIndex ?? 9999;
      const bIdx = b.sceneGroupIndex ?? 9999;
      return aIdx - bIdx;
    })) {
      const isFinal = audio.sceneGroupIndex === null;
      console.log(`  ${isFinal ? '🎵 FINAL' : `Chunk ${audio.sceneGroupIndex}`}:`);
      console.log(`    Status: ${audio.status}`);
      console.log(`    Duration: ${audio.durationSeconds}s`);
      console.log(`    Voice: ${audio.voiceId}`);
      if (audio.textHash) {
        console.log(`    Text hash: ${audio.textHash.substring(0, 16)}...`);
      }
    }
  } else {
    console.log('  ❌ No audio found');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY:');
  console.log(`  Story text: ${story.text ? '✅' : '❌'}`);
  console.log(`  Scenes: ${storyScenes.length > 0 ? '✅' : '❌'} (${storyScenes.length})`);
  console.log(`  Images: ${imageAssets.length > 0 ? '✅' : '❌'} (${imageAssets.length})`);
  console.log(`  Audio: ${audioList.length > 0 ? '✅' : '❌'} (${audioList.length} chunks)`);

  const hasAllContent = story.text && storyScenes.length > 0 && imageAssets.length > 0;
  console.log(`\nStory generation: ${hasAllContent ? '✅ Complete' : '⚠️ Incomplete'}`);
  console.log(`Audio generation: ${audioList.length > 0 ? '✅ Complete' : '❌ Not generated'}`);

  process.exit(0);
}

checkStoryStatus().catch((error) => {
  console.error('Error checking story status:', error);
  process.exit(1);
});
