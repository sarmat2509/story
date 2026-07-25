import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/screens/dashboard/DashboardScreen.tsx'),
  'utf8'
);

assert.match(
  dashboardSource,
  /useStories\(\{ limit: 1, hasAudio: true \}\)/,
  'the dashboard should request the lightweight filtered total for audio stories'
);
assert.match(
  dashboardSource,
  /audioStoriesCount > 0 \? \([\s\S]*dashboard\.stats\.audio_stories[\s\S]*\) : null/,
  'the audio-story metric should only render when at least one audio story exists'
);

console.log('dashboard audio-story metric contract passed');
