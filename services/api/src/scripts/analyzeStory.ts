/**
 * Story Analysis Script
 * Analyzes story structure, scenes, audio tags, and image generation
 */

import db from '../db';
import { stories, scenes, assets } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { hasAudioTags, extractAudioTags, stripAudioTags } from '../utils/audioTags';

const STORY_ID = 'be8e167d-e3d3-4253-a053-80c6b7832bcf';

async function analyzeStory() {
  console.log('========================================');
  console.log('STORY ANALYSIS');
  console.log('========================================\n');

  // 1. Get story metadata
  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, STORY_ID))
    .limit(1);

  if (!story) {
    console.error('❌ Story not found!');
    process.exit(1);
  }

  console.log('📖 Story Metadata:');
  console.log('  ID:', story.id);
  console.log('  Title:', story.title);
  console.log('  Language:', story.language);
  console.log('  Age Group:', story.ageGroup);
  console.log('  Word Count:', story.wordCount);
  console.log('  Created:', story.createdAt);
  console.log('  Has Audio Metadata:', !!story.audioMetadata);
  
  if (story.audioMetadata) {
    const audioMeta = story.audioMetadata as any;
    console.log('    Voice ID:', audioMeta.voiceId);
    console.log('    Voice Name:', audioMeta.voiceName);
    console.log('    Total Duration:', audioMeta.totalDuration);
    console.log('    Night Mode:', audioMeta.nightMode);
  }
  console.log();

  // 2. Get all scenes
  const storyScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyId, STORY_ID))
    .orderBy(scenes.sceneId);

  console.log('🎬 Scenes Analysis:');
  console.log('  Total Scenes:', storyScenes.length);
  console.log();

  // Track statistics
  let scenesWithAudioTags = 0;
  let scenesWithoutAudioTags = 0;
  let totalAudioTags = 0;
  const uniqueAudioTags = new Set<string>();

  // 3. Get all image assets
  const imageAssets = await db
    .select()
    .from(assets)
    .where(and(
      eq(assets.storyId, STORY_ID),
      eq(assets.assetType, 'image')
    ));

  // Map scene UUID to asset for quick lookup
  const sceneAssetMap = new Map<string, any>();
  imageAssets.forEach(asset => {
    if (asset.sceneId) {
      sceneAssetMap.set(asset.sceneId, asset);
    }
  });

  // 4. Analyze each scene
  for (const scene of storyScenes) {
    console.log('─────────────────────────────────────');
    console.log(`Scene ${scene.sceneId}:`);
    console.log('  Scene UUID:', scene.id);
    console.log();

    // Text analysis
    const textHasTags = hasAudioTags(scene.text);
    const audioTags = extractAudioTags(scene.text);
    const cleanText = stripAudioTags(scene.text);

    if (textHasTags) {
      scenesWithAudioTags++;
    } else {
      scenesWithoutAudioTags++;
    }
    totalAudioTags += audioTags.length;
    audioTags.forEach(tag => uniqueAudioTags.add(tag));

    console.log('  📝 Text:');
    console.log('    Length:', scene.text.length, 'chars');
    console.log('    Word Count:', scene.text.split(/\s+/).length);
    console.log('    Has Audio Tags:', textHasTags ? '✅' : '❌');
    
    if (textHasTags) {
      console.log('    Audio Tags Found:', audioTags.length);
      console.log('    Tags:', audioTags.join(', '));
    }
    
    console.log('    Clean Text (first 150 chars):');
    console.log('      "' + cleanText.substring(0, 150) + '..."');
    console.log();

    // Visual prompt analysis
    const visualPromptHasTags = hasAudioTags(scene.visualPrompt);
    const cleanVisualPrompt = stripAudioTags(scene.visualPrompt);

    console.log('  🎨 Visual Prompt:');
    console.log('    Length:', scene.visualPrompt.length, 'chars');
    console.log('    Has Audio Tags:', visualPromptHasTags ? '⚠️  (should be clean!)' : '✅');
    console.log('    Content:');
    console.log('      "' + cleanVisualPrompt + '"');
    console.log();

    // Image asset analysis
    const imageAsset = sceneAssetMap.get(scene.id);
    console.log('  🖼️  Image Asset:');
    
    if (imageAsset) {
      console.log('    Status: ✅ Generated');
      console.log('    Asset ID:', imageAsset.id);
      console.log('    Status:', imageAsset.status);
      console.log('    Storage Path:', imageAsset.storagePath);
      console.log('    File Size:', imageAsset.fileSizeBytes ? 
        (imageAsset.fileSizeBytes / 1024).toFixed(2) + ' KB' : 'unknown');
      console.log('    Generation Time:', imageAsset.generationTimeMs ? 
        (imageAsset.generationTimeMs / 1000).toFixed(2) + 's' : 'unknown');
      
      if (imageAsset.generationParams) {
        console.log('    Generation Params:', JSON.stringify(imageAsset.generationParams, null, 2)
          .split('\n')
          .map((line, i) => i === 0 ? line : '      ' + line)
          .join('\n'));
      }
    } else {
      console.log('    Status: ❌ Not generated');
    }
    console.log();
  }

  // 5. Summary statistics
  console.log('========================================');
  console.log('SUMMARY STATISTICS');
  console.log('========================================\n');

  console.log('📊 Scenes:');
  console.log('  Total:', storyScenes.length);
  console.log('  With Audio Tags:', scenesWithAudioTags, 
    '(' + ((scenesWithAudioTags / storyScenes.length) * 100).toFixed(1) + '%)');
  console.log('  Without Audio Tags:', scenesWithoutAudioTags,
    '(' + ((scenesWithoutAudioTags / storyScenes.length) * 100).toFixed(1) + '%)');
  console.log();

  console.log('🎵 Audio Tags:');
  console.log('  Total Tags Used:', totalAudioTags);
  console.log('  Unique Tags:', uniqueAudioTags.size);
  console.log('  Tag List:', Array.from(uniqueAudioTags).join(', ') || 'none');
  console.log();

  console.log('🖼️  Images:');
  console.log('  Total Images Generated:', imageAssets.length);
  console.log('  Scenes with Images:', sceneAssetMap.size,
    '(' + ((sceneAssetMap.size / storyScenes.length) * 100).toFixed(1) + '%)');
  console.log('  Scenes without Images:', storyScenes.length - sceneAssetMap.size);
  
  // List scenes without images
  if (sceneAssetMap.size < storyScenes.length) {
    const scenesWithoutImages = storyScenes
      .filter(s => !sceneAssetMap.has(s.id))
      .map(s => s.sceneId);
    console.log('  Missing Images for Scenes:', scenesWithoutImages.join(', '));
  }
  console.log();

  // Check for issues
  console.log('⚠️  Issues Detected:');
  let issueCount = 0;

  if (scenesWithoutAudioTags > 0) {
    console.log('  - ' + scenesWithoutAudioTags + ' scenes missing audio tags');
    issueCount++;
  }

  const scenesWithTaggedPrompts = storyScenes.filter(s => hasAudioTags(s.visualPrompt));
  if (scenesWithTaggedPrompts.length > 0) {
    console.log('  - ' + scenesWithTaggedPrompts.length + 
      ' scenes have audio tags in visualPrompt (should be clean for image gen)');
    console.log('    Affected scenes:', scenesWithTaggedPrompts.map(s => s.sceneId).join(', '));
    issueCount++;
  }

  if (sceneAssetMap.size < storyScenes.length) {
    console.log('  - ' + (storyScenes.length - sceneAssetMap.size) + ' scenes missing images');
    issueCount++;
  }

  if (issueCount === 0) {
    console.log('  ✅ No issues detected!');
  }

  console.log();
  process.exit(0);
}

analyzeStory().catch((error) => {
  console.error('❌ Analysis failed:', error);
  process.exit(1);
});
