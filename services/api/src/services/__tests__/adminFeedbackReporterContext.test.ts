import assert from 'node:assert/strict';
import {
  clearRepositoryTestOverrides,
  installRepositoryTestOverrides,
} from '../../repositories';
import {
  clearAssetStorageServiceTestOverride,
  installAssetStorageServiceTestOverride,
} from '../assetStorageService';
import { listAdminFeedback } from '../adminService';

async function main(): Promise<void> {
  const now = new Date('2026-07-26T08:00:00.000Z');

  installRepositoryTestOverrides({
    feedback: {
      listAllPaginated: async () => [
        {
          id: 'f0111111-1111-4111-8111-111111111111',
          userId: 'u0111111-1111-4111-8111-111111111111',
          userEmail: 'parent@example.test',
          category: 'bug',
          message: 'The story reader stopped responding after a page turn.',
          email: null,
          screenshotUrl: null,
          context: {
            reportedScreen: 'story_viewer',
            supportTopic: 'bug',
            reporterSessionMode: 'child',
            reporterChildProfileId: 'c0111111-1111-4111-8111-111111111111',
            reporterChildName: 'Mia',
          },
          createdAt: now,
        },
      ],
      countAll: async () => 1,
    } as any,
  });
  installAssetStorageServiceTestOverride({
    generateSignedUrl: async () => ({ signedUrl: '' }),
  } as any);

  try {
    const result = await listAdminFeedback({ limit: 20, offset: 0 });
    assert.equal(result.meta.total, 1);
    assert.equal(result.items[0].context.reporterSessionMode, 'child');
    assert.equal(result.items[0].context.reporterChildProfileId, 'c0111111-1111-4111-8111-111111111111');
    assert.equal(result.items[0].context.reporterChildName, 'Mia');
  } finally {
    clearRepositoryTestOverrides();
    clearAssetStorageServiceTestOverride();
  }

  console.log('admin feedback reporter context passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
