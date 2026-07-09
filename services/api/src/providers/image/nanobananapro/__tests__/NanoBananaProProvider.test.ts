import assert from 'node:assert/strict';
import { NanoBananaProProvider } from '../NanoBananaProProvider';

function createProvider(params?: {
  failGenerateContent?: boolean;
  omitGenerateUsage?: boolean;
}) {
  const provider = new NanoBananaProProvider('test-api-key', 'gemini-3.1-flash-image');
  const requests: {
    countTokens: any[];
    generateContent: any | null;
  } = {
    countTokens: [],
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
        if (params?.failGenerateContent) {
          throw new Error('generateContent unavailable');
        }
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
          ...(params?.omitGenerateUsage
            ? {}
            : { usageMetadata: { promptTokenCount: 7, totalTokenCount: 9 } }),
        };
      },
    },
  };

  return { provider, requests };
}

async function testEditSendsSourceImageReferencesAndPromptInOrderWithoutInteractionId() {
  const { provider, requests } = createProvider();
  const originalBase64 = Buffer.from('failed-page-image').toString('base64');
  const referenceBase64 = Buffer.from('emilia-reference').toString('base64');

  const result = await provider.editImage({
    originalImage: Buffer.from('failed-page-image'),
    originalMimeType: 'image/png',
    editInstructions: 'Repair only Emilia identity and preserve the rest of the comic page.',
    aspectRatio: '3:4',
    referenceImages: [
      {
        base64Data: referenceBase64,
        mimeType: 'image/png',
        characterName: 'Emilia',
        referenceBindingId: 'REF_CH_EMILIA_TEST01',
        instructionText: 'REF_CH_EMILIA_TEST01: character identity reference.',
      },
    ],
    operation: 'graphic_novel_panel_crop_validation_edit',
  });

  assert.equal(result.providerInteractionId, undefined);
  assert.equal(requests.generateContent?.config?.systemInstruction, undefined);
  assert.deepEqual(requests.generateContent?.config?.responseModalities, ['IMAGE', 'TEXT']);
  const parts = requests.generateContent?.contents?.[0]?.parts ?? [];
  assert.deepEqual(
    parts.map((part: any) =>
      part.text ? 'text' : part.inlineData ? 'inlineData' : part.fileData ? 'fileData' : 'unknown'
    ),
    ['text', 'inlineData', 'text', 'inlineData', 'text']
  );
  assert.match(parts[0].text, /SOURCE_IMAGE/);
  assert.match(parts[0].text, /comic page to edit/i);
  assert.doesNotMatch(parts[0].text, /outfit/i);
  assert.equal(parts[1].inlineData?.data, originalBase64);
  assert.equal(
    parts[2].text,
    'The next image is REF_CH_EMILIA_TEST01: a character identity reference.'
  );
  assert.equal(parts[3].inlineData?.data, referenceBase64);
  assert.match(parts[4].text, /Repair only Emilia identity/);

  const manifest = result.requestManifest as any;
  assert.equal(manifest.endpointPlan, 'generateContent');
  assert.equal(manifest.endpointUsed, 'generateContent');
  assert.equal(manifest.modelRequest.endpoint, 'models.generateContent');
  assert.deepEqual(
    manifest.modelRequest.input.map((part: any) => part.type),
    ['text', 'image', 'text', 'image', 'text']
  );
  assert.equal(manifest.modelRequest.input[1].data, '[omitted base64 image payload]');
  assert.equal(manifest.modelRequest.input[1].dataLength, originalBase64.length);
  assert.equal(manifest.modelRequest.input[3].data, '[omitted base64 image payload]');
  assert.equal(manifest.modelRequest.config.imageConfig.aspectRatio, '3:4');
  assert.deepEqual(manifest.modelRequest.config.responseModalities, ['IMAGE', 'TEXT']);
}

async function testInitialGenerationSendsReferencesAsLabelImagePairsBeforePrompt() {
  const { provider, requests } = createProvider();
  const objectReferenceBase64 = Buffer.from('object-reference').toString('base64');
  const characterFileUri = 'https://generativelanguage.googleapis.com/v1beta/files/character-ref';

  await provider.generateImage({
    prompt: 'Draw the scene using both references.',
    aspectRatio: '16:9',
    referenceImages: [
      {
        base64Data: objectReferenceBase64,
        mimeType: 'image/png',
        referenceKind: 'object',
        referenceBindingId: 'REF_OBJECT_LOGO',
      },
      {
        fileUri: characterFileUri,
        mimeType: 'image/jpeg',
        referenceKind: 'character',
        characterName: 'Emilia',
        instructionText: 'REF_CH_EMILIA: identity reference for Emilia.',
      },
    ],
  });

  assert.deepEqual(
    requests.generateContent?.contents?.[0]?.parts.map((part: any) =>
      part.text ? 'text' : part.inlineData ? 'inlineData' : part.fileData ? 'fileData' : 'unknown'
    ),
    ['text', 'inlineData', 'text', 'fileData', 'text']
  );
  assert.equal(
    requests.generateContent?.contents?.[0]?.parts[0].text,
    'The next image is REF_OBJECT_LOGO: an object or environment reference.'
  );
  assert.equal(requests.generateContent?.contents?.[0]?.parts[1].inlineData?.data, objectReferenceBase64);
  assert.equal(
    requests.generateContent?.contents?.[0]?.parts[2].text,
    'The next image is REF_CH_EMILIA: an identity reference for Emilia.'
  );
  assert.equal(requests.generateContent?.contents?.[0]?.parts[3].fileData?.fileUri, characterFileUri);
  assert.match(requests.generateContent?.contents?.[0]?.parts[4].text, /Draw the scene/);

  const manifest = (await provider.generateImage({
    prompt: 'Draw the scene using both references.',
    aspectRatio: '16:9',
    referenceImages: [
      {
        base64Data: objectReferenceBase64,
        mimeType: 'image/png',
        referenceKind: 'object',
        referenceBindingId: 'REF_OBJECT_LOGO',
      },
    ],
  })).requestManifest as any;
  assert.deepEqual(
    manifest.modelRequest.input.map((part: any) => part.type),
    ['text', 'image', 'text']
  );
  assert.equal(manifest.modelRequest.input[1].data, '[omitted base64 image payload]');
  assert.equal(manifest.modelRequest.config.imageConfig.aspectRatio, '16:9');
  assert.deepEqual(manifest.modelRequest.config.responseModalities, ['IMAGE', 'TEXT']);
}

async function testGenerateContentUsageWithoutProviderMetadata() {
  const { provider, requests } = createProvider({ omitGenerateUsage: true });
  const usageEvents: any[] = [];

  await provider.generateImage({
    prompt: 'Draw one finished comic panel crop.',
    aspectRatio: '3:4',
    operation: 'graphic_novel_template_panel_generate',
    onUsage: (usage) => usageEvents.push(usage),
  });

  assert.equal(requests.generateContent?.config?.imageConfig?.aspectRatio, '3:4');
  assert.equal(usageEvents.length, 1);
  assert.equal(usageEvents[0].operation, 'graphic_novel_template_panel_generate');
  assert.equal(usageEvents[0].provider, 'gemini');
  assert.equal(usageEvents[0].model, 'gemini-3.1-flash-image');
  assert.equal(usageEvents[0].inputUnits, 0);
  assert.ok(usageEvents[0].imageTokens > 0);
}

async function testRequestManifestKeepsFullSystemInstruction() {
  const longSystemInstruction = [
    'Use attached reference image labels as stable IDs.',
    'Render the requested story image with all normal image-system constraints.',
    'x'.repeat(2600),
  ].join('\n');

  const { provider: generateProvider } = createProvider();
  const generated = (await generateProvider.generateImage({
    prompt: 'Draw one finished story scene.',
    aspectRatio: '16:9',
    systemInstruction: longSystemInstruction,
  })).requestManifest as any;

  assert.equal(generated.modelRequest.config.systemInstruction, longSystemInstruction);
  assert.doesNotMatch(generated.modelRequest.config.systemInstruction, /\[truncated/);

  const { provider: editProvider } = createProvider();
  const edited = (await editProvider.editImage({
    originalImage: Buffer.from('scene-image'),
    originalMimeType: 'image/png',
    editInstructions: 'Repair only the character identity.',
    aspectRatio: '16:9',
    systemInstruction: longSystemInstruction,
  })).requestManifest as any;

  assert.equal(edited.modelRequest.config.systemInstruction, longSystemInstruction);
  assert.doesNotMatch(edited.modelRequest.config.systemInstruction, /\[truncated/);
}

async function run() {
  await testEditSendsSourceImageReferencesAndPromptInOrderWithoutInteractionId();
  await testInitialGenerationSendsReferencesAsLabelImagePairsBeforePrompt();
  await testGenerateContentUsageWithoutProviderMetadata();
  await testRequestManifestKeepsFullSystemInstruction();
  console.log('NanoBananaProProvider tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
