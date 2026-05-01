import type { Asset, ImageValidationResultRow } from '../db/schema';
import { getAssetRepository, getImageValidationRepository } from '../repositories';
import { getAssetStorageService } from './assetStorageService';
import { logger } from '../utils/logger';

type DeletableAssetPathRow = Pick<Asset, 'storagePath' | 'thumbnailPath'>;
type DeletableValidationPathRow = Pick<ImageValidationResultRow, 'imageStoragePath'>;

function addStoragePath(paths: Set<string>, raw: unknown): void {
  if (typeof raw !== 'string') {
    return;
  }

  const storagePath = raw.trim();
  if (storagePath.length === 0) {
    return;
  }

  paths.add(storagePath);
}

export function collectStoryDeletionStoragePaths(input: {
  assets: DeletableAssetPathRow[];
  imageValidationRows: DeletableValidationPathRow[];
}): string[] {
  const paths = new Set<string>();

  for (const asset of input.assets) {
    addStoragePath(paths, asset.storagePath);
    addStoragePath(paths, asset.thumbnailPath);
  }

  for (const row of input.imageValidationRows) {
    addStoragePath(paths, row.imageStoragePath);
  }

  return [...paths];
}

export interface DeleteStoryStorageResult {
  attempted: number;
  deleted: number;
}

export async function deleteStoryStorageFiles(storyId: string): Promise<DeleteStoryStorageResult> {
  const [assets, imageValidationRows] = await Promise.all([
    getAssetRepository().findByStoryId(storyId),
    getImageValidationRepository().listAllByStoryId(storyId),
  ]);
  const storagePaths = collectStoryDeletionStoragePaths({ assets, imageValidationRows });
  const storage = getAssetStorageService();

  let deleted = 0;
  for (const storagePath of storagePaths) {
    await storage.deleteAsset(storagePath);
    deleted += 1;
  }

  logger.info(
    {
      storyId,
      attempted: storagePaths.length,
      deleted,
      assetRows: assets.length,
      imageValidationRows: imageValidationRows.length,
    },
    'Story storage files deleted'
  );

  return {
    attempted: storagePaths.length,
    deleted,
  };
}
