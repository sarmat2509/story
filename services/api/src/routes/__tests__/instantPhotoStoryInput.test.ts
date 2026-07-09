import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const storiesRouteSource = readFileSync(resolve(__dirname, '../stories.ts'), 'utf8');

const schemaStart = storiesRouteSource.indexOf('const GenerateFromPhotosSchema');
const schemaEnd = storiesRouteSource.indexOf('const RegenerateSceneSchema');

assert.ok(schemaStart >= 0, 'stories route should define GenerateFromPhotosSchema');
assert.ok(schemaEnd > schemaStart, 'GenerateFromPhotosSchema block should be discoverable');

const generateFromPhotosSchema = storiesRouteSource.slice(schemaStart, schemaEnd);

assert.match(
  generateFromPhotosSchema,
  /photos:\s*z\.array\(z\.string\(\)\.trim\(\)\.min\(1\)\)\.min\(1\)\.max\(5\)/,
  'instant photo story schema should accept uploaded WonderTales asset paths'
);
assert.doesNotMatch(
  generateFromPhotosSchema,
  /\.url\(\)/,
  'instant photo story schema must not require absolute URLs before asset ownership validation'
);

assert.match(
  storiesRouteSource,
  /assertUserPhotoInputs\(\{\s*photos:\s*validatedData\.photos,\s*userId:\s*ownerUserId,\s*allowedPhotoTypes:\s*\['character',\s*'child'\]/s,
  'instant photo story route should validate photo ownership and allowed types after parsing'
);

console.log('instant photo story input tests passed');
