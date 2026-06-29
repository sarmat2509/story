import assert from 'node:assert/strict';

process.env.IMAGE_PROVIDER = 'seedream';
process.env.SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || 'test-seedream-key';
process.env.COMPLEX_IMAGE_PROVIDER = 'nanobananapro';
process.env.COMPLEX_IMAGE_MODEL = 'gemini-3.1-flash-image';
process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'test-google-key';
process.env.ENABLE_IMAGE_VALIDATION = 'false';

async function main(): Promise<void> {
  const { getImageDomainService, getComplexImageDomainService, resetServices } = await import(
    '../aiService'
  );

  resetServices();

  const simpleImageDomain = getImageDomainService() as any;
  const complexImageDomain = getComplexImageDomainService() as any;

  assert.equal(
    simpleImageDomain.imageProvider?.constructor?.name,
    'SeedreamImageProvider',
    'simple story image service should follow IMAGE_PROVIDER'
  );
  assert.equal(
    complexImageDomain.imageProvider?.constructor?.name,
    'NanoBananaProProvider',
    'complex comic image service should follow COMPLEX_IMAGE_PROVIDER'
  );
  assert.equal(
    complexImageDomain.imageProvider?.model,
    'gemini-3.1-flash-image',
    'complex comic image service should use the configured Gemini 3.1 image model'
  );
  assert.deepEqual(
    complexImageDomain.imageProvider?.calculateDimensions('3:4'),
    { width: 896, height: 1200 },
    'Gemini 3.1 Flash Image 1K 3:4 metadata should match the official output size table'
  );

  resetServices();

  console.log('aiServiceImageRouting tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
