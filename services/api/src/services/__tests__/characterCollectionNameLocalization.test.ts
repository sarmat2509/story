import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/services/characterService.ts'), 'utf8');

assert.match(
  source,
  /hasCompleteNameTranslations[\s\S]*LOCALE_IDS\.every/,
  'collection completeness must be checked against every supported story locale'
);
assert.match(
  source,
  /ensureNameTranslationsForCollection\([\s\S]*await attachNameTranslations\(visible\)/,
  'the collection API must complete missing character names before returning its cards'
);

console.log('character collection name-localization contract passed');
