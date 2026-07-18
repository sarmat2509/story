import assert from 'node:assert/strict';
import { MockImageProvider, mockGeneratedImage } from '../../testing/ai';

const userId = '71111111-1111-4111-8111-111111111111';
const characterId = '72222222-2222-4222-8222-222222222222';
const childId = '73333333-3333-4333-8333-333333333333';

async function main(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';

  const { clearRepositoryTestOverrides, installRepositoryTestOverrides } =
    await import('../../repositories');
  const {
    clearAiServiceTestOverrides,
    installAiServiceTestOverrides,
  } = await import('../../services/aiService');
  const {
    clearAssetStorageServiceTestOverride,
    installAssetStorageServiceTestOverride,
  } = await import('../../services/assetStorageService');
  const {
    generateTurnaroundSheetFromDescription,
    generateTurnaroundSheetFromReference,
  } = await import('../../services/turnaroundSheetService');

  const uploads: Array<{ photoType: string; size: number }> = [];
  const characterSheets: unknown[] = [];
  const childSheets: unknown[] = [];
  const mirrorSheets: unknown[] = [];

  installAssetStorageServiceTestOverride({
    getAssetByPath: async (path: string) => {
      assert.ok(path.includes('photos/'));
      return Buffer.from('mock-reference-photo');
    },
    uploadUserPhoto: async (input: { photoType: string; buffer: Buffer }) => {
      uploads.push({ photoType: input.photoType, size: input.buffer.length });
      return {
        storagePath: `development/${userId}/photos/${input.photoType}/sheet.png`,
        storageUrl: `/api/v1/assets/development/${userId}/photos/${input.photoType}/sheet.png`,
        signedUrl: null,
      };
    },
    generateAvatarThumbnail: async (buffer: Buffer) => buffer,
  } as any);

  installRepositoryTestOverrides({
    character: {
      updateTurnaroundSheet: async (_id: string, sheet: unknown) => {
        characterSheets.push(sheet);
      },
      updateTurnaroundSheetByChildProfileId: async (_id: string, sheet: unknown) => {
        mirrorSheets.push(sheet);
      },
    } as any,
    childProfile: {
      updateTurnaroundSheet: async (_id: string, sheet: unknown) => {
        childSheets.push(sheet);
      },
    } as any,
  });

  try {
    await assert.rejects(
      () =>
        generateTurnaroundSheetFromReference({
          targetType: 'character',
          targetId: characterId,
          referencePhotoUrls: [],
          characterName: 'Maple Fox',
          userId,
        }),
      /At least one reference photo URL is required/
    );

    const referenceProvider = new MockImageProvider().queueGenerate(
      'image_generate',
      mockGeneratedImage()
    );
    installAiServiceTestOverrides({ turnaroundImageProvider: referenceProvider });

    const fromReference = await generateTurnaroundSheetFromReference({
      targetType: 'character',
      targetId: characterId,
      referencePhotoUrls: [`/api/v1/assets/development/${userId}/photos/character/ref.jpg`],
      characterName: 'Maple Fox',
      userId,
      aiDescription: 'A fox with a red scarf.',
    });

    assert.equal(fromReference.url, `development/${userId}/photos/character_turnaround/sheet.png`);
    assert.equal(fromReference.sourcePhotoUrl.includes('ref.jpg'), true);
    assert.equal(characterSheets.length, 1);
    assert.equal(uploads.some((row) => row.photoType === 'character_turnaround'), true);
    referenceProvider.assertExhausted();
    clearAiServiceTestOverrides();

    const descriptionProvider = new MockImageProvider().queueGenerate(
      'image_generate',
      mockGeneratedImage()
    );
    installAiServiceTestOverrides({ turnaroundImageProvider: descriptionProvider });

    const fromDescription = await generateTurnaroundSheetFromDescription({
      targetType: 'child',
      targetId: childId,
      characterName: 'Mira',
      characterDescription: 'A cheerful child with curly hair.',
      userId,
    });

    assert.equal(fromDescription.url, `development/${userId}/photos/child_turnaround/sheet.png`);
    assert.equal(fromDescription.sourcePhotoUrl, 'text-description');
    assert.equal(childSheets.length, 1);
    assert.equal(mirrorSheets.length, 1);
    assert.equal(uploads.some((row) => row.photoType === 'child_turnaround'), true);
    descriptionProvider.assertExhausted();
  } finally {
    clearAiServiceTestOverrides();
    clearRepositoryTestOverrides();
    clearAssetStorageServiceTestOverride();
  }

  console.log('turnaroundSheetService contracts passed (3 cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
