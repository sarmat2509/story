import assert from 'node:assert/strict';
import { CreateChildProfileSchema } from '@wondertales/shared';

const base = {
  name: 'Emily',
  birthDate: new Date('2017-07-16'),
  languages: ['en'],
};

assert.equal(CreateChildProfileSchema.safeParse(base).success, false);
assert.equal(
  CreateChildProfileSchema.safeParse({
    ...base,
    aiGeneratedDescription: 'Brown hair and green eyes',
  }).success,
  true
);
assert.equal(
  CreateChildProfileSchema.safeParse({
    ...base,
    referencePhotos: [{ url: 'https://example.com/emily.jpg' }],
  }).success,
  true
);

console.log('child profile appearance requirement tests passed');
