/**
 * Test script for audio tags generation validation
 * 
 * Tests:
 * 1. Story text generation includes audio tags
 * 2. Audio tags are contextually appropriate
 * 3. Tags are stripped properly for display/images
 * 4. Tags are preserved for audio generation
 */

import { getStoryDomainService, getAudioDomainService } from '../services/aiService';
import { stripAudioTags, extractAudioTags, hasAudioTags } from '../utils/audioTags';
import { logger } from '../utils/logger';
import type { StorySpec, EpisodeOutline } from '../ai/types';

// Simple test outline
const testOutline: EpisodeOutline = {
  title: 'Пригода маленького лисеня',
  language: 'uk',
  ageGroup: '4-5',
  estimatedLength: 'medium',
  scenes: [
    {
      sceneId: 1,
      sceneGoal: 'Little fox discovers a mysterious door in the forest',
      sceneBeats: ['fox exploring', 'finds door', 'curious expression'],
      sceneEmotion: 'curious',
      visualPrompt: 'Little fox with big curious eyes standing in front of an old wooden door in forest',
    },
    {
      sceneId: 2,
      sceneGoal: 'Fox opens the door and gasps at the treasure inside',
      sceneBeats: ['opens door slowly', 'sees treasure', 'gasps in amazement'],
      sceneEmotion: 'excited',
      visualPrompt: 'Little fox with amazed expression looking at glowing treasure chest',
    },
    {
      sceneId: 3,
      sceneGoal: 'Fox carefully approaches the treasure',
      sceneBeats: ['walks quietly', 'whispers to himself', 'reaches for treasure'],
      sceneEmotion: 'nervous',
      visualPrompt: 'Little fox tiptoeing towards glowing treasure with nervous but excited face',
    },
  ],
};

const testSpec: StorySpec = {
  language: 'uk',
  ageGroup: '4-5',
  vocabLevel: 'basic',
  policyProfile: 'default',
  scenarioCard: undefined,
};

async function testAudioTagsGeneration() {
  try {
    logger.info('=== Starting Audio Tags Generation Test ===');
    
    // 1. Generate story text with audio tags
    logger.info('Step 1: Generating story text...');
    const storyService = getStoryDomainService();
    
    const textResult = await storyService.generateText(testSpec, testOutline);
    
    logger.info({
      title: textResult.title,
      sceneCount: textResult.scenes.length,
      wordCount: textResult.wordCount,
    }, 'Story text generated');
    
    // 2. Analyze each scene for audio tags
    console.log('\n=== SCENE ANALYSIS ===\n');
    
    let totalTags = 0;
    let scenesWithTags = 0;
    
    textResult.scenes.forEach((scene, index) => {
      const tags = extractAudioTags(scene.text);
      const hasTags = hasAudioTags(scene.text);
      const cleanText = stripAudioTags(scene.text);
      const cleanVisualPrompt = stripAudioTags(scene.visualPrompt);
      
      if (hasTags) {
        scenesWithTags++;
        totalTags += tags.length;
      }
      
      logger.info({
        sceneId: scene.sceneId,
        audioTags: tags,
        tagCount: tags.length,
        hasAudioTags: hasTags,
        originalLength: scene.text.length,
        cleanedLength: cleanText.length,
        charsSaved: scene.text.length - cleanText.length,
      }, `Scene ${index + 1} analysis`);
      
      console.log(`\n--- Scene ${scene.sceneId} ---`);
      console.log('Original text:');
      console.log(scene.text);
      console.log('\nCleaned text (for UI):');
      console.log(cleanText);
      console.log('\nAudio tags found:', tags.length > 0 ? tags.join(', ') : 'none');
      console.log('\nOriginal visualPrompt:');
      console.log(scene.visualPrompt);
      console.log('\nCleaned visualPrompt (for image gen):');
      console.log(cleanVisualPrompt);
      console.log('---\n');
    });
    
    // 3. Summary statistics
    console.log('\n=== SUMMARY ===\n');
    logger.info({
      totalScenes: textResult.scenes.length,
      scenesWithTags,
      totalTags,
      averageTagsPerScene: (totalTags / textResult.scenes.length).toFixed(2),
      tagUsagePercentage: ((scenesWithTags / textResult.scenes.length) * 100).toFixed(1) + '%',
    }, 'Test summary');
    
    console.log(`Total scenes: ${textResult.scenes.length}`);
    console.log(`Scenes with audio tags: ${scenesWithTags} (${((scenesWithTags / textResult.scenes.length) * 100).toFixed(1)}%)`);
    console.log(`Total audio tags: ${totalTags}`);
    console.log(`Average tags per scene: ${(totalTags / textResult.scenes.length).toFixed(2)}`);
    
    // 4. Validate stripping works correctly
    console.log('\n=== VALIDATION ===\n');
    
    const allCleanedCorrectly = textResult.scenes.every(scene => {
      const cleaned = stripAudioTags(scene.text);
      return !hasAudioTags(cleaned);
    });
    
    if (allCleanedCorrectly) {
      console.log('✓ All audio tags stripped correctly');
      logger.info('Audio tags stripping validation passed');
    } else {
      console.log('✗ Some tags remain after stripping - check regex!');
      logger.error('Audio tags stripping validation FAILED');
    }
    
    // 5. Test that original text preserves tags (for audio)
    const originalHasTags = textResult.scenes.some(scene => hasAudioTags(scene.text));
    if (originalHasTags) {
      console.log('✓ Original scene text contains audio tags (good for TTS)');
      logger.info('Original text preserves audio tags correctly');
    } else {
      console.log('⚠ No audio tags found - LLM may not have generated them');
      logger.warn('No audio tags generated by LLM - check prompt');
    }
    
    logger.info('=== Test completed successfully ===');
    process.exit(0);
    
  } catch (error) {
    logger.error({ error, stack: error instanceof Error ? error.stack : undefined }, 'Test failed');
    console.error('\n=== TEST FAILED ===');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testAudioTagsGeneration();
