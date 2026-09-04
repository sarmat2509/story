import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stories = readFileSync(resolve(process.cwd(), 'src/components/AudioGenerationStarter.stories.tsx'), 'utf8');
for (const state of ['ReadyToGenerate', 'RetryingFailedAudio', 'Queued', 'Generating', 'PremiumVoiceLocked']) {
  assert.match(stories, new RegExp(`export const ${state}: Story`), `${state} must be previewable`);
}
assert.match(stories, /isGenerating: true, jobStatus: 'queued'/, 'queued audio must be previewable');
assert.match(stories, /audioFailed: true/, 'retry audio must be previewable');

console.log('audio generation starter Storybook state tests passed');
