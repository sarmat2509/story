/**
 * Set imageGenerationComplete to true for a story (fix stuck polling).
 * Usage: npx tsx src/scripts/setImageGenerationComplete.ts <storyId>
 *
 * Use when a story has imageGenerationComplete=false but images are already generated,
 * e.g. after a failed job or early completion.
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '../../.env') });
config({ path: path.resolve(process.cwd(), '../../.env.local') });

import { db } from '../db';
import { stories } from '../db/schema';
import { eq } from 'drizzle-orm';

const storyId = process.argv[2] || '';

async function run() {
  if (!storyId) {
    console.log('Usage: npx tsx src/scripts/setImageGenerationComplete.ts <storyId>');
    process.exit(1);
  }

  const [story] = await db.select().from(stories).where(eq(stories.id, storyId));
  if (!story) {
    console.log('Story not found:', storyId);
    process.exit(1);
  }

  const meta = (story.metadata as Record<string, unknown>) || {};
  const current = meta.imageGenerationComplete as boolean | undefined;
  if (current === true) {
    console.log('Story already has imageGenerationComplete=true');
    process.exit(0);
  }

  console.log('Story:', story.title);
  console.log('Current imageGenerationComplete:', current ?? '(undefined)');
  console.log('Updating to true...');

  await db
    .update(stories)
    .set({
      metadata: { ...meta, imageGenerationComplete: true },
      updatedAt: new Date(),
    })
    .where(eq(stories.id, storyId));

  console.log('Done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
