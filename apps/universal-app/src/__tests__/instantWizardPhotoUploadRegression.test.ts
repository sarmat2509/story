import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/screens/wizard/InstantWizardScreen.tsx'),
  'utf8'
);

// PhotoUploadGrid replaces its optimistic item by uploadId. The Instant Wizard
// adapter must preserve that key while forwarding state in both directions.
const adapterStart = source.indexOf('<PhotoUploadGrid');
const adapterEnd = source.indexOf('/>', adapterStart);
const adapterSource = source.slice(adapterStart, adapterEnd);

assert.ok(adapterStart >= 0 && adapterEnd > adapterStart, 'instant wizard must render PhotoUploadGrid');
assert.match(adapterSource, /photos\.map\([\s\S]*?uploadId:\s*p\.uploadId/);
assert.match(adapterSource, /currentGridPhotos[\s\S]*?uploadId:\s*p\.uploadId/);
assert.match(adapterSource, /return resolvedPhotos\.map\([\s\S]*?uploadId:\s*p\.uploadId/);

// Parent-mode Instant Wizard should choose a useful initial age from the
// selected child, or the first existing child when opened without childId.
assert.match(source, /useChildren\(!isChildSession\)/);
assert.match(source, /selectedChild \?\? childrenData\?\.children\[0\]/);
assert.match(source, /useState<AgeGroup>\('4-5'\)/);
assert.match(source, /ageProfileIdRef\.current === ageProfileId/);

console.log('instant wizard photo upload regression tests passed');
