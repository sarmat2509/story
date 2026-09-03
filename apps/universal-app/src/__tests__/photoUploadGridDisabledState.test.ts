import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/form/PhotoUploadGrid.tsx'),
  'utf8'
);

assert.match(source, /const hasAvailableSlot = photos\.length < maxPhotos/);
assert.match(source, /\{hasAvailableSlot && \(/);
assert.match(source, /disabled=\{disabled\}/);
assert.match(source, /accessibilityState=\{\{ disabled \}\}/);
assert.doesNotMatch(source, /photos\.length < maxPhotos && !disabled/);

console.log('photo upload grid disabled-state tests passed');
