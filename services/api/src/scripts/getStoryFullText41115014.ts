import { db } from '../db/index.js';
import { stories, scenes } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';

async function getStoryFullText() {
  console.log('📖 Extracting full story text with tags');
  console.log('━'.repeat(80));
  console.log('');

  // Get story
  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId));

  if (!story) {
    console.log('❌ Story not found');
    process.exit(1);
  }

  // Get scenes
  const storyScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyId, storyId));

  // Sort by scene number
  storyScenes.sort((a, b) => a.sceneNumber - b.sceneNumber);

  console.log(`📚 Story: "${story.title}"`);
  console.log(`📝 Total scenes: ${storyScenes.length}`);
  console.log('');
  console.log('━'.repeat(80));
  console.log('');

  // Print full text with scene markers
  for (const scene of storyScenes) {
    console.log(`═══════════════════════════════════════════════════════════════════════════════`);
    console.log(`📄 SCENE ${scene.sceneNumber}`);
    console.log(`═══════════════════════════════════════════════════════════════════════════════`);
    console.log('');
    console.log(scene.text || '(Empty scene)');
    console.log('');
  }

  console.log('━'.repeat(80));
  console.log('✅ Full story text extracted');
  console.log('');

  process.exit(0);
}

getStoryFullText().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
