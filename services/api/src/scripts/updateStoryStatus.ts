/**
 * One-off script to update story adb23086-f30a-4d9c-b9b7-c039ad870ad2
 * Sets: isPublished=false, visibility=null (private, only author can see)
 *
 * Usage: npx tsx src/scripts/updateStoryStatus.ts
 * Or via Docker: pnpm api:script npx tsx src/scripts/updateStoryStatus.ts
 */

import path from 'path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '../../.env') });
config({ path: path.resolve(process.cwd(), '../../.env.local') });

import { db } from '../db';
import { stories } from '../db/schema';
import { eq } from 'drizzle-orm';

const STORY_ID = 'adb23086-f30a-4d9c-b9b7-c039ad870ad2';

async function run() {
  const [story] = await db.select().from(stories).where(eq(stories.id, STORY_ID));
  if (!story) {
    console.log('Story not found:', STORY_ID);
    process.exit(1);
  }

  console.log('Story:', story.title);
  console.log('Before: isPublished=', story.isPublished, ', visibility=', story.visibility);

  await db
    .update(stories)
    .set({
      isPublished: false,
      visibility: null,
      publishedAt: null,
      publishedSlug: null,
      shareToken: null,
      authorDisplayName: null,
      updatedAt: new Date(),
    })
    .where(eq(stories.id, STORY_ID));

  console.log('Updated: isPublished=false, visibility=null (private)');
  console.log('Done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
