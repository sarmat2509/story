/**
 * Test Script: Proactive Alignment Generation (M6)
 * Tests the on-demand alignment endpoint with a story that has audio but no alignment
 */

import { db } from '../db';
import { stories } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

async function testProactiveAlignment() {
  try {
    console.log('🧪 Testing Proactive Alignment Generation\n');
    
    // 1. Find a story with audio but no alignment
    console.log('📋 Step 1: Finding stories with audio but no alignment...');
    const allStories = await db
      .select({
        id: stories.id,
        title: stories.title,
        audioMetadata: stories.audioMetadata,
      })
      .from(stories)
      .limit(50);
    
    console.log(`   Found ${allStories.length} total stories`);
    
    const storiesWithAudio = allStories.filter(s => s.audioMetadata);
    console.log(`   ${storiesWithAudio.length} stories have audio`);
    
    const storiesWithoutAlignment = storiesWithAudio.filter(s => {
      const metadata = s.audioMetadata as any;
      return !metadata?.alignment;
    });
    
    console.log(`   ${storiesWithoutAlignment.length} stories have audio but NO alignment\n`);
    
    if (storiesWithoutAlignment.length === 0) {
      console.log('⚠️  No stories found with audio but without alignment.');
      console.log('   Options:');
      console.log('   1. Generate a new story with audio');
      console.log('   2. Manually remove alignment from an existing story:');
      console.log('      UPDATE stories SET audio_metadata = audio_metadata - \'alignment\' WHERE id = \'story-id\';');
      return;
    }
    
    // 2. Test with first story
    const testStory = storiesWithoutAlignment[0];
    console.log('📖 Step 2: Testing with story:');
    console.log(`   ID: ${testStory.id}`);
    console.log(`   Title: ${testStory.title}`);
    console.log(`   Audio metadata exists: ${!!testStory.audioMetadata}`);
    console.log(`   Alignment exists: ${!!(testStory.audioMetadata as any)?.alignment}\n`);
    
    // 3. Call alignment generation service (simulating API endpoint logic)
    console.log('⏳ Step 3: Generating alignment...');
    const { getAlignmentProvider } = await import('../services/aiService');
    const { getAudioDomainService } = await import('../domain/audio/AudioDomainService');
    const { audioAssets, assets } = await import('../db/schema');
    const { and } = await import('drizzle-orm');
    
    // Find final audio asset
    const finalAudioAssets = await db
      .select({
        audioAsset: audioAssets,
        asset: assets,
      })
      .from(audioAssets)
      .innerJoin(assets, eq(audioAssets.assetId, assets.id))
      .where(
        and(
          eq(audioAssets.storyId, testStory.id),
          eq(audioAssets.isFinal, true)
        )
      )
      .limit(1);
    
    if (finalAudioAssets.length === 0) {
      console.log('   ❌ No final audio asset found for this story');
      console.log('   This story may have incomplete audio generation');
      return;
    }
    
    const audioAssetId = finalAudioAssets[0].audioAsset.id;
    const assetId = finalAudioAssets[0].asset.id;
    console.log(`   ✅ Found final audio asset: ${audioAssetId} (asset: ${assetId})`);
    
    // Generate alignment
    const startTime = Date.now();
    const alignmentProvider = getAlignmentProvider();
    const audioDomain = getAudioDomainService();
    
    console.log(`   Using alignment provider: ${alignmentProvider.getProviderName()}`);
    
    const alignmentResult = await audioDomain.generateAlignmentForStory(
      testStory.id,
      audioAssetId,
      alignmentProvider
    );
    
    const duration = Date.now() - startTime;
    
    console.log('\n✅ Step 4: Alignment generated successfully!');
    console.log({
      durationMs: duration,
      durationSeconds: Math.round(duration / 1000),
      wordCount: alignmentResult.words.length,
      characterCount: alignmentResult.characters.length,
      averageConfidence: alignmentResult.averageConfidence?.toFixed(3),
      provider: alignmentProvider.getProviderName().toLowerCase(),
    });
    
    // 4. Update story metadata
    console.log('\n💾 Step 5: Updating story metadata...');
    const audioMetadata = testStory.audioMetadata as any;
    await db.update(stories)
      .set({
        audioMetadata: {
          ...audioMetadata,
          alignment: {
            characters: alignmentResult.characters,
            words: alignmentResult.words,
            averageConfidence: alignmentResult.averageConfidence,
            provider: alignmentProvider.getProviderName().toLowerCase(),
            language: alignmentResult.language,
            generatedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(stories.id, testStory.id));
    
    console.log('   ✅ Story metadata updated with alignment data');
    
    // 5. Verify alignment was saved
    console.log('\n🔍 Step 6: Verifying alignment data...');
    const [updatedStory] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, testStory.id))
      .limit(1);
    
    const updatedMetadata = updatedStory.audioMetadata as any;
    const hasAlignment = !!updatedMetadata?.alignment;
    
    console.log(`   Story now has alignment: ${hasAlignment}`);
    if (hasAlignment) {
      console.log(`   Word count: ${updatedMetadata.alignment.words.length}`);
      console.log(`   Average confidence: ${updatedMetadata.alignment.averageConfidence?.toFixed(3)}`);
      console.log(`   Provider: ${updatedMetadata.alignment.provider}`);
    }
    
    console.log('\n🎉 Test completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Open the story in the app (Story Viewer)');
    console.log(`   2. The "Читати разом" toggle should now be visible`);
    console.log('   3. Enable the toggle and play audio');
    console.log('   4. Watch sentence/word highlighting in action');
    console.log(`\n   Story ID: ${testStory.id}`);
    console.log(`   Story Title: ${testStory.title}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
    }
    throw error;
  } finally {
    process.exit(0);
  }
}

testProactiveAlignment().catch(console.error);
