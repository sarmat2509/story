import fs from 'node:fs/promises';
import path from 'node:path';
import { isNotNull } from 'drizzle-orm';
import db from '../db';
import * as schema from '../db/schema';
import { collectEntityAssetPaths, normalizeAssetStoragePath } from './entityAssetCleanupService';
import { logger } from '../utils/logger';

export interface OrphanStorageScanResult {
  storageRoot: string;
  dryRun: boolean;
  scannedFiles: number;
  referencedPaths: number;
  orphanPaths: string[];
  eligibleOrphanPaths: string[];
  skippedYoungOrphanPaths: string[];
  deletedPaths: string[];
  minAgeMs: number;
}

export interface OrphanStorageFileInfo {
  relativePath: string;
  mtimeMs: number;
}

export function shouldScanStorageFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  const basename = path.posix.basename(normalized);
  if (!normalized || normalized.endsWith('/')) return false;
  if (basename === '.DS_Store' || basename === '.gitkeep') return false;
  if (normalized.split('/').some((segment) => segment.startsWith('.'))) return false;
  if (normalized.startsWith('voice-samples/')) return false;
  return true;
}

export function findOrphanStoragePaths(files: string[], referencedPaths: Iterable<string>): string[] {
  const referenced = new Set([...referencedPaths].map((item) => item.replace(/\\/g, '/')));
  return files
    .map((item) => item.replace(/\\/g, '/'))
    .filter(shouldScanStorageFile)
    .filter((item) => !referenced.has(item))
    .sort();
}

export function resolveStorageFilePath(storageRoot: string, relativePath: string): string | null {
  const root = path.resolve(storageRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return resolved;
}

export function filterOrphanStoragePathsByMinimumAge(
  orphanPaths: string[],
  files: Iterable<OrphanStorageFileInfo>,
  minAgeMs: number | undefined,
  now = new Date()
): string[] {
  const ageMs = Number.isFinite(minAgeMs) && (minAgeMs ?? 0) > 0 ? Math.floor(minAgeMs ?? 0) : 0;
  const normalizedOrphanPaths = orphanPaths.map((item) => item.replace(/\\/g, '/'));

  if (ageMs <= 0) {
    return normalizedOrphanPaths;
  }

  const fileMtimes = new Map<string, number>();
  for (const file of files) {
    fileMtimes.set(file.relativePath.replace(/\\/g, '/'), file.mtimeMs);
  }

  const cutoffMs = now.getTime() - ageMs;
  return normalizedOrphanPaths.filter((orphanPath) => {
    const mtimeMs = fileMtimes.get(orphanPath);
    return typeof mtimeMs === 'number' && Number.isFinite(mtimeMs) && mtimeMs <= cutoffMs;
  });
}

function addPath(paths: Set<string>, raw: unknown): void {
  if (typeof raw !== 'string') return;
  const normalized = normalizeAssetStoragePath(raw);
  if (normalized) paths.add(normalized);
}

function collectPathsFromUnknown(value: unknown, paths: Set<string>): void {
  if (typeof value === 'string') {
    addPath(paths, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathsFromUnknown(item, paths);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectPathsFromUnknown(item, paths);
    }
  }
}

async function listStorageFiles(storageRoot: string): Promise<OrphanStorageFileInfo[]> {
  const root = path.resolve(storageRoot);
  const files: OrphanStorageFileInfo[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error: any) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        files.push({
          relativePath: path.relative(root, fullPath).replace(/\\/g, '/'),
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  }

  await walk(root);
  return files;
}

export async function collectReferencedStoragePaths(): Promise<Set<string>> {
  const paths = new Set<string>();

  const [
    assets,
    validationRows,
    childProfiles,
    characters,
    usersWithAvatars,
    stories,
    environmentCaches,
    outfitPlateCaches,
    llmTurnaroundCaches,
    voicesWithSamples,
  ] = await Promise.all([
    db.select({
      storagePath: schema.assets.storagePath,
      storageUrl: schema.assets.storageUrl,
      thumbnailPath: schema.assets.thumbnailPath,
      thumbnailUrl: schema.assets.thumbnailUrl,
    }).from(schema.assets),
    db.select({ imageStoragePath: schema.imageValidationResults.imageStoragePath })
      .from(schema.imageValidationResults),
    db.select({
      referencePhotos: schema.childProfiles.referencePhotos,
      turnaroundSheet: schema.childProfiles.turnaroundSheet,
    }).from(schema.childProfiles),
    db.select({
      referencePhotos: schema.characters.referencePhotos,
      turnaroundSheet: schema.characters.turnaroundSheet,
    }).from(schema.characters),
    db.select({ avatarUrl: schema.users.avatarUrl })
      .from(schema.users)
      .where(isNotNull(schema.users.avatarUrl)),
    db.select({
      scenes: schema.stories.scenes,
      metadata: schema.stories.metadata,
      audioMetadata: schema.stories.audioMetadata,
    }).from(schema.stories),
    db.select({ storagePath: schema.environmentImageCache.storagePath })
      .from(schema.environmentImageCache),
    db.select({ storagePath: schema.outfitPlateCache.storagePath })
      .from(schema.outfitPlateCache),
    db.select({ storagePath: schema.llmTurnaroundCache.storagePath })
      .from(schema.llmTurnaroundCache),
    db.select({ sampleAudioUrl: schema.ttsVoices.sampleAudioUrl })
      .from(schema.ttsVoices)
      .where(isNotNull(schema.ttsVoices.sampleAudioUrl)),
  ]);

  for (const asset of assets) {
    addPath(paths, asset.storagePath);
    addPath(paths, asset.storageUrl);
    addPath(paths, asset.thumbnailPath);
    addPath(paths, asset.thumbnailUrl);
  }
  for (const row of validationRows) {
    addPath(paths, row.imageStoragePath);
  }
  for (const childProfile of childProfiles) {
    for (const storagePath of collectEntityAssetPaths(childProfile)) paths.add(storagePath);
  }
  for (const character of characters) {
    for (const storagePath of collectEntityAssetPaths(character)) paths.add(storagePath);
  }
  for (const user of usersWithAvatars) {
    addPath(paths, user.avatarUrl);
  }
  for (const story of stories) {
    collectPathsFromUnknown(story.scenes, paths);
    collectPathsFromUnknown(story.metadata, paths);
    collectPathsFromUnknown(story.audioMetadata, paths);
  }
  for (const row of environmentCaches) addPath(paths, row.storagePath);
  for (const row of outfitPlateCaches) addPath(paths, row.storagePath);
  for (const row of llmTurnaroundCaches) addPath(paths, row.storagePath);
  for (const voice of voicesWithSamples) addPath(paths, voice.sampleAudioUrl);

  return paths;
}

export async function scanOrphanStorageFiles(options: {
  storageRoot?: string;
  apply?: boolean;
  maxDelete?: number;
  minAgeMs?: number;
} = {}): Promise<OrphanStorageScanResult> {
  const storageRoot = path.resolve(options.storageRoot ?? path.join(process.cwd(), 'uploads'));
  const fileInfos = await listStorageFiles(storageRoot);
  const files = fileInfos.map((file) => file.relativePath);
  const referencedPaths = await collectReferencedStoragePaths();
  const orphanPaths = findOrphanStoragePaths(files, referencedPaths);
  const minAgeMs =
    Number.isFinite(options.minAgeMs) && (options.minAgeMs ?? 0) > 0
      ? Math.floor(options.minAgeMs ?? 0)
      : 0;
  const eligibleOrphanPaths = filterOrphanStoragePathsByMinimumAge(
    orphanPaths,
    fileInfos,
    minAgeMs
  );
  const eligibleSet = new Set(eligibleOrphanPaths);
  const skippedYoungOrphanPaths = orphanPaths.filter((orphanPath) => !eligibleSet.has(orphanPath));
  const dryRun = options.apply !== true;
  const maxDelete = Math.max(0, options.maxDelete ?? 100);
  const deletedPaths: string[] = [];

  if (!dryRun) {
    for (const orphanPath of eligibleOrphanPaths.slice(0, maxDelete)) {
      const fullPath = resolveStorageFilePath(storageRoot, orphanPath);
      if (!fullPath) {
        logger.warn({ orphanPath }, 'Skipped unsafe orphan storage path');
        continue;
      }
      await fs.unlink(fullPath);
      deletedPaths.push(orphanPath);
    }
  }

  const result = {
    storageRoot,
    dryRun,
    scannedFiles: files.filter(shouldScanStorageFile).length,
    referencedPaths: referencedPaths.size,
    orphanPaths,
    eligibleOrphanPaths,
    skippedYoungOrphanPaths,
    deletedPaths,
    minAgeMs,
  };

  logger.info(
    {
      storageRoot,
      dryRun,
      scannedFiles: result.scannedFiles,
      referencedPaths: result.referencedPaths,
      orphanCount: orphanPaths.length,
      eligibleOrphanCount: eligibleOrphanPaths.length,
      skippedYoungOrphanCount: skippedYoungOrphanPaths.length,
      deletedCount: deletedPaths.length,
      minAgeMs,
    },
    'Orphan storage scan completed'
  );

  return result;
}
