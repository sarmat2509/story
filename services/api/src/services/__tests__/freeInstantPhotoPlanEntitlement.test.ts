import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(
  resolve(process.cwd(), 'drizzle/0145_enable_photo_stories_for_free.sql'),
  'utf8'
);

assert.match(migration, /WHERE p\.slug = 'free'/);
assert.match(migration, /f\.slug = 'story_from_drawing'/);
assert.match(migration, /\{"enabled": true\}/);
assert.match(migration, /ON CONFLICT \(plan_id, feature_id\) DO UPDATE/);

console.log('free Instant photo-story entitlement contract tests passed');
