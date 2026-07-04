import assert from 'node:assert/strict';
import {
  imageMimeTypeFromPath,
  inferImageMimeTypeFromPath,
  normalizeImageMimeType,
  resolveImageMimeType,
} from '../imageMimeType';

function run() {
  assert.equal(normalizeImageMimeType('image/jpg'), 'image/jpeg');
  assert.equal(normalizeImageMimeType('image/jpeg; charset=binary'), 'image/jpeg');
  assert.equal(normalizeImageMimeType('application/octet-stream'), null);

  assert.equal(inferImageMimeTypeFromPath('outfit_plate_cache/example.jpg'), 'image/jpeg');
  assert.equal(inferImageMimeTypeFromPath('env_cache/example.webp?x=1'), 'image/webp');
  assert.equal(imageMimeTypeFromPath('env_cache/example.unknown'), 'image/png');

  assert.equal(
    resolveImageMimeType({
      mimeType: 'image/png',
      storagePath: 'outfit_plate_cache/example.jpg',
    }),
    'image/jpeg'
  );
  assert.equal(resolveImageMimeType({ mimeType: 'image/webp' }), 'image/webp');
}

run();
// eslint-disable-next-line no-console
console.log('imageMimeType tests passed');
