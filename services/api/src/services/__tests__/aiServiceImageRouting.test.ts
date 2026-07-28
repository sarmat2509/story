import assert from 'node:assert/strict';

process.env.SIMPLE_IMAGE_PROVIDER = 'seedream';
process.env.SIMPLE_IMAGE_MODEL = 'seedream-5-0-lite-260128';
process.env.SEEDREAM_API_KEY = process.env.SEEDREAM_API_KEY || 'test-seedream-key';
process.env.COMPLEX_IMAGE_PROVIDER = 'nanobananapro';
process.env.COMPLEX_IMAGE_MODEL = 'gemini-3.1-flash-image';
process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'test-google-key';
process.env.ENABLE_IMAGE_VALIDATION = 'false';

async function main(): Promise<void> {
  const {
    getImageDomainService,
    getComplexImageDomainService,
    getEnvironmentImageProvider,
    getLlmTurnaroundImageDomainService,
    resetServices,
  } = await import('../aiService');

  resetServices();

  const simpleImageDomain = getImageDomainService() as any;
  const complexImageDomain = getComplexImageDomainService() as any;
  const environmentProvider = getEnvironmentImageProvider() as any;
  const llmTurnaroundImageDomain = getLlmTurnaroundImageDomainService() as any;

  assert.equal(
    simpleImageDomain.imageProvider?.constructor?.name,
    'SeedreamImageProvider',
    'simple story image service should follow SIMPLE_IMAGE_PROVIDER'
  );
  assert.equal(
    simpleImageDomain.imageProvider?.model,
    'seedream-5-0-lite-260128',
    'simple Seedream image service should follow SIMPLE_IMAGE_MODEL'
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
  assert.equal(
    environmentProvider?.constructor?.name,
    'SeedreamImageProvider',
    'environment and outfit reference image provider should follow SIMPLE_IMAGE_PROVIDER'
  );
  assert.equal(
    environmentProvider?.model,
    'seedream-5-0-lite-260128',
    'environment and outfit reference image provider should follow SIMPLE_IMAGE_MODEL'
  );
  assert.equal(
    llmTurnaroundImageDomain.imageProvider?.constructor?.name,
    'SeedreamImageProvider',
    'LLM turnaround image service should follow SIMPLE_IMAGE_PROVIDER'
  );
  assert.equal(
    llmTurnaroundImageDomain.imageProvider?.model,
    'seedream-5-0-lite-260128',
    'LLM turnaround image service should follow SIMPLE_IMAGE_MODEL'
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
