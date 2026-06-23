import assert from 'node:assert/strict';
import { ImageDomainService } from '../ImageDomainService';
import type { EditImageRequest, GeneratedImage, IImageProvider } from '../../../providers/base/IImageProvider';
import type { ImageValidationResult } from '../../../ai/types';

let capturedEditRequest: EditImageRequest | null = null;

const imageProvider: IImageProvider = {
  async generateImage(): Promise<GeneratedImage> {
    throw new Error('generateImage should not be called by this test');
  },
  async editImage(request: EditImageRequest): Promise<GeneratedImage> {
    capturedEditRequest = request;
    return {
      imageData: Buffer.from('edited-image'),
      mimeType: 'image/png',
      width: 1344,
      height: 768,
      format: 'png',
      providerInteractionId: 'interaction-edit-456',
    };
  },
};

const validationResult: ImageValidationResult = {
  characterCount: 1,
  expectedCharacterCount: 1,
  characters: [
    {
      name: 'Hero',
      characterKind: 'human',
      found: true,
      duplicated: false,
      recognizableScore: 0.72,
      matchesColors: true,
      matchesOutfit: true,
      faceMatchesReference: false,
      hairMatchesReference: true,
      ageReadMatchesReference: true,
      proportionsMatchReference: true,
      issue: 'Face differs from the reference.',
    },
  ],
  hasUnexpectedCharacters: false,
  hasTextOrLetters: false,
  hasRenderingArtifacts: false,
  overallFeedback: 'Repair the face identity.',
};

async function testPreviousInteractionIdIsForwarded() {
  const service = new ImageDomainService(imageProvider);
  const result = await service.editSceneImage({
    originalImage: Buffer.from('original-image'),
    originalMimeType: 'image/png',
    validationResult,
    previousInteractionId: 'interaction-generate-123',
    referenceImages: [
      {
        base64Data: Buffer.from('reference').toString('base64'),
        mimeType: 'image/png',
        instructionText: 'PERSON SOURCE image.',
        referenceKind: 'character',
      },
    ],
  });

  assert.equal(capturedEditRequest?.previousInteractionId, 'interaction-generate-123');
  assert.equal(result.providerInteractionId, 'interaction-edit-456');
}

async function main() {
  await testPreviousInteractionIdIsForwarded();
  console.log('ImageDomainServiceEditInteraction tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
