import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/components/AudioPlayer.stories.tsx'), 'utf8');

for (const storyName of ['Paused', 'Playing', 'Loading', 'ReadAlongEnabled', 'Finished']) {
  assert.match(source, new RegExp(`export const ${storyName}: Story`), `${storyName} must be previewable`);
}
assert.match(source, /useAudioPlayerStore\.setState\(state\)/, 'stories must render store-backed state');
assert.match(source, /isPlaying: true/, 'playing state must be represented');
assert.match(source, /isLoading: true, isLoaded: false/, 'loading state must disable the player');

console.log('audio player Storybook states tests passed');
