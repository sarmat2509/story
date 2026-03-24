/**
 * Print Director-shaped JSON stored for a story (metadata + illustration anchors).
 * Usage: npx tsx src/scripts/dumpStoryDirectorJson.ts <storyId>
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { stories } from '../db/schema';

const storyId = process.argv[2];
if (!storyId) {
  console.error('Usage: npx tsx src/scripts/dumpStoryDirectorJson.ts <storyId>');
  process.exit(1);
}

async function run() {
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.error('Story not found:', storyId);
    process.exit(1);
  }

  const scenes = ((story.scenes as Array<Record<string, unknown>>) || []).sort(
    (a, b) => (a.sceneId as number) - (b.sceneId as number),
  );
  const meta = (story.metadata as Record<string, unknown>) || {};
  const illScenes = scenes.filter((s) => {
    const sv = s.sceneVisual as Record<string, unknown> | undefined;
    return sv && (sv.setting != null || sv.cameraComposition != null);
  });
  const illustrations = illScenes.map((s) => ({
    environmentId: s.environmentId,
    sceneVisual: s.sceneVisual,
  }));

  const directorOutput = {
    characters: (meta.llmGeneratedCharacters as unknown[]) || [],
    environments: (meta.environments as unknown[]) || [],
    outfits: (meta.outfits as unknown[]) || [],
    illustrations,
  };

  console.log(JSON.stringify(directorOutput, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
