import { db } from '../db/index.js';
import { stories, scenes, assets } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

async function analyzeStory() {
  const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';
  
  // Get story
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  
  if (!story) {
    console.log('Story not found');
    process.exit(1);
  }
  
  console.log('\n=== STORY INFO ===');
  console.log('Title:', story.title);
  console.log('Language:', story.language);
  console.log('Age Group:', story.ageGroup);
  
  const metadata = story.metadata as any;
  console.log('\n=== CHARACTERS ===');
  console.log('Merged Characters:', metadata?.mergedCharacters?.map(c => c.name).join(', '));
  console.log('LLM Characters:', metadata?.llmGeneratedCharacters?.map(c => c.name).join(', '));
  
  // Get all scenes
  const storyScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyId, storyId))
    .orderBy(scenes.sceneId);
  
  console.log('\n=== SCENES ===');
  console.log('Total scenes:', storyScenes.length);
  
  for (const scene of storyScenes) {
    console.log(`\n--- Scene ${scene.sceneId} ---`);
    console.log('Scene DB ID:', scene.id);
    console.log('Text preview:', scene.text.slice(0, 100) + '...');
    console.log('Visual prompt:', scene.visualPrompt ? 'YES' : 'NO');
    console.log('Image URL:', scene.imageUrl || 'NULL');
    console.log('Characters present:', scene.charactersPresent || 'NULL');
    console.log('Is reference:', scene.isReferenceImage || false);
    
    // Check assets
    const sceneAssets = await db
      .select()
      .from(assets)
      .where(and(
        eq(assets.sceneId, scene.id),
        eq(assets.assetType, 'image')
      ));
    
    if (sceneAssets.length > 0) {
      console.log('✓ HAS IMAGE:');
      console.log('  Storage path:', sceneAssets[0].storagePath);
      console.log('  Generation params:', JSON.stringify(sceneAssets[0].generationParams));
    } else {
      console.log('✗ NO IMAGE');
    }
  }
  
  process.exit(0);
}

analyzeStory().catch(console.error);
