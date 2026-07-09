/**
 * Import pregenerated outfit catalog JSON files into outfit_plate_cache.
 *
 * Usage:
 *   pnpm --dir services/api exec tsx src/scripts/importOutfitPregenCatalog.ts --apply
 *   pnpm --dir services/api exec tsx src/scripts/importOutfitPregenCatalog.ts --dry-run
 *   pnpm --dir services/api exec tsx src/scripts/importOutfitPregenCatalog.ts --catalog ../../output/outfit-pregen-library/outfits.json --apply
 */

import './loadEnvForScripts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db, closeDatabaseConnection } from '../db';
import * as schema from '../db/schema';
import { getOutfitPlateCacheRepository } from '../repositories';
import { cosineSimilarity, generateEmbedding } from '../services/embeddingService';
import { logger } from '../utils/logger';

type CatalogSection = 'existing' | 'planned';

interface CatalogEntry {
  description?: string;
  path?: string;
  formality?: string;
  presentationGroups?: string[];
  purposeTags?: string[];
  seasonTags?: string[];
  climateTags?: string[];
  eraTags?: string[];
  settingTags?: string[];
  activityTags?: string[];
  silhouetteTags?: string[];
  footwearTags?: string[];
  componentTags?: string[];
  colorPalette?: string[];
  materials?: string[];
  patterns?: string[];
  detailTags?: string[];
  coverageTags?: string[];
}

interface CatalogRow {
  catalogFile: string;
  section: CatalogSection;
  entry: CatalogEntry;
  description: string;
  storagePath: string;
}

interface DedupeReport {
  duplicateGroups?: Array<{
    canonicalPath?: string;
    removed?: Array<{ path?: string }>;
  }>;
}

interface Args {
  apply: boolean;
  catalogs: string[];
  dedupeReport: string;
  reconcile: boolean;
  deleteUnmappedUsed: boolean;
  fallbackUnmappedUsed: boolean;
}

const apiRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(apiRoot, '../..');
const defaultCatalogs = [
  path.join(apiRoot, 'output/outfit-pregen-library/outfits.json'),
  path.join(apiRoot, 'output/outfit-pregen-library/outfits-next-330.json'),
];
const defaultDedupeReport = path.join(
  apiRoot,
  'output/outfit-pregen-library/visual-audit/deduplication-report.json',
);

function parseArgs(argv: string[]): Args {
  const catalogs: string[] = [];
  let apply = false;
  let dedupeReport = defaultDedupeReport;
  let reconcile = true;
  let deleteUnmappedUsed = false;
  let fallbackUnmappedUsed = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      apply = false;
      continue;
    }
    if (arg === '--catalog' && argv[i + 1]) {
      catalogs.push(resolvePath(argv[i + 1]));
      i += 1;
      continue;
    }
    if (arg.startsWith('--catalog=')) {
      catalogs.push(resolvePath(arg.slice('--catalog='.length)));
      continue;
    }
    if (arg === '--dedupe-report' && argv[i + 1]) {
      dedupeReport = resolvePath(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--dedupe-report=')) {
      dedupeReport = resolvePath(arg.slice('--dedupe-report='.length));
      continue;
    }
    if (arg === '--no-reconcile') {
      reconcile = false;
      continue;
    }
    if (arg === '--delete-unmapped-used') {
      deleteUnmappedUsed = true;
      continue;
    }
    if (arg === '--no-fallback-unmapped-used') {
      fallbackUnmappedUsed = false;
      continue;
    }
  }

  return {
    apply,
    catalogs: catalogs.length > 0 ? catalogs : defaultCatalogs.filter((file) => fs.existsSync(file)),
    dedupeReport,
    reconcile,
    deleteUnmappedUsed,
    fallbackUnmappedUsed,
  };
}

function resolvePath(input: string): string {
  return path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
}

function normalizeStoragePath(raw: string): string {
  let value = String(raw || '').trim().replace(/\\/g, '/');
  if (!value) return '';

  const uploadsMarker = '/services/api/uploads/';
  const uploadsIndex = value.indexOf(uploadsMarker);
  if (uploadsIndex >= 0) {
    value = value.slice(uploadsIndex + uploadsMarker.length);
  }

  for (const prefix of ['services/api/uploads/', 'uploads/']) {
    if (value.startsWith(prefix)) value = value.slice(prefix.length);
  }

  const outfitIndex = value.indexOf('outfit_plate_cache/');
  if (outfitIndex >= 0) {
    value = value.slice(outfitIndex);
  }

  return value.replace(/^\/+/, '');
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function normalizeNullableScalar(value: unknown): string | null {
  const text = String(value || '').trim().toLowerCase();
  return text || null;
}

function loadCatalogRows(catalogFiles: string[]): CatalogRow[] {
  const rows: CatalogRow[] = [];
  const seen = new Set<string>();

  for (const catalogFile of catalogFiles) {
    const data = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) as {
      existing?: CatalogEntry[];
      planned?: CatalogEntry[];
    };

    for (const section of ['existing', 'planned'] as const) {
      const entries = Array.isArray(data[section]) ? data[section]! : [];
      for (const entry of entries) {
        const description = String(entry.description || '').trim();
        const storagePath = normalizeStoragePath(String(entry.path || ''));
        if (!description || !storagePath) continue;
        if (!storagePath.startsWith('outfit_plate_cache/')) {
          throw new Error(`Unexpected outfit storage path in ${catalogFile}: ${entry.path}`);
        }
        if (seen.has(storagePath)) continue;
        seen.add(storagePath);
        rows.push({ catalogFile, section, entry, description, storagePath });
      }
    }
  }

  return rows;
}

function loadDedupeMap(reportFile: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(reportFile)) return map;

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as DedupeReport;
  for (const group of report.duplicateGroups || []) {
    const canonicalPath = normalizeStoragePath(group.canonicalPath || '');
    if (!canonicalPath) continue;
    for (const removed of group.removed || []) {
      const duplicatePath = normalizeStoragePath(removed.path || '');
      if (duplicatePath) map.set(duplicatePath, canonicalPath);
    }
  }
  return map;
}

function catalogSourceFor(row: CatalogRow): string {
  return `${path.basename(row.catalogFile)}:${row.section}`;
}

function storageUrlFor(storagePath: string): string {
  return `/api/v1/assets/${storagePath}`;
}

function absoluteLocalPathFor(storagePath: string): string {
  return path.join(apiRoot, 'uploads', storagePath);
}

async function listOutfitRows(): Promise<schema.OutfitPlateCache[]> {
  return db.select().from(schema.outfitPlateCache);
}

async function countStoryRefs(cacheId: string): Promise<number> {
  const rows = await db
    .select({ storyId: schema.storyOutfitPlateCache.storyId })
    .from(schema.storyOutfitPlateCache)
    .where(eq(schema.storyOutfitPlateCache.cacheId, cacheId));
  return rows.length;
}

async function remapStoryRefs(params: {
  fromCacheId: string;
  toCacheId: string;
  apply: boolean;
}): Promise<number> {
  if (!params.apply) return countStoryRefs(params.fromCacheId);
  const rows = await db
    .update(schema.storyOutfitPlateCache)
    .set({ cacheId: params.toCacheId })
    .where(eq(schema.storyOutfitPlateCache.cacheId, params.fromCacheId))
    .returning({ storyId: schema.storyOutfitPlateCache.storyId });
  return rows.length;
}

async function deleteOutfitRow(cacheId: string, apply: boolean): Promise<boolean> {
  if (!apply) return true;
  const rows = await db
    .delete(schema.outfitPlateCache)
    .where(eq(schema.outfitPlateCache.id, cacheId))
    .returning({ id: schema.outfitPlateCache.id });
  return rows.length > 0;
}

async function normalizeExistingDbStoragePaths(apply: boolean): Promise<{
  normalized: number;
  merged: number;
}> {
  const rows = await listOutfitRows();
  const byStoragePath = new Map(rows.map((row) => [row.storagePath, row]));
  let normalized = 0;
  let merged = 0;

  for (const row of rows) {
    const normalizedPath = normalizeStoragePath(row.storagePath);
    if (!normalizedPath || normalizedPath === row.storagePath) continue;

    const existing = byStoragePath.get(normalizedPath);
    if (existing && existing.id !== row.id) {
      merged += 1;
      await remapStoryRefs({ fromCacheId: row.id, toCacheId: existing.id, apply });
      await deleteOutfitRow(row.id, apply);
      continue;
    }

    normalized += 1;
    if (apply) {
      await db
        .update(schema.outfitPlateCache)
        .set({
          storagePath: normalizedPath,
          storageUrl: storageUrlFor(normalizedPath),
        })
        .where(eq(schema.outfitPlateCache.id, row.id));
    }
  }

  return { normalized, merged };
}

async function importCatalogRows(rows: CatalogRow[], apply: boolean): Promise<{
  imported: number;
  missingFiles: string[];
  embeddingsGenerated: number;
  embeddingsReused: number;
}> {
  const repo = getOutfitPlateCacheRepository();
  const existingRows = await listOutfitRows();
  const existingByPath = new Map(
    existingRows.map((row) => [normalizeStoragePath(row.storagePath), row]),
  );

  let imported = 0;
  let embeddingsGenerated = 0;
  let embeddingsReused = 0;
  const missingFiles: string[] = [];

  for (const row of rows) {
    if (!fs.existsSync(absoluteLocalPathFor(row.storagePath))) {
      missingFiles.push(row.storagePath);
    }

    const existing = existingByPath.get(row.storagePath);
    const canReuseEmbedding =
      existing?.catalogSource &&
      existing.outfitText.trim() === row.description &&
      Array.isArray(existing.descriptionEmbedding) &&
      existing.descriptionEmbedding.length > 0;

    const descriptionEmbedding = canReuseEmbedding
      ? (existing!.descriptionEmbedding as number[])
      : apply
        ? await generateEmbedding(row.description)
        : [];

    if (canReuseEmbedding) embeddingsReused += 1;
    else if (apply) embeddingsGenerated += 1;

    if (apply) {
      await repo.upsertByStoragePath({
        id: existing?.id || crypto.randomUUID(),
        outfitText: row.description,
        descriptionEmbedding,
        imageStyle: 'soft_3d_outfit_plate',
        ageGroup: 'universal',
        storagePath: row.storagePath,
        storageUrl: storageUrlFor(row.storagePath),
        catalogSource: catalogSourceFor(row),
        formality: normalizeNullableScalar(row.entry.formality),
        presentationGroups: normalizeList(row.entry.presentationGroups),
        purposeTags: normalizeList(row.entry.purposeTags),
        seasonTags: normalizeList(row.entry.seasonTags),
        climateTags: normalizeList(row.entry.climateTags),
        eraTags: normalizeList(row.entry.eraTags),
        settingTags: normalizeList(row.entry.settingTags),
        activityTags: normalizeList(row.entry.activityTags),
        silhouetteTags: normalizeList(row.entry.silhouetteTags),
        footwearTags: normalizeList(row.entry.footwearTags),
        componentTags: normalizeList(row.entry.componentTags),
        colorPalette: normalizeList(row.entry.colorPalette),
        materials: normalizeList(row.entry.materials),
        patterns: normalizeList(row.entry.patterns),
        detailTags: normalizeList(row.entry.detailTags),
        coverageTags: normalizeList(row.entry.coverageTags),
      });
    }

    imported += 1;
  }

  return { imported, missingFiles, embeddingsGenerated, embeddingsReused };
}

async function reconcileDbRows(params: {
  canonicalPaths: Set<string>;
  dedupeMap: Map<string, string>;
  apply: boolean;
  deleteUnmappedUsed: boolean;
  fallbackUnmappedUsed: boolean;
}): Promise<{
  remappedDuplicates: number;
  fallbackRemappedUnmapped: number;
  deletedRows: number;
  fallbackMappings: Array<{
    duplicatePath: string;
    canonicalPath: string;
    score: number;
    storyRefs: number;
  }>;
  skippedMissingCanonical: Array<{ duplicatePath: string; canonicalPath: string }>;
  skippedUsedUnmapped: Array<{ storagePath: string; cacheId: string; storyRefs: number }>;
}> {
  const rows = await listOutfitRows();
  const rowsByPath = new Map<string, schema.OutfitPlateCache>();
  for (const row of rows) {
    rowsByPath.set(normalizeStoragePath(row.storagePath), row);
  }

  let remappedDuplicates = 0;
  let fallbackRemappedUnmapped = 0;
  let deletedRows = 0;
  const fallbackMappings: Array<{
    duplicatePath: string;
    canonicalPath: string;
    score: number;
    storyRefs: number;
  }> = [];
  const skippedMissingCanonical: Array<{ duplicatePath: string; canonicalPath: string }> = [];
  const skippedUsedUnmapped: Array<{ storagePath: string; cacheId: string; storyRefs: number }> = [];
  const canonicalRows = rows.filter((row) =>
    params.canonicalPaths.has(normalizeStoragePath(row.storagePath)),
  );

  for (const row of rows) {
    const storagePath = normalizeStoragePath(row.storagePath);
    if (!storagePath.startsWith('outfit_plate_cache/')) continue;
    if (params.canonicalPaths.has(storagePath)) continue;

    const canonicalPath = params.dedupeMap.get(storagePath);
    if (canonicalPath) {
      const canonicalRow = rowsByPath.get(canonicalPath);
      if (!canonicalRow) {
        skippedMissingCanonical.push({ duplicatePath: storagePath, canonicalPath });
        continue;
      }
      const remapped = await remapStoryRefs({
        fromCacheId: row.id,
        toCacheId: canonicalRow.id,
        apply: params.apply,
      });
      remappedDuplicates += remapped;
      if (await deleteOutfitRow(row.id, params.apply)) deletedRows += 1;
      continue;
    }

    const storyRefs = await countStoryRefs(row.id);
    if (storyRefs > 0 && !params.deleteUnmappedUsed) {
      const fallback = params.fallbackUnmappedUsed
        ? findBestCanonicalFallback(row, canonicalRows)
        : null;
      if (fallback) {
        const remapped = await remapStoryRefs({
          fromCacheId: row.id,
          toCacheId: fallback.row.id,
          apply: params.apply,
        });
        fallbackRemappedUnmapped += remapped;
        fallbackMappings.push({
          duplicatePath: storagePath,
          canonicalPath: normalizeStoragePath(fallback.row.storagePath),
          score: fallback.score,
          storyRefs: remapped,
        });
        if (await deleteOutfitRow(row.id, params.apply)) deletedRows += 1;
        continue;
      }
      skippedUsedUnmapped.push({ storagePath, cacheId: row.id, storyRefs });
      continue;
    }
    if (await deleteOutfitRow(row.id, params.apply)) deletedRows += 1;
  }

  return {
    remappedDuplicates,
    fallbackRemappedUnmapped,
    deletedRows,
    fallbackMappings,
    skippedMissingCanonical,
    skippedUsedUnmapped,
  };
}

function findBestCanonicalFallback(
  row: schema.OutfitPlateCache,
  canonicalRows: schema.OutfitPlateCache[],
): { row: schema.OutfitPlateCache; score: number } | null {
  const sourceEmbedding = row.descriptionEmbedding as number[] | null;
  if (!Array.isArray(sourceEmbedding) || sourceEmbedding.length === 0) return null;

  let best: { row: schema.OutfitPlateCache; score: number } | null = null;
  for (const candidate of canonicalRows) {
    const candidateEmbedding = candidate.descriptionEmbedding as number[] | null;
    if (!Array.isArray(candidateEmbedding) || candidateEmbedding.length !== sourceEmbedding.length) {
      continue;
    }
    const score = cosineSimilarity(sourceEmbedding, candidateEmbedding);
    if (!best || score > best.score) {
      best = { row: candidate, score };
    }
  }
  return best;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  if (args.catalogs.length === 0) {
    throw new Error('No catalog JSON files found. Pass --catalog <path>.');
  }

  const catalogRows = loadCatalogRows(args.catalogs);
  const canonicalPaths = new Set(catalogRows.map((row) => row.storagePath));
  const dedupeMap = loadDedupeMap(args.dedupeReport);

  logger.info(
    {
      mode: args.apply ? 'apply' : 'dry-run',
      catalogs: args.catalogs.map((file) => path.relative(repoRoot, file)),
      catalogRows: catalogRows.length,
      dedupeMappings: dedupeMap.size,
    },
    'Importing outfit pregeneration catalog',
  );

  const normalizedPaths = await normalizeExistingDbStoragePaths(args.apply);
  const imported = await importCatalogRows(catalogRows, args.apply);
  const reconciled = args.reconcile
    ? await reconcileDbRows({
        canonicalPaths,
        dedupeMap,
        apply: args.apply,
        deleteUnmappedUsed: args.deleteUnmappedUsed,
        fallbackUnmappedUsed: args.fallbackUnmappedUsed,
      })
    : null;

  const summary = {
    mode: args.apply ? 'apply' : 'dry-run',
    catalogRows: catalogRows.length,
    uniqueCanonicalPaths: canonicalPaths.size,
    normalizedPaths,
    imported,
    reconciled,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  if (imported.missingFiles.length > 0) {
    logger.warn({ missingFiles: imported.missingFiles }, 'Some catalog asset files are missing');
  }
  if (reconciled?.skippedUsedUnmapped.length) {
    logger.warn(
      { skippedUsedUnmapped: reconciled.skippedUsedUnmapped },
      'Some non-catalog outfit rows are still referenced and were not deleted',
    );
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'Outfit pregeneration catalog import failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
