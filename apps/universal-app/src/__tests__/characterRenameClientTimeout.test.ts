import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const charactersApiSource = readFileSync(
  resolve(process.cwd(), 'src/api/characters.ts'),
  'utf8'
);

assert.match(
  charactersApiSource,
  /`\/api\/v1\/characters\/\$\{id\}\/name`,\s*\{ name \},\s*\{ timeout: 120000 \}/s,
  'character rename must allow enough time for all localized names to be persisted'
);

console.log('character rename client timeout contract passed');
