import assert from 'node:assert/strict';
import { groupTextValidationAttempts } from '../textValidationAttempts';

const batchManifest = {
  context: { sceneIds: [1, 2, 3] },
  operation: 'writer_text_validation',
};

const attempts = [
  {
    sceneId: 1,
    attempt: 1,
    phase: 'initial',
    durationMs: 4_650,
    isValid: true,
    score: 100,
    result: { sceneId: 1, isValid: true, violations: [] },
    rawResult: { isValid: true },
    rawManifest: batchManifest,
  },
  {
    sceneId: 2,
    attempt: 1,
    phase: 'initial',
    durationMs: 4_650,
    isValid: false,
    score: 70,
    result: { sceneId: 2, isValid: false, violations: [] },
    rawResult: { isValid: false },
    rawManifest: batchManifest,
  },
  {
    sceneId: 3,
    attempt: 1,
    phase: 'initial',
    durationMs: 600,
    isValid: true,
    score: 100,
    result: { sceneId: 3, isValid: true, violations: [] },
    rawResult: { isValid: true },
    rawManifest: { operation: 'writer_text_validation' },
  },
];

const groups = groupTextValidationAttempts(attempts);

assert.equal(groups.length, 2, 'one full-story validation must render as one group');
assert.deepEqual(groups[0].sceneIds, [1, 2, 3]);
assert.deepEqual(groups[0].failedSceneIds, [2]);
assert.equal(groups[0].durationMs, 4_650);
assert.equal(groups[0].score, 85);
assert.equal(groups[1].isBatch, false, 'per-scene fallback must remain visible as its own run');

console.log('text validation attempt grouping passed');
