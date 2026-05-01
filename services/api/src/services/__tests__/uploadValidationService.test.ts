import assert from 'node:assert/strict';
import { isAllowedUserPhotoMimeType } from '../uploadValidationService';

assert.strictEqual(isAllowedUserPhotoMimeType('image/jpeg'), true);
assert.strictEqual(isAllowedUserPhotoMimeType('image/png'), true);
assert.strictEqual(isAllowedUserPhotoMimeType('image/webp'), true);
assert.strictEqual(isAllowedUserPhotoMimeType('image/heic'), true);
assert.strictEqual(isAllowedUserPhotoMimeType('image/heif'), true);
assert.strictEqual(isAllowedUserPhotoMimeType('IMAGE/JPEG'), true);

assert.strictEqual(isAllowedUserPhotoMimeType('image/svg+xml'), false);
assert.strictEqual(isAllowedUserPhotoMimeType('image/gif'), false);
assert.strictEqual(isAllowedUserPhotoMimeType('text/plain'), false);
assert.strictEqual(isAllowedUserPhotoMimeType('application/octet-stream'), false);

console.log('uploadValidationService tests passed');
