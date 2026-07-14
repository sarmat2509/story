import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/StoryCharactersSection.tsx'),
  'utf8'
);

assert.match(
  source,
  /Platform\.OS\s*!==\s*'web'\)\s*return true/,
  'native touch devices should always enable character previews on press'
);
assert.match(
  source,
  /navigator\.maxTouchPoints\s*>\s*0/,
  'touch-capable web devices should be detected through maxTouchPoints'
);
assert.match(
  source,
  /matchMedia\('\(pointer: coarse\)'\)/,
  'coarse-pointer web devices should enable tap previews'
);
assert.match(
  source,
  /const previewedCharacterId = hoveredCharacterId \?\? tappedCharacterId/,
  'hover and tap should drive the same character preview'
);
assert.match(
  source,
  /setTappedCharacterId\(\(current\) => \(current === characterId \? null : characterId\)\)/,
  'repeated taps should toggle the selected preview'
);
assert.match(
  source,
  /onPress=\{isTouchDevice \? \(\) => toggleCharacterPreview\(char\.id\) : undefined\}/,
  'the full character row should open the preview only on touch devices'
);
assert.match(
  source,
  /testID=\{`story-character-preview-\$\{char\.id\}`\}/,
  'the shared hover and tap preview should be rendered on every platform'
);

console.log('story character preview interaction regression guards passed');
