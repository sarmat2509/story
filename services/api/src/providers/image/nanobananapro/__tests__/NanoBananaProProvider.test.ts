import assert from 'node:assert/strict';
import { NanoBananaProProvider } from '../NanoBananaProProvider';

function createProvider(params?: { failInteractions?: boolean }) {
  const provider = new NanoBananaProProvider('test-api-key', 'gemini-3.1-flash-image');
  const requests: {
    countTokens: any[];
    interaction: any | null;
    generateContent: any | null;
  } = {
    countTokens: [],
    interaction: null,
    generateContent: null,
  };

  (provider as any).client = {
    models: {
      countTokens: async (request: any) => {
        requests.countTokens.push(request);
        return { totalTokens: 12 };
      },
      generateContent: async (request: any) => {
        requests.generateContent = request;
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      data: Buffer.from('fallback-edited-image').toString('base64'),
                      mimeType: 'image/png',
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 7, totalTokenCount: 9 },
        };
      },
    },
    interactions: {
      create: async (request: any) => {
        requests.interaction = request;
        if (params?.failInteractions) {
          throw new Error('Interactions unavailable');
        }
        return {
          id: 'interaction-edit-456',
          status: 'completed',
          model: 'gemini-3.1-flash-image',
          outputs: [
            {
              type: 'image',
              data: Buffer.from('interaction-edited-image').toString('base64'),
              mime_type: 'image/png',
            },
          ],
          usage: { total_input_tokens: 3, total_tokens: 5 },
        };
      },
    },
  };

  return { provider, requests };
}

async function testConversationalEditUsesPreviousInteractionWithoutResendingImages() {
  const { provider, requests } = createProvider();

  const result = await provider.editImage({
    originalImage: Buffer.from('failed-page-image'),
    originalMimeType: 'image/png',
    editInstructions: 'Repair only Emilia identity and preserve the rest of the comic page.',
    previousInteractionId: 'interaction-generate-123',
    aspectRatio: '3:4',
    referenceImages: [
      {
        base64Data: Buffer.from('emilia-reference').toString('base64'),
        mimeType: 'image/png',
        characterName: 'Емілія',
        instructionText: 'Image 1: Character reference for "Емілія".',
      },
    ],
    operation: 'graphic_novel_page_validation_repair_edit',
  });

  assert.equal(result.providerInteractionId, 'interaction-edit-456');
  assert.equal(requests.interaction?.previous_interaction_id, 'interaction-generate-123');
  assert.equal(requests.generateContent, null);
  assert.deepEqual(
    requests.interaction?.input.map((part: any) => part.type),
    ['text', 'image', 'text']
  );
  assert.match(requests.interaction?.input[0].text, /Character reference/);
  assert.equal(requests.interaction?.input[1].data, Buffer.from('emilia-reference').toString('base64'));
  assert.match(requests.interaction?.input[2].text, /Repair only Emilia identity/);
  assert.ok(
    !requests.interaction?.input.some(
      (part: any) => part.type === 'image' && part.data === Buffer.from('failed-page-image').toString('base64')
    ),
    'conversational edit should not resend the failed source image'
  );
}

async function testGenerateContentFallbackStillReceivesFullEditPayload() {
  const { provider, requests } = createProvider({ failInteractions: true });
  const originalBase64 = Buffer.from('failed-page-image').toString('base64');
  const referenceBase64 = Buffer.from('emilia-reference').toString('base64');

  await provider.editImage({
    originalImage: Buffer.from('failed-page-image'),
    originalMimeType: 'image/png',
    editInstructions: 'Repair only Emilia identity and preserve the rest of the comic page.',
    previousInteractionId: 'interaction-generate-123',
    aspectRatio: '3:4',
    referenceImages: [
      {
        base64Data: referenceBase64,
        mimeType: 'image/png',
        characterName: 'Емілія',
        instructionText: 'Image 1: Character reference for "Емілія".',
      },
    ],
    operation: 'graphic_novel_page_validation_repair_edit',
  });

  assert.equal(requests.interaction?.previous_interaction_id, 'interaction-generate-123');
  assert.deepEqual(
    requests.interaction?.input.map((part: any) => part.type),
    ['text', 'image', 'text']
  );

  const fallbackParts = requests.generateContent?.contents?.[0]?.parts ?? [];
  assert.ok(
    fallbackParts.some((part: any) => part.inlineData?.data === referenceBase64),
    'fallback sends reference image'
  );
  assert.ok(
    fallbackParts.some((part: any) => part.inlineData?.data === originalBase64),
    'fallback sends failed source image'
  );
  assert.ok(
    fallbackParts.some((part: any) => /Repair only Emilia identity/.test(part.text ?? '')),
    'fallback sends edit instructions'
  );
}

async function run() {
  await testConversationalEditUsesPreviousInteractionWithoutResendingImages();
  await testGenerateContentFallbackStillReceivesFullEditPayload();
  console.log('NanoBananaProProvider tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
