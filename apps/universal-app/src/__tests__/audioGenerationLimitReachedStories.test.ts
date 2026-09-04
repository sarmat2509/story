import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const storySource = readFileSync(
  resolve(process.cwd(), 'src/components/AudioGenerationLimitReached.stories.tsx'),
  'utf8'
);
const viewerSource = readFileSync(
  resolve(process.cwd(), 'src/screens/story/StoryViewerScreen.tsx'),
  'utf8'
);

assert.match(storySource, /export const FreePlanLimitReached: Story/, 'parent limit state must be previewable');
assert.match(storySource, /export const ChildModeLimitReached: Story/, 'child limit state must be previewable');
assert.match(storySource, /showUpgrade: false/, 'Child Mode preview must hide billing controls');
assert.match(viewerSource, /<AudioGenerationLimitReached/, 'the viewer must render the previewed component');
assert.match(viewerSource, /showUpgrade=\{!isChildSession\}/, 'Child Mode must not expose billing controls');

console.log('audio generation limit Storybook state tests passed');
