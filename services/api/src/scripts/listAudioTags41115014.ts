import { db } from '../db/index.js';
import { stories, scenes } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const storyId = '41115014-fcd2-412a-9b35-d6d942a41707';

async function listAudioTags() {
  console.log('🔍 Extracting audio tags from story:', storyId);
  console.log('');

  // Get story and scenes
  const [story] = await db
    .select()
    .from(stories)
    .where(eq(stories.id, storyId));

  if (!story) {
    console.log('❌ Story not found');
    process.exit(1);
  }

  const storyScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.storyId, storyId));

  console.log(`📖 Story: "${story.title}"`);
  console.log(`📝 Total scenes: ${storyScenes.length}`);
  console.log('');

  // Extract all audio tags in square brackets: [tag] or [tag: value]
  const audioTagRegex = /\[([^\]]+)\]/g;
  const allTags: Array<{
    tag: string;
    value: string;
    fullText: string;
    sceneNumber: number;
    context: string; // Text around the tag
  }> = [];

  for (const scene of storyScenes) {
    const text = scene.text || '';
    let match;

    while ((match = audioTagRegex.exec(text)) !== null) {
      const fullTag = match[1]; // Content inside brackets
      const [tag, ...valueParts] = fullTag.split(':').map(s => s.trim());
      const value = valueParts.join(':').trim();
      
      // Get context (30 chars before and after)
      const matchIndex = match.index;
      const contextStart = Math.max(0, matchIndex - 30);
      const contextEnd = Math.min(text.length, matchIndex + match[0].length + 30);
      const context = text.substring(contextStart, contextEnd);
      
      allTags.push({
        tag,
        value,
        fullText: match[0],
        sceneNumber: scene.sceneNumber,
        context,
      });
    }
  }

  // Group by tag type
  const tagsByType = allTags.reduce((acc, item) => {
    if (!acc[item.tag]) {
      acc[item.tag] = [];
    }
    acc[item.tag].push(item);
    return acc;
  }, {} as Record<string, typeof allTags>);

  console.log('📊 Audio Tags Summary:');
  console.log('━'.repeat(80));
  console.log('');

  for (const [tagName, tags] of Object.entries(tagsByType)) {
    console.log(`🏷️  [${tagName}] - Used ${tags.length} times`);
    console.log('');

    // Show unique values
    const uniqueValues = new Set(tags.map(t => t.value));
    console.log(`   Unique values: ${uniqueValues.size}`);
    
    for (const value of uniqueValues) {
      const count = tags.filter(t => t.value === value).length;
      const displayValue = value || '(no value)';
      console.log(`   - ${displayValue}: ${count} times`);
    }
    console.log('');

    // Show examples
    console.log('   Examples with context:');
    const examples = tags.slice(0, 3);
    for (const example of examples) {
      console.log(`   Scene ${example.sceneNumber}:`);
      console.log(`     Tag: ${example.fullText}`);
      console.log(`     Context: ...${example.context}...`);
      console.log('');
    }
    console.log('─'.repeat(80));
    console.log('');
  }

  // Overall statistics
  console.log('📈 Overall Statistics:');
  console.log(`   Total audio tags: ${allTags.length}`);
  console.log(`   Unique tag types: ${Object.keys(tagsByType).length}`);
  console.log(`   Tags per scene (avg): ${(allTags.length / storyScenes.length).toFixed(2)}`);
  console.log('');

  // Show all tags with full content
  console.log('📋 Complete List (all tags):');
  console.log('━'.repeat(80));
  console.log('');

  for (const tag of allTags) {
    console.log(`Scene ${tag.sceneNumber}: ${tag.fullText}`);
    if (tag.value) {
      console.log(`  Value: "${tag.value}"`);
    }
    console.log(`  Context: ...${tag.context}...`);
    console.log('');
  }

  process.exit(0);
}

listAudioTags().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
