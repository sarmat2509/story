import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const playerSource = readFileSync(resolve(process.cwd(), 'src/components/AudioPlayer.tsx'), 'utf8');
const pauseIconSource = readFileSync(
  resolve(process.cwd(), 'src/components/icons/PauseIcon.tsx'),
  'utf8'
);

assert.match(
  playerSource,
  /import \{ PauseIcon \} from '@\/components\/icons\/PauseIcon';/,
  'the audio player must use the custom flat pause icon'
);
assert.match(
  playerSource,
  /isPlaying \? \(\s*<PauseIcon size=\{28\} color="#FFFFFF" \/>/,
  'the playing state must render the flat pause icon'
);
assert.doesNotMatch(playerSource, /⏸️/, 'the audio player must not render the platform emoji pause icon');
assert.match(pauseIconSource, /<Rect/, 'the pause icon must be drawn as flat SVG bars');

console.log('audio player control icon tests passed');
