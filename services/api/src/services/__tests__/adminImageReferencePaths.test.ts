import assert from 'node:assert/strict';
import { enrichAdminImageReferencePaths } from '../adminService';

const enriched = enrichAdminImageReferencePaths(
  {
    references: [
      {
        source: 'environment',
        referenceKind: 'object',
        referenceEnvironmentId: 'ravine',
        storagePath: null,
        url: null,
        hasBase64Data: true,
      },
      {
        source: 'character_reference',
        referenceKind: 'character',
        characterName: 'Ukraispa',
        storagePath: null,
        url: null,
        hasBase64Data: true,
      },
    ],
    requests: [
      {
        referenceImages: [
          {
            referenceKind: 'character',
            characterName: 'Ukraispa',
            hasBase64Data: true,
          },
        ],
      },
    ],
  },
  {
    environmentStoragePathById: new Map([['ravine', 'environment_cache/ravine.jpg']]),
    characterStoragePathByName: new Map([
      ['ukraispa', 'character_turnarounds/ukraispa.png'],
    ]),
  }
) as {
  references: Array<{ storagePath: string; url: string }>;
  requests: Array<{ referenceImages: Array<{ storagePath: string; url: string }> }>;
};

assert.deepStrictEqual(
  enriched.references.map(({ storagePath, url }) => ({ storagePath, url })),
  [
    {
      storagePath: 'environment_cache/ravine.jpg',
      url: '/api/v1/assets/environment_cache/ravine.jpg',
    },
    {
      storagePath: 'character_turnarounds/ukraispa.png',
      url: '/api/v1/assets/character_turnarounds/ukraispa.png',
    },
  ]
);
assert.equal(
  enriched.requests[0].referenceImages[0].url,
  '/api/v1/assets/character_turnarounds/ukraispa.png'
);

console.log('admin image reference path enrichment passed');
