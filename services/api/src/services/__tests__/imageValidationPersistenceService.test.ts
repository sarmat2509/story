import assert from 'node:assert/strict';
import { normalizeValidationScoreForStorage } from '../imageValidationPersistenceService';

assert.strictEqual(normalizeValidationScoreForStorage(null), null);
assert.strictEqual(normalizeValidationScoreForStorage(Number.NaN), null);
assert.strictEqual(normalizeValidationScoreForStorage(98.2), 98);
assert.strictEqual(normalizeValidationScoreForStorage(98.6), 99);
assert.strictEqual(normalizeValidationScoreForStorage(-4), 0);
assert.strictEqual(normalizeValidationScoreForStorage(104), 100);

console.log('imageValidationPersistenceService tests passed');
