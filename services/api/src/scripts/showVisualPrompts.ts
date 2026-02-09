import { db } from '../db/index.js';
import { scenes } from '../db/schema.js';
import { eq } from 'drizzle-orm';

async function showVisualPrompts() {
  const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';
  
  const storyScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyId, storyId))
    .orderBy(scenes.sceneId);
  
  console.log('\n=== VISUAL PROMPTS FOR ALL SCENES ===\n');
  
  for (const scene of storyScenes) {
    console.log(`\n--- Scene ${scene.sceneId} ---`);
    console.log('Has image:', !!scene.imageUrl ? '✓' : '✗');
    console.log('Is reference:', scene.isReferenceImage ? '★' : '-');
    console.log('Characters detected:', (scene.charactersPresent as string[] || []).join(', '));
    console.log('\nVisual Prompt:');
    console.log(scene.visualPrompt);
    console.log('\n' + '='.repeat(80));
  }
  
  process.exit(0);
}

showVisualPrompts().catch(console.error);
