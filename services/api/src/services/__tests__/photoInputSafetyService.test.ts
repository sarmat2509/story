import assert from 'node:assert/strict';
import {
  PhotoInputSafetyError,
  assertUserPhotoInputs,
  evaluateUserPhotoInputs,
  getReferencePhotoUrls,
} from '../photoInputSafetyService';

const userId = '11111111-1111-1111-1111-111111111111';
const otherUserId = '22222222-2222-2222-2222-222222222222';

const ownChildPhoto = `https://app.example.com/api/v1/assets/development/${userId}/photos/child/123.jpg?token=signed&expires=999`;
const ownCharacterPhoto = `/api/v1/assets/development/${userId}/photos/character/456.jpg`;

assert.deepStrictEqual(
  evaluateUserPhotoInputs({
    photos: [ownChildPhoto],
    userId,
    allowedPhotoTypes: ['child'],
  }),
  {
    allowed: true,
    paths: [`development/${userId}/photos/child/123.jpg`],
  },
  'own uploaded child photo URLs are allowed for child flows'
);

assert.deepStrictEqual(
  evaluateUserPhotoInputs({
    photos: [ownCharacterPhoto],
    userId,
    allowedPhotoTypes: ['character', 'child'],
  }),
  {
    allowed: true,
    paths: [`development/${userId}/photos/character/456.jpg`],
  },
  'relative own uploaded character photo URLs are allowed for instant flows'
);

assert.deepStrictEqual(
  evaluateUserPhotoInputs({
    photos: ['https://evil.example.com/photo.jpg'],
    userId,
    allowedPhotoTypes: ['character'],
  }),
  {
    allowed: false,
    statusCode: 400,
    code: 'PHOTO_URL_NOT_ALLOWED',
    message: 'Photo must be an uploaded WonderTales asset URL',
    index: 0,
  },
  'external URLs are blocked before analysis or queueing'
);

assert.deepStrictEqual(
  evaluateUserPhotoInputs({
    photos: [`/api/v1/assets/development/${otherUserId}/photos/child/123.jpg`],
    userId,
    allowedPhotoTypes: ['child'],
  }),
  {
    allowed: false,
    statusCode: 403,
    code: 'PHOTO_OWNER_MISMATCH',
    message: 'Photo does not belong to the authenticated user',
    index: 0,
  },
  'photos owned by another user are blocked'
);

assert.deepStrictEqual(
  evaluateUserPhotoInputs({
    photos: [`/api/v1/assets/development/${userId}/photos/feedback/screenshot.jpg`],
    userId,
    allowedPhotoTypes: ['character'],
  }),
  {
    allowed: false,
    statusCode: 400,
    code: 'PHOTO_TYPE_NOT_ALLOWED',
    message: 'Photo type is not allowed for this action',
    index: 0,
  },
  'feedback/profile uploads cannot be reused as character references'
);

assert.throws(
  () =>
    assertUserPhotoInputs({
      photos: [`/api/v1/assets/development/${otherUserId}/photos/child/123.jpg`],
      userId,
      allowedPhotoTypes: ['child'],
    }),
  (error) => {
    assert.ok(error instanceof PhotoInputSafetyError);
    assert.strictEqual(error.statusCode, 403);
    assert.strictEqual(error.code, 'PHOTO_OWNER_MISMATCH');
    assert.strictEqual(error.index, 0);
    return true;
  },
  'assertUserPhotoInputs throws typed safety errors'
);

assert.deepStrictEqual(
  getReferencePhotoUrls([
    { url: ownChildPhoto, uploadedAt: '2026-05-01T00:00:00.000Z' },
    { bad: true },
    null,
  ]),
  [ownChildPhoto],
  'reference photo URL extraction ignores malformed entries'
);

console.log('photoInputSafetyService tests passed');
