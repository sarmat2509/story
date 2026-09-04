import assert from 'node:assert/strict';
import {
  MOCK_CHARACTER_ANALYSIS,
  MOCK_FACE_DEDUPLICATION,
  MockTextProvider,
} from '../../testing/ai';
import { clearAiServiceTestOverrides, installAiServiceTestOverrides } from '../aiService';
import { CharacterAnalysisService } from '../characterAnalysisService';
import { getFaceDeduplicationService } from '../faceDeduplicationService';
import { getGeminiEmptyResponseDiagnostics } from '../../providers/text/gemini/GeminiTextProvider';

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

async function testCharacterAnalysisRetriesEmptyGeminiResponse(): Promise<void> {
  const provider = new MockTextProvider()
    .queueError(
      'structured',
      'character_analysis',
      'Gemini structured generation failed: Empty response from Gemini'
    )
    .queueStructured('character_analysis', MOCK_CHARACTER_ANALYSIS);
  const service = new CharacterAnalysisService(provider);

  const result = await service.analyzeCharacter({
    photos: [PHOTO_DATA_URL],
    characterType: 'person',
    language: 'en',
  });

  assert.deepEqual(result, MOCK_CHARACTER_ANALYSIS);
  assert.equal(provider.structuredRequests.length, 2);
  provider.assertExhausted();
}

async function testChildAppearanceDescriptionExtractionRetriesEmptyProviderResponse(): Promise<void> {
  const provider = new MockTextProvider()
    .queueError(
      'structured',
      'child_appearance_description_extraction',
      'OpenAI returned empty response'
    )
    .queueStructured('child_appearance_description_extraction', {
      appearanceTraits: { hairColor: 'brown', eyeColor: null },
      distinctiveFeatures: ['freckles'],
    });
  const service = new CharacterAnalysisService(provider);

  const result = await service.extractChildAppearanceFromDescription({
    description: 'Brown hair and freckles.',
    language: 'en',
  });

  assert.deepEqual(result, {
    appearanceTraits: { hairColor: 'brown', eyeColor: null },
    distinctiveFeatures: ['freckles'],
  });
  assert.equal(provider.structuredRequests.length, 2);
  provider.assertExhausted();
}

function testEmptyGeminiResponseDiagnosticsExcludeContent(): void {
  const diagnostics = getGeminiEmptyResponseDiagnostics({
    promptFeedback: {
      blockReason: 'SAFETY',
      safetyRatings: [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'LOW' }],
    },
    candidates: [
      {
        finishReason: 'SAFETY',
        safetyRatings: [{ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'NEGLIGIBLE' }],
      },
    ],
  });

  assert.deepEqual(diagnostics, {
    promptBlockReason: 'SAFETY',
    promptSafetyRatings: [{ category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'LOW' }],
    candidateCount: 1,
    candidateFinishReasons: ['SAFETY'],
    candidateSafetyRatings: [
      [{ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', probability: 'NEGLIGIBLE' }],
    ],
  });
  assert.equal(JSON.stringify(diagnostics).includes('photo'), false);
}

async function testFaceDeduplicationUsesFactoryMock(): Promise<void> {
  const provider = new MockTextProvider().queueStructured('face_dedup', MOCK_FACE_DEDUPLICATION);
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

async function testFaceDeduplicationFailsClosedAfterEmptyResponses(): Promise<void> {
  const provider = new MockTextProvider()
    .queueError(
      'structured',
      'face_dedup',
      'Gemini structured generation failed: Empty response from Gemini'
    )
    .queueError(
      'structured',
      'face_dedup',
      'Gemini structured generation failed: Empty response from Gemini'
    );
  const service = new (await import('../faceDeduplicationService')).FaceDeduplicationService(provider);

  await assert.rejects(
    () => service.groupPhotosByIdentity([PHOTO_DATA_URL]),
    /Photo deduplication failed/i
  );
  assert.equal(provider.structuredRequests.length, 2);
  provider.assertExhausted();
}

void (async () => {
  await testCharacterAnalysisUsesFixedProviderResponse();
  await testCharacterAnalysisRetriesEmptyGeminiResponse();
  await testChildAppearanceDescriptionExtractionRetriesEmptyProviderResponse();
  testEmptyGeminiResponseDiagnosticsExcludeContent();
  await testFaceDeduplicationUsesFactoryMock();
  await testFaceDeduplicationFailsClosedAfterEmptyResponses();
  console.log('photo AI contract tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
