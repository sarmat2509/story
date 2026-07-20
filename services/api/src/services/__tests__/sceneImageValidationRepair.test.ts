import assert from 'node:assert/strict';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import type { GeneratedImage } from '../../providers/base/IImageProvider';

process.env.NODE_ENV = 'test';
process.env.ENABLE_IMAGE_VALIDATION = 'true';
process.env.IMAGE_VALIDATION_USE_EDIT_REPAIR = 'true';
process.env.IMAGE_VALIDATION_MAX_RETRIES = '1';
process.env.IMAGE_VALIDATION_MIN_ACCEPT_SCORE = '85';

type ValidationInsert = {
  storyId: string;
  sceneIndex: number;
  attempt: number;
  imageStoragePath: string;
  validationScore: number | null;
  result: Record<string, unknown>;
};

type AssetCreate = {
  storagePath: string;
  generationParams: Record<string, unknown>;
};

type InstallRepositoryTestOverrides =
  typeof import('../../repositories').installRepositoryTestOverrides;
type GenerateSceneImageWithReference =
  (typeof import('../storyOrchestrationService'))['storyOrchestrationTestSeams']['generateSceneImageWithReference'];
type SceneImageTestDependencies = {
  ImageDomainService: typeof import('../../domain/image/ImageDomainService').ImageDomainService;
  MockImageProvider: typeof import('../../testing/ai').MockImageProvider;
  MockTextProvider: typeof import('../../testing/ai').MockTextProvider;
  generateSceneImageWithReference: GenerateSceneImageWithReference;
  installRepositoryTestOverrides: InstallRepositoryTestOverrides;
  sharp: typeof import('sharp');
};

type Harness = {
  assetCreates: AssetCreate[];
  stageEvents: Array<Record<string, unknown>>;
  uploads: Buffer[];
  validationInserts: ValidationInsert[];
  waitForRejectedValidation: () => Promise<void>;
  assetStorage: {
    uploadAsset(input: { data: Buffer | string }): Promise<Record<string, unknown>>;
    generateThumbnail(): Promise<Buffer>;
  };
};

function installPersistenceHarness(
  installRepositoryTestOverrides: InstallRepositoryTestOverrides,
  storagePath: string
): Harness {
  const assetCreates: AssetCreate[] = [];
  const stageEvents: Array<Record<string, unknown>> = [];
  const uploads: Buffer[] = [];
  const validationInserts: ValidationInsert[] = [];
  let resolveRejectedValidation!: () => void;
  const rejectedValidationPersisted = new Promise<void>((resolve) => {
    resolveRejectedValidation = resolve;
  });

  const assetRepository = {
    async create(input: AssetCreate) {
      assetCreates.push(structuredClone(input));
      return { id: `asset-${assetCreates.length}`, ...input };
    },
    async update() {
      throw new Error('thumbnail persistence should not run after thumbnail generation fails');
    },
  };
  const imageValidationRepository = {
    async insert(input: ValidationInsert) {
      validationInserts.push(structuredClone(input));
      if (input.imageStoragePath.includes('/rejected/')) {
        resolveRejectedValidation();
      }
      return { id: `validation-${validationInserts.length}`, ...input };
    },
  };
  const storyGenerationStageEventRepository = {
    async create(input: Record<string, unknown>) {
      stageEvents.push(structuredClone(input));
      return { id: `stage-${stageEvents.length}`, ...input };
    },
  };

  installRepositoryTestOverrides({
    asset: assetRepository,
    imageValidation: imageValidationRepository,
    storyGenerationStageEvent: storyGenerationStageEventRepository,
  });

  return {
    assetCreates,
    stageEvents,
    uploads,
    validationInserts,
    waitForRejectedValidation: async () => {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          rejectedValidationPersisted,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Rejected validation persistence did not finish')),
              2_000
            );
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    assetStorage: {
      async uploadAsset(input: { data: Buffer | string }) {
        uploads.push(
          Buffer.isBuffer(input.data) ? Buffer.from(input.data) : Buffer.from(input.data, 'base64')
        );
        return {
          storagePath,
          storageUrl: `/assets/${storagePath}`,
          signedUrl: `/signed/${storagePath}`,
          signedUrlExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
          fileSizeBytes: uploads.at(-1)?.length ?? 0,
        };
      },
      async generateThumbnail() {
        throw new Error('thumbnail disabled in orchestration test');
      },
    },
  };
}

function sceneQaResult(valid: boolean) {
  return {
    missingExpectedCharacters: [],
    characterBoundingBoxes: [],
    hasUnexpectedCharacters: !valid,
    unexpectedCharacterNotes: valid ? null : 'An extra figure appears in the background.',
    hasTextOrLetters: !valid,
    hasRenderingArtifacts: !valid,
    overallFeedback: valid
      ? 'The repaired illustration is clean.'
      : 'Remove the extra figure, visible letters, and rendering artifacts.',
  };
}

function sceneQaReferenceTitleLeak() {
  return {
    missingExpectedCharacters: [],
    characterBoundingBoxes: [],
    hasUnexpectedCharacters: false,
    unexpectedCharacterNotes: null,
    hasTextOrLetters: true,
    hasRenderingArtifacts: false,
    overallFeedback: 'A leaked reference title, REF_CH_SILVER_MOON_933793, is visible.',
  };
}

function generatedImage(imageData: Buffer, fixture: string): GeneratedImage {
  return {
    imageData,
    mimeType: 'image/png',
    width: 16,
    height: 16,
    format: 'png',
    requestManifest: { provider: 'mock', fixture },
  };
}

async function createPng(
  sharp: typeof import('sharp'),
  color: { r: number; g: number; b: number }
): Promise<Buffer> {
  return sharp
    .default({
      create: {
        width: 16,
        height: 16,
        channels: 4,
        background: { ...color, alpha: 1 },
      },
    })
    .png()
    .toBuffer();
}

function sceneInput() {
  return {
    sceneId: 1,
    text: 'A lantern glows beside the quiet path.',
    primaryRead: 'A warm lantern on a quiet path.',
    sceneVisual: {
      setting: 'A quiet woodland path at sunset.',
      lighting: 'Warm sunset light.',
      cameraComposition: {
        shot: 'Wide establishing shot.',
        characters: [],
      },
    },
  };
}

function imageContext(imageDomain: unknown, assetStorage: Harness['assetStorage']) {
  return {
    sceneDbId: 'scene-db-1',
    characters: [],
    userStyle: 'soft_watercolor',
    ageGroup: '6-8',
    userPlan: {
      imagesPerStory: 1,
      imageQuality: 'standard',
      imageRegenerationPerDay: 5,
      allowReferencePhotos: false,
      storiesPerMonth: 10,
      audioStoriesPerMonth: 5,
    },
    userId: 'user-image-repair',
    assetStorage,
    imageDomain,
    complexImageDomain: imageDomain,
    referenceImageDataArray: [],
  };
}

async function cleanupGeneratedDebugFiles(storyId: string): Promise<void> {
  const repositoryRoot = path.resolve(__dirname, '../../../../..');
  await Promise.all([
    rm(path.join(repositoryRoot, 'image-prompt-debug', storyId), {
      recursive: true,
      force: true,
    }),
    rm(path.resolve(process.cwd(), 'uploads', 'test', 'user-image-repair', storyId), {
      recursive: true,
      force: true,
    }),
  ]);
}

async function testReferenceTitleForcesEditThenPersistsRevalidatedImage(
  dependencies: SceneImageTestDependencies
): Promise<void> {
  const storyId = 'story-image-edit-repair';
  const initialImage = await createPng(dependencies.sharp, { r: 210, g: 40, b: 40 });
  const editedImage = await createPng(dependencies.sharp, { r: 40, g: 180, b: 80 });
  const imageProvider = new dependencies.MockImageProvider()
    .queueGenerate('image_generate', generatedImage(initialImage, 'initial'))
    .queueEdit('image_edit', generatedImage(editedImage, 'edited'));
  const validationProvider = new dependencies.MockTextProvider()
    .queueStructured('image_validation_segmented_scene_qa', sceneQaReferenceTitleLeak())
    .queueStructured('image_validation_segmented_scene_qa', sceneQaResult(true));
  const imageDomain = new dependencies.ImageDomainService(imageProvider, validationProvider);
  const harness = installPersistenceHarness(
    dependencies.installRepositoryTestOverrides,
    'test/final-edited.png'
  );

  try {
    const result = await dependencies.generateSceneImageWithReference(
      storyId,
      sceneInput(),
      imageContext(imageDomain, harness.assetStorage)
    );
    await harness.waitForRejectedValidation();

    assert.deepStrictEqual(
      imageProvider.requests.map((entry) => [entry.kind, entry.request.operation]),
      [
        ['generate', 'image_generate'],
        ['edit', 'image_edit'],
      ]
    );
    assert.deepStrictEqual(
      validationProvider.structuredRequests.map((request) => request.operation),
      ['image_validation_segmented_scene_qa', 'image_validation_segmented_scene_qa']
    );
    const editRequest = imageProvider.requests[1];
    assert.equal(editRequest.kind, 'edit');
    if (editRequest.kind === 'edit') {
      assert.deepStrictEqual(editRequest.request.originalImage, initialImage);
      assert.match(editRequest.request.editInstructions, /visible text/i);
      assert.match(editRequest.request.editInstructions, /reference-sheet title/i);
    }
    assert.equal(result.imageUrl, 'test/final-edited.png');
    assert.deepStrictEqual(harness.uploads, [editedImage]);
    assert.equal(harness.assetCreates.length, 1);
    assert.equal(harness.assetCreates[0].storagePath, 'test/final-edited.png');
    assert.equal(harness.assetCreates[0].generationParams.validationRepairMode, 'edit');
    assert.deepStrictEqual(
      (harness.assetCreates[0].generationParams.repairRequestManifest as Record<string, unknown>)
        .fixture,
      'edited'
    );
    const finalValidation = harness.validationInserts.find(
      (row) => row.imageStoragePath === 'test/final-edited.png'
    );
    assert.ok(finalValidation, 'the selected edited image validation must be persisted');
    assert.equal(finalValidation.attempt, 2);
    assert.equal(finalValidation.validationScore, 100);
    assert.equal(finalValidation.result.hasRenderingArtifacts, false);
    imageProvider.assertExhausted();
    validationProvider.assertExhausted();
  } finally {
    await cleanupGeneratedDebugFiles(storyId);
  }
}

async function testEditFailureFallsBackToGeneration(
  dependencies: SceneImageTestDependencies
): Promise<void> {
  const storyId = 'story-image-generate-fallback';
  const initialImage = await createPng(dependencies.sharp, { r: 220, g: 120, b: 20 });
  const regeneratedImage = await createPng(dependencies.sharp, { r: 40, g: 100, b: 220 });
  const imageProvider = new dependencies.MockImageProvider()
    .queueGenerate('image_generate', generatedImage(initialImage, 'initial'))
    .queueError('edit', 'image edit unavailable', 'image_edit')
    .queueGenerate('image_generate', generatedImage(regeneratedImage, 'regenerated'));
  const validationProvider = new dependencies.MockTextProvider()
    .queueStructured('image_validation_segmented_scene_qa', sceneQaResult(false))
    .queueStructured('image_validation_segmented_scene_qa', sceneQaResult(true));
  const imageDomain = new dependencies.ImageDomainService(imageProvider, validationProvider);
  const harness = installPersistenceHarness(
    dependencies.installRepositoryTestOverrides,
    'test/final-regenerated.png'
  );

  try {
    const result = await dependencies.generateSceneImageWithReference(
      storyId,
      sceneInput(),
      imageContext(imageDomain, harness.assetStorage)
    );
    await harness.waitForRejectedValidation();

    assert.deepStrictEqual(
      imageProvider.requests.map((entry) => [entry.kind, entry.request.operation]),
      [
        ['generate', 'image_generate'],
        ['edit', 'image_edit'],
        ['generate', 'image_generate'],
      ]
    );
    assert.equal(result.imageUrl, 'test/final-regenerated.png');
    assert.deepStrictEqual(harness.uploads, [regeneratedImage]);
    const finalValidation = harness.validationInserts.find(
      (row) => row.imageStoragePath === 'test/final-regenerated.png'
    );
    assert.ok(finalValidation, 'the fallback-generated image validation must be persisted');
    assert.equal(finalValidation.attempt, 2);
    assert.equal(finalValidation.validationScore, 100);
    assert.ok(
      harness.stageEvents.some(
        (event) => event.operation === 'scene_image_edit_repair' && event.status === 'failed'
      )
    );
    assert.ok(
      harness.stageEvents.some(
        (event) => event.operation === 'scene_image_regeneration' && event.status === 'completed'
      )
    );
    imageProvider.assertExhausted();
    validationProvider.assertExhausted();
  } finally {
    await cleanupGeneratedDebugFiles(storyId);
  }
}

async function main(): Promise<void> {
  const [sharp, imageModule, mocks, repositories, orchestration] = await Promise.all([
    import('sharp'),
    import('../../domain/image/ImageDomainService'),
    import('../../testing/ai'),
    import('../../repositories'),
    import('../storyOrchestrationService'),
  ]);
  const dependencies = {
    sharp,
    ImageDomainService: imageModule.ImageDomainService,
    MockImageProvider: mocks.MockImageProvider,
    MockTextProvider: mocks.MockTextProvider,
    generateSceneImageWithReference:
      orchestration.storyOrchestrationTestSeams.generateSceneImageWithReference,
    installRepositoryTestOverrides: repositories.installRepositoryTestOverrides,
  };

  try {
    await testReferenceTitleForcesEditThenPersistsRevalidatedImage(dependencies);
    repositories.clearRepositoryTestOverrides();
    await testEditFailureFallsBackToGeneration(dependencies);
    console.log('scene image validation repair tests passed');
  } finally {
    repositories.clearRepositoryTestOverrides();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
