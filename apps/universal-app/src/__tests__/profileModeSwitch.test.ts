import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const profileScreenSource = readFileSync(
  resolve(process.cwd(), 'src/screens/profile/ProfileScreen.tsx'),
  'utf8'
);
const authApiSource = readFileSync(resolve(process.cwd(), 'src/api/auth.ts'), 'utf8');

assert.match(
  profileScreenSource,
  /testID={`profile-story-mode-\$\{mode\}`}/,
  'parent profile should expose Instant and Artisan story mode controls'
);
assert.match(
  profileScreenSource,
  /updateStoryMode\.mutateAsync\(\{\s*mode\s*\}\)/,
  'parent story mode control should persist the selected mode through useUpdateMe'
);
assert.match(
  profileScreenSource,
  /accessibilityRole="radio"/,
  'story mode choices should expose radio semantics'
);
assert.match(
  profileScreenSource,
  /accessibilityState=\{\{\s*checked:\s*selected/,
  'story mode choices should expose their checked state'
);
assert.match(
  profileScreenSource,
  /aria-checked=\{selected\}/,
  'web radio controls should expose aria-checked directly'
);
assert.match(
  authApiSource,
  /mode\?:\s*'instant'\s*\|\s*'artisan'/,
  'profile update API should restrict mode changes to supported values'
);
assert.match(
  profileScreenSource,
  /profileAside:\s*\{[\s\S]*?flexGrow:\s*1,[\s\S]*?flexBasis:\s*280,[\s\S]*?minWidth:\s*240,[\s\S]*?maxWidth:\s*340,/,
  'profile aside should shrink on tablet widths instead of keeping a fixed desktop width'
);
assert.match(
  profileScreenSource,
  /settingsGrid:\s*\{[\s\S]*?flexGrow:\s*2,[\s\S]*?flexBasis:\s*520,/,
  'profile settings should receive more available width than the profile aside'
);
assert.match(
  profileScreenSource,
  /storyModeOptions:\s*\{[\s\S]*?flexWrap:\s*'wrap',/,
  'story mode choices should wrap when their container becomes too narrow'
);
assert.match(
  profileScreenSource,
  /storyModeOption:\s*\{[\s\S]*?flexGrow:\s*1,[\s\S]*?flexBasis:\s*280,[\s\S]*?minWidth:\s*240,/,
  'story mode choices should grow evenly while preserving a comfortable wrapping width'
);

console.log('profile mode switch source guards passed');
