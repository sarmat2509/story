/**
 * Unit tests for LLM character turnaround reuse helpers.
 * Run: pnpm exec tsx src/services/__tests__/llmCharacterPersistence.test.ts
 */

import assert from 'node:assert/strict';
import { parseTurnaroundSheetForReuse } from '../storyOrchestration/llmCharacterPersistence';

function run() {
  assert.equal(parseTurnaroundSheetForReuse(null), null);
  assert.equal(parseTurnaroundSheetForReuse(undefined), null);
  assert.equal(parseTurnaroundSheetForReuse({}), null);
  assert.equal(parseTurnaroundSheetForReuse({ url: 1 }), null);

  const full = parseTurnaroundSheetForReuse({
    url: '/path/to/sheet.png',
    frontUrl: '/path/front.png',
    generatedAt: '2026-01-01T00:00:00.000Z',
    sourcePhotoUrl: 'cache',
  });
  assert.ok(full);
  assert.equal(full!.url, '/path/to/sheet.png');
  assert.equal(full!.frontUrl, '/path/front.png');
  assert.equal(full!.generatedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(full!.sourcePhotoUrl, 'cache');

  const minimal = parseTurnaroundSheetForReuse({ url: 'https://example.com/t.png' });
  assert.ok(minimal);
  assert.equal(minimal!.url, 'https://example.com/t.png');
  assert.equal(minimal!.sourcePhotoUrl, 'reused_similar_character');
  assert.ok(typeof minimal!.generatedAt === 'string');
}

run();
// eslint-disable-next-line no-console
console.log('llmCharacterPersistence tests passed');
