import assert from 'node:assert/strict';
import { buildDeletedChildProfileTombstone, calculateAgeGroup } from '../childProfileService';

assert.strictEqual(calculateAgeGroup(0), '0-1', 'newborn age group remains unchanged');
assert.strictEqual(calculateAgeGroup(72), '6-8', 'age group boundary remains unchanged');

const tombstone = buildDeletedChildProfileTombstone();

assert.deepStrictEqual(
  {
    name: tombstone.name,
    birthDate: tombstone.birthDate,
    languages: tombstone.languages,
    isActive: tombstone.isActive,
  },
  {
    name: 'Deleted child profile',
    birthDate: '1970-01-01',
    languages: [],
    isActive: false,
  },
  'deleted child profile tombstone keeps only neutral non-identifying required fields'
);

assert.strictEqual(tombstone.referencePhotos, null, 'reference photos are scrubbed');
assert.strictEqual(tombstone.turnaroundSheet, null, 'turnaround sheet metadata is scrubbed');
assert.strictEqual(tombstone.aiGeneratedDescription, null, 'AI generated description is scrubbed');
assert.strictEqual(tombstone.descriptionEn, null, 'translated description is scrubbed');
assert.strictEqual(tombstone.appearanceTraits, null, 'appearance traits are scrubbed');
assert.strictEqual(tombstone.personality, null, 'personality data is scrubbed');
assert.strictEqual(tombstone.familyCast, null, 'family cast is scrubbed');

console.log('childProfileService tests passed');
