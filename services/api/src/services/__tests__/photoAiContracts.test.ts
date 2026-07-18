import assert from 'node:assert/strict';
import {
  MOCK_CHARACTER_ANALYSIS,
  MOCK_FACE_DEDUPLICATION,
  MockTextProvider,
} from '../../testing/ai';
import {
  clearAiServiceTestOverrides,
  installAiServiceTestOverrides,
} from '../aiService';
import { CharacterAnalysisService } from '../characterAnalysisService';
import { getFaceDeduplicationService } from '../faceDeduplicationService';

const PHOTO_DATA_URL = `data:image/jpeg;base64,${Buffer.from('fixed-photo-bytes').toString('base64')}`;

async function testCharacterAnalysisUsesFixedProviderResponse(): Promise<void> {
  const provider = new MockTextProvider().queueStructured(
    'character_analysis',
    MOCK_CHARACTER_ANALYSIS
  );
  const service = new CharacterAnalysisService(provider);

  const result = await service.analyzeCharacter({
    photos: [PHOTO_DATA_URL],
    characterType: 'person',
    language: 'en',
  });

  assert.deepEqual(result, MOCK_CHARACTER_ANALYSIS);
  assert.equal(provider.structuredRequests.length, 1);
  assert.equal(provider.structuredRequests[0].operation, 'character_analysis');
  assert.equal(provider.structuredRequests[0].imageData?.length, 1);
  provider.assertExhausted();
}

async function testFaceDeduplicationUsesFactoryMock(): Promise<void> {
  const provider = new MockTextProvider().queueStructured(
    'face_dedup',
    MOCK_FACE_DEDUPLICATION
  );
  installAiServiceTestOverrides({ textProvider: provider });

  try {
    const result = await getFaceDeduplicationService().groupPhotosByIdentity([PHOTO_DATA_URL]);

    assert.deepEqual(result, [
      {
        groupId: '1',
        name: 'Child with a red scarf',
        characterType: 'person',
        photoUrls: [PHOTO_DATA_URL],
      },
    ]);
    assert.equal(provider.structuredRequests.length, 1);
    assert.equal(provider.structuredRequests[0].operation, 'face_dedup');
    assert.equal(provider.structuredRequests[0].imageData?.length, 1);
    provider.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
  }
}

void (async () => {
  await testCharacterAnalysisUsesFixedProviderResponse();
  await testFaceDeduplicationUsesFactoryMock();
  console.log('photo AI contract tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
