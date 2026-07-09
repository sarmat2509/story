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

async function testEditImageDoesNotForwardPreviousInteractionId() {
  const service = new ImageDomainService(imageProvider);
  const result = await service.editSceneImage({
    originalImage: Buffer.from('original-image'),
    originalMimeType: 'image/png',
    validationResult,
    referenceImages: [
      {
        base64Data: Buffer.from('reference').toString('base64'),
        mimeType: 'image/png',
        instructionText: 'REF_CH_HERO_TEST01: identity',
        referenceKind: 'character',
      },
    ],
  });

  assert.equal((capturedEditRequest as any)?.previousInteractionId, undefined);
  assert.equal(result.providerInteractionId, undefined);
}

async function main() {
  await testEditImageDoesNotForwardPreviousInteractionId();
  console.log('ImageDomainServiceEditInteraction tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
