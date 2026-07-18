import assert from 'node:assert/strict';
import { MOCK_CHILD_PHOTO_VALIDATION, MockTextProvider } from '../../testing/ai';
import {
  CHILD_PHOTO_REQUIRES_HUMAN_CODE,
  ChildPhotoValidationError,
  ChildPhotoValidationService,
} from '../childPhotoValidationService';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64'
);

async function testAcceptsClearHumanSubject() {
  const provider = new MockTextProvider().queueStructured(
    'image_validation_child_photo',
    MOCK_CHILD_PHOTO_VALIDATION
  );
  const service = new ChildPhotoValidationService(provider, 'vision-test');

  const result = await service.assertBufferContainsHuman({
    imageData: TINY_JPEG,
    mimeType: 'image/jpeg',
    userId: 'user-1',
    source: 'test',
  });

  assert.equal(result.hasHumanSubject, true);
  assert.equal(provider.structuredRequests.length, 1);
  assert.equal(provider.structuredRequests[0].model, 'vision-test');
  assert.equal(provider.structuredRequests[0].operation, 'image_validation_child_photo');
  assert.equal(provider.structuredRequests[0].imageData?.[0]?.mimeType, 'image/jpeg');
  provider.assertExhausted();
}

async function testRejectsAnimalOnlyPhoto() {
  const provider = new MockTextProvider().queueStructured('image_validation_child_photo', {
    hasHumanSubject: false,
    humanSubjectCount: 0,
    primarySubject: 'animal',
    confidence: 0.98,
    reason: 'The image shows a dog and no clear human subject.',
  });
  const service = new ChildPhotoValidationService(provider, 'vision-test');

  await assert.rejects(
    () =>
      service.assertBufferContainsHuman({
        imageData: TINY_JPEG,
        mimeType: 'image/jpeg',
        index: 2,
        userId: 'user-1',
        source: 'test',
      }),
    (error) => {
      assert.ok(error instanceof ChildPhotoValidationError);
      assert.equal(error.code, CHILD_PHOTO_REQUIRES_HUMAN_CODE);
      assert.equal(error.statusCode, 400);
      assert.equal(error.index, 2);
      assert.equal(error.validation?.primarySubject, 'animal');
      return true;
    }
  );
  provider.assertExhausted();
}

async function run() {
  await testAcceptsClearHumanSubject();
  await testRejectsAnimalOnlyPhoto();
  console.log('childPhotoValidationService tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
