import assert from 'node:assert/strict';
import {
  adjustStoryComplexityAgeGroup,
  getStoryComplexityAdjustment,
  normalizeStoryComplexityAdjustments,
} from '@wondertales/shared';

assert.deepEqual(normalizeStoryComplexityAdjustments({ en: -2, es: 1, xx: 2 }), {
  en: -2,
  es: 1,
});
assert.equal(getStoryComplexityAdjustment({ en: -2 }, 'en-US'), -2);
assert.equal(getStoryComplexityAdjustment({ en: -2 }, 'es'), 0);

assert.equal(adjustStoryComplexityAgeGroup('6-8', -2), '2-3');
assert.equal(adjustStoryComplexityAgeGroup('4-5', 2), '9-12');
assert.equal(adjustStoryComplexityAgeGroup('0-1', -2), '0-1');
assert.equal(adjustStoryComplexityAgeGroup('9-12', 2), '9-12');
assert.equal(adjustStoryComplexityAgeGroup('unknown', 2), 'unknown');

console.log('storyComplexity tests passed');
