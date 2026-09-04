import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/routes/children.ts'), 'utf8');

assert.doesNotMatch(source, /assertStoryFromDrawingAccessForPhotos/);
assert.doesNotMatch(source, /STORY_FROM_DRAWING_REQUIRED/);
assert.match(source, /allowedPhotoTypes:\s*\['child'\]/);
assert.match(source, /assertUploadedPhotosContainHumans/);

console.log('child profile photo access contract tests passed');
