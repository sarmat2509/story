import assert from 'node:assert/strict';
import type { ITextProvider } from '../../providers/base/ITextProvider';
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
} from '../../providers/base/JsonSchema';
import {
  CHILD_PHOTO_REQUIRES_HUMAN_CODE,
  ChildPhotoValidationError,
  ChildPhotoValidationService,
} from '../childPhotoValidationService';

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EFBQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EFBABAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
  'base64'
);

class MockTextProvider implements ITextProvider {
  calls: Array<GenerateStructuredRequest<unknown>> = [];

  constructor(private readonly responses: unknown[]) {}

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.calls.push(request as GenerateStructuredRequest<unknown>);
    const next = this.responses.shift();
    return next as T;
  }

  async generateText(_request: GenerateTextRequest): Promise<string> {
    throw new Error('generateText not used');
  }
}

async function testAcceptsClearHumanSubject() {
  const provider = new MockTextProvider([
    {
      hasHumanSubject: true,
      humanSubjectCount: 1,
      primarySubject: 'human',
      confidence: 0.94,
      reason: 'A clear person is the main subject.',
    },
  ]);
  const service = new ChildPhotoValidationService(provider, 'vision-test');

  const result = await service.assertBufferContainsHuman({
    imageData: TINY_JPEG,
    mimeType: 'image/jpeg',
    userId: 'user-1',
    source: 'test',
  });

  assert.equal(result.hasHumanSubject, true);
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].model, 'vision-test');
  assert.equal(provider.calls[0].operation, 'image_validation_child_photo');
  assert.equal(provider.calls[0].imageData?.[0]?.mimeType, 'image/jpeg');
}

async function testRejectsAnimalOnlyPhoto() {
  const provider = new MockTextProvider([
    {
      hasHumanSubject: false,
      humanSubjectCount: 0,
      primarySubject: 'animal',
      confidence: 0.98,
      reason: 'The image shows a dog and no clear human subject.',
    },
  ]);
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
