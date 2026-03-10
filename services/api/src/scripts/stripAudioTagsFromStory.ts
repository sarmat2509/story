/**
 * Strip all tags ([content], <tag>...</tag>, <tag />) from a story's text in the database.
 * Usage: npx tsx src/scripts/stripAudioTagsFromStory.ts <storyId>
 *
 * Updates: stories.fullText, scenes.text, stories.scenes (JSONB if present).
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '../../.env') });
config({ path: path.resolve(process.cwd(), '../../.env.local') });

import { db } from '../db';
import { stories, scenes } from '../db/schema';
import { eq } from 'drizzle-orm';
import { stripAllTags } from '../utils/audioTags';

const storyId = process.argv[2] || '';

async function run() {
  if (!storyId) {
    console.log('Usage: npx tsx src/scripts/stripAudioTagsFromStory.ts <storyId>');
    process.exit(1);
  }

  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.log('Story not found:', storyId);
    process.exit(1);
  }

  console.log('Story:', story.title);
  let changed = false;

  // 1. Update fullText
  const cleanedFullText = stripAllTags(story.fullText || '');
  if (cleanedFullText !== story.fullText) {
    await db
      .update(stories)
      .set({ fullText: cleanedFullText, updatedAt: new Date() })
      .where(eq(stories.id, storyId));
    console.log('Updated fullText');
    changed = true;
  }

  // 2. Update scenes table
  const storyScenes = await db.select().from(scenes).where(eq(scenes.storyId, storyId)).orderBy(scenes.sceneId);
  for (const scene of storyScenes) {
    const cleanedText = stripAllTags(scene.text || '');
    if (cleanedText !== scene.text) {
      await db.update(scenes).set({ text: cleanedText, updatedAt: new Date() }).where(eq(scenes.id, scene.id));
      console.log(`Updated scene ${scene.sceneId} text`);
      changed = true;
    }
  }

  // 3. Update stories.scenes JSONB (deprecated but may still be used)
  const scenesJson = story.scenes as Array<{ sceneId?: number; text?: string; visualPrompt?: string }> | null;
  if (Array.isArray(scenesJson) && scenesJson.length > 0) {
    let scenesChanged = false;
    const updatedScenes = scenesJson.map((s) => {
      const cleaned = stripAllTags(s.text || '');
      if (cleaned !== s.text) {
        scenesChanged = true;
        return { ...s, text: cleaned };
      }
      return s;
    });
    if (scenesChanged) {
      await db
        .update(stories)
        .set({ scenes: updatedScenes, updatedAt: new Date() })
        .where(eq(stories.id, storyId));
      console.log('Updated stories.scenes JSONB');
      changed = true;
    }
  }

  if (!changed) {
    console.log('No audio tags found — nothing to update.');
  } else {
    console.log('Done.');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
