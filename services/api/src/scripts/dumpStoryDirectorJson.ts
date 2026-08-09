/**
 * Print Director-shaped JSON stored for a story (metadata + illustration anchors).
 * Usage: npx tsx src/scripts/dumpStoryDirectorJson.ts <storyId>
 */

import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { stories, storyDirectorScenes } from '../db/schema';

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
  const directorRows = await db
    .select()
    .from(storyDirectorScenes)
    .where(eq(storyDirectorScenes.storyId, storyId))
    .orderBy(asc(storyDirectorScenes.illustrationBlockIndex), asc(storyDirectorScenes.sceneIndex));
  const illustrations = directorRows
    .filter((row) => row.isBlockAnchor)
    .map((row) => ({
      environmentId: row.environmentId,
      sceneVisual: row.sceneVisual,
    }));

  // Stories created before story_director_scenes existed keep their Director
  // anchors on the legacy scenes JSON column.
  if (illustrations.length === 0) {
    const illScenes = scenes.filter((s) => {
      const sv = s.sceneVisual as Record<string, unknown> | undefined;
      return sv && (sv.setting != null || sv.cameraComposition != null);
    });
    illustrations.push(
      ...illScenes.map((s) => ({
        environmentId: s.environmentId,
        sceneVisual: s.sceneVisual,
      })),
    );
  }

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
