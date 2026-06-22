/**
 * Generate lightweight thumbnails for story artifact catalog images.
 *
 * Usage:
 *   pnpm --filter wondertales-api generate:story-artifact-thumbnails
 *   pnpm --filter wondertales-api generate:story-artifact-thumbnails -- --force --size=320
 */

import './loadEnvForScripts';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { closeDatabaseConnection } from '../db';
import { getStoryArtifactRepository } from '../repositories';
import {
  normalizeStoryArtifactImagePath,
  storyArtifactThumbnailPath,
} from '../services/storyArtifactImageService';

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function getNumberArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const uploadRoot = path.resolve(process.cwd(), 'uploads');
  const artifacts = await getStoryArtifactRepository().findAllActive();
  const force = hasFlag('force');
  const size = getNumberArg('size', 320);
  const quality = Math.min(getNumberArg('quality', 72), 92);

  let created = 0;
  let skipped = 0;
  let missing = 0;

  for (const artifact of artifacts) {
    const sourcePath = normalizeStoryArtifactImagePath(artifact.imagePath);
    if (!sourcePath) {
      skipped += 1;
      console.log(`SKIP ${artifact.artifactCode}: remote image path`);
      continue;
    }

    const thumbnailPath = storyArtifactThumbnailPath(artifact.imagePath);
    const sourceFile = path.resolve(uploadRoot, sourcePath);
    const thumbnailFile = path.resolve(uploadRoot, thumbnailPath);

    if (!sourceFile.startsWith(uploadRoot + path.sep) || !thumbnailFile.startsWith(uploadRoot + path.sep)) {
      skipped += 1;
      console.log(`SKIP ${artifact.artifactCode}: unsafe path`);
      continue;
    }

    if (!(await fileExists(sourceFile))) {
      missing += 1;
      console.log(`MISS ${artifact.artifactCode}: ${sourcePath}`);
      continue;
    }

    if (!force && (await fileExists(thumbnailFile))) {
      skipped += 1;
      continue;
    }

    await fs.mkdir(path.dirname(thumbnailFile), { recursive: true });
    const info = await sharp(sourceFile)
      .rotate()
      .resize(size, size, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toFile(thumbnailFile);

    created += 1;
    console.log(`OK   ${artifact.artifactCode}: ${thumbnailPath} (${info.size} bytes)`);
  }

  console.log(`Done. Created: ${created}. Skipped: ${skipped}. Missing: ${missing}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection();
  });
