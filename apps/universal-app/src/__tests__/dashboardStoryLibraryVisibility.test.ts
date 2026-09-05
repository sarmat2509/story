import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/screens/dashboard/DashboardScreen.tsx'),
  'utf8'
);

assert.match(
  dashboardSource,
  /!featuredStory && storiesCount > 0 \? \([\s\S]*dashboard\.actions\.view_library/,
  'the empty-state library action must be hidden when the account has no stories'
);

console.log('dashboard story-library visibility contract passed');
