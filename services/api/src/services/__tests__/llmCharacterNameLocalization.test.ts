import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/services/storyOrchestration/llmCharacterPersistence.ts'),
  'utf8'
);

assert.match(
  source,
  /if \(nameMatch\) \{\s+await ensureLocalizedCharacterNames\(nameMatch, \{ sourceLocale \}\)/,
  'reused LLM characters must fill any missing name translations before returning'
);
assert.match(
  source,
  /const created = await characterRepo\.create\([\s\S]*?await ensureLocalizedCharacterNames\(created, \{ sourceLocale \}\)/,
  'new LLM characters must persist all name translations before story generation continues'
);

console.log('LLM character name-localization contract passed');
