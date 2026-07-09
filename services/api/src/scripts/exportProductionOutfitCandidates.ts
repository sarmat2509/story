/**
 * Export production-only outfit plate cache rows for visual review.
 *
 * This script is intentionally read-only: it does not update DB rows, remap
 * story references, or delete files. It compares production DB/file inventory
 * against canonical pregenerated catalog JSON files and copies review images
 * into an export directory.
 *
 * Usage from the API container:
 *   npx tsx src/scripts/exportProductionOutfitCandidates.ts \
 *     --catalog /tmp/outfit-catalogs/outfits.json \
 *     --catalog /tmp/outfit-catalogs/outfits-next-330.json \
 *     --dedupe-report /tmp/outfit-catalogs/deduplication-report.json \
 *     --out-dir /tmp/wt-outfit-candidates/results \
 *     --uploads-dir /app/services/api/uploads \
 *     --include-file-only \
 *     --max-images 500
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

type JsonRecord = Record<string, unknown>;

interface Args {
  catalogs: string[];
  dedupeReport: string | null;
  outDir: string;
  uploadsDir: string;
  includeFileOnly: boolean;
  maxImages: number;
}

interface CatalogEntry {
  description?: unknown;
  path?: unknown;
}

interface CatalogRow {
  catalogFile: string;
  section: 'existing' | 'planned';
  description: string;
  storagePath: string;
}

interface DedupeReport {
  duplicateGroups?: Array<{
    canonicalPath?: unknown;
    removed?: Array<{ path?: unknown }>;
  }>;
}

interface DbRow extends JsonRecord {
  id: string;
  outfit_text: string;
  storage_path: string;
  storage_url: string | null;
  catalog_source: string | null;
  created_at: string | Date | null;
  story_refs: number | string;
  sample_story_ids: string[] | null;
}

interface ImageFileInfo {
  storagePath: string;
  absolutePath: string;
  sizeBytes: number;
  modifiedAt: string;
  sha256: string;
}

interface ReviewCandidate {
  source: 'db' | 'file_only';
  priority: number;
  reason: string;
  storagePath: string;
  cacheId?: string;
  outfitText?: string;
  catalogSource?: string | null;
  createdAt?: string | null;
  storyRefs: number;
  sampleStoryIds?: string[];
  sizeBytes?: number;
  modifiedAt?: string;
  sha256?: string;
  dedupeCanonicalPath?: string | null;
  exactDuplicateCanonicalPath?: string | null;
  textDuplicateCanonicalPaths?: string[];
  exportedImageRelativePath?: string;
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const DEFAULT_OUT_DIR = '/tmp/wt-outfit-candidate-export/results';
const DEFAULT_UPLOADS_DIR = '/app/services/api/uploads';

function parseArgs(argv: string[]): Args {
  const catalogs: string[] = [];
  let dedupeReport: string | null = null;
  let outDir = DEFAULT_OUT_DIR;
  let uploadsDir = DEFAULT_UPLOADS_DIR;
  let includeFileOnly = false;
  let maxImages = 500;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--catalog' && argv[i + 1]) {
      catalogs.push(path.resolve(argv[i + 1]));
      i += 1;
      continue;
    }
    if (arg.startsWith('--catalog=')) {
      catalogs.push(path.resolve(arg.slice('--catalog='.length)));
      continue;
    }
    if (arg === '--dedupe-report' && argv[i + 1]) {
      dedupeReport = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--dedupe-report=')) {
      dedupeReport = path.resolve(arg.slice('--dedupe-report='.length));
      continue;
    }
    if (arg === '--out-dir' && argv[i + 1]) {
      outDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--out-dir=')) {
      outDir = path.resolve(arg.slice('--out-dir='.length));
      continue;
    }
    if (arg === '--uploads-dir' && argv[i + 1]) {
      uploadsDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--uploads-dir=')) {
      uploadsDir = path.resolve(arg.slice('--uploads-dir='.length));
      continue;
    }
    if (arg === '--include-file-only') {
      includeFileOnly = true;
      continue;
    }
    if (arg === '--no-file-only') {
      includeFileOnly = false;
      continue;
    }
    if (arg === '--max-images' && argv[i + 1]) {
      maxImages = parseNonNegativeInt(argv[i + 1], '--max-images');
      i += 1;
      continue;
    }
    if (arg.startsWith('--max-images=')) {
      maxImages = parseNonNegativeInt(arg.slice('--max-images='.length), '--max-images');
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    catalogs,
    dedupeReport,
    outDir,
    uploadsDir,
    includeFileOnly,
    maxImages,
  };
}

function parseNonNegativeInt(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a non-negative integer`);
  }
  return parsed;
}

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.log(`Usage:
  npx tsx src/scripts/exportProductionOutfitCandidates.ts \\
    --catalog <outfits.json> [--catalog <outfits-next-330.json>] \\
    [--dedupe-report <deduplication-report.json>] \\
    [--out-dir /tmp/wt-outfit-candidates/results] \\
    [--uploads-dir /app/services/api/uploads] \\
    [--include-file-only] [--max-images 500]`);
}

function normalizeStoragePath(raw: unknown): string {
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

  value = value.replace(/^\/+/, '');
  if (value.includes('..')) return '';
  return value;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?'"()[\]{}]/g, '')
    .trim();
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
        const storagePath = normalizeStoragePath(entry.path);
        const description = String(entry.description || '').trim();
        if (!storagePath || !description) continue;
        if (!storagePath.startsWith('outfit_plate_cache/')) continue;
        if (seen.has(storagePath)) continue;
        seen.add(storagePath);
        rows.push({ catalogFile, section, description, storagePath });
      }
    }
  }

  return rows;
}

function loadDedupeMap(reportFile: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!reportFile || !fs.existsSync(reportFile)) return map;

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as DedupeReport;
  for (const group of report.duplicateGroups || []) {
    const canonicalPath = normalizeStoragePath(group.canonicalPath);
    if (!canonicalPath) continue;
    for (const removed of group.removed || []) {
      const duplicatePath = normalizeStoragePath(removed.path);
      if (duplicatePath) map.set(duplicatePath, canonicalPath);
    }
  }

  return map;
}

async function listDbRows(client: Client): Promise<DbRow[]> {
  const result = await client.query<DbRow>(`
    select
      opc.*,
      coalesce(refs.story_refs, 0)::int as story_refs,
      coalesce(refs.sample_story_ids, '{}'::text[]) as sample_story_ids
    from outfit_plate_cache opc
    left join (
      select
        cache_id,
        count(*)::int as story_refs,
        array_agg(distinct story_id::text) as sample_story_ids
      from story_outfit_plate_cache
      group by cache_id
    ) refs on refs.cache_id = opc.id
    order by coalesce(refs.story_refs, 0) desc, opc.created_at desc
  `);
  return result.rows;
}

function listImageFiles(uploadsDir: string): ImageFileInfo[] {
  const outfitDir = path.join(uploadsDir, 'outfit_plate_cache');
  if (!fs.existsSync(outfitDir)) return [];

  const files: ImageFileInfo[] = [];
  for (const entry of fs.readdirSync(outfitDir)) {
    if (entry.startsWith('._') || entry.includes('.source.')) continue;
    const ext = path.extname(entry).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const absolutePath = path.join(outfitDir, entry);
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) continue;

    files.push({
      storagePath: `outfit_plate_cache/${entry}`,
      absolutePath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      sha256: sha256File(absolutePath),
    });
  }

  return files.sort((a, b) => a.storagePath.localeCompare(b.storagePath));
}

function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function imageInfoForRow(row: DbRow, fileMap: Map<string, ImageFileInfo>): ImageFileInfo | null {
  const storagePath = normalizeStoragePath(row.storage_path);
  return fileMap.get(storagePath) || null;
}

function findExactCanonicalDuplicate(
  info: ImageFileInfo | null,
  canonicalPaths: Set<string>,
  pathsByHash: Map<string, string[]>,
): string | null {
  if (!info) return null;
  const paths = pathsByHash.get(info.sha256) || [];
  return paths.find((candidate) => candidate !== info.storagePath && canonicalPaths.has(candidate)) || null;
}

function buildPathsByHash(files: ImageFileInfo[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of files) {
    const current = map.get(file.sha256) || [];
    current.push(file.storagePath);
    map.set(file.sha256, current);
  }
  return map;
}

function storyRefs(row: DbRow): number {
  const value = Number(row.story_refs || 0);
  return Number.isFinite(value) ? value : 0;
}

function sampleStoryIds(row: DbRow): string[] {
  return Array.isArray(row.sample_story_ids) ? row.sample_story_ids.slice(0, 10) : [];
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function makeReviewCandidates(params: {
  rows: DbRow[];
  fileOnly: ImageFileInfo[];
  fileMap: Map<string, ImageFileInfo>;
  canonicalPaths: Set<string>;
  dedupeMap: Map<string, string>;
  canonicalTextPaths: Map<string, string[]>;
  pathsByHash: Map<string, string[]>;
  includeFileOnly: boolean;
}): {
  reviewCandidates: ReviewCandidate[];
  dedupeMappedRows: ReviewCandidate[];
  missingFileRows: ReviewCandidate[];
  exactDuplicateRows: ReviewCandidate[];
  textDuplicateRows: ReviewCandidate[];
} {
  const reviewCandidates: ReviewCandidate[] = [];
  const dedupeMappedRows: ReviewCandidate[] = [];
  const missingFileRows: ReviewCandidate[] = [];
  const exactDuplicateRows: ReviewCandidate[] = [];
  const textDuplicateRows: ReviewCandidate[] = [];

  for (const row of params.rows) {
    const storagePath = normalizeStoragePath(row.storage_path);
    if (!storagePath.startsWith('outfit_plate_cache/')) continue;
    if (params.canonicalPaths.has(storagePath)) continue;

    const imageInfo = imageInfoForRow(row, params.fileMap);
    const dedupeCanonicalPath = params.dedupeMap.get(storagePath) || null;
    const exactDuplicateCanonicalPath = findExactCanonicalDuplicate(
      imageInfo,
      params.canonicalPaths,
      params.pathsByHash,
    );
    const textDuplicateCanonicalPaths =
      params.canonicalTextPaths.get(normalizeText(row.outfit_text)) || [];

    const candidate: ReviewCandidate = {
      source: 'db',
      priority: priorityFor({
        hasFile: !!imageInfo,
        storyRefs: storyRefs(row),
        dedupeCanonicalPath,
        exactDuplicateCanonicalPath,
        textDuplicateCanonicalPaths,
      }),
      reason: reasonFor({
        hasFile: !!imageInfo,
        storyRefs: storyRefs(row),
        dedupeCanonicalPath,
        exactDuplicateCanonicalPath,
        textDuplicateCanonicalPaths,
      }),
      storagePath,
      cacheId: row.id,
      outfitText: String(row.outfit_text || ''),
      catalogSource: row.catalog_source || null,
      createdAt: isoDate(row.created_at),
      storyRefs: storyRefs(row),
      sampleStoryIds: sampleStoryIds(row),
      sizeBytes: imageInfo?.sizeBytes,
      modifiedAt: imageInfo?.modifiedAt,
      sha256: imageInfo?.sha256,
      dedupeCanonicalPath,
      exactDuplicateCanonicalPath,
      textDuplicateCanonicalPaths,
    };

    if (!imageInfo) {
      missingFileRows.push(candidate);
      continue;
    }
    if (dedupeCanonicalPath) {
      dedupeMappedRows.push(candidate);
      continue;
    }
    if (exactDuplicateCanonicalPath) {
      exactDuplicateRows.push(candidate);
      continue;
    }
    if (textDuplicateCanonicalPaths.length > 0) {
      textDuplicateRows.push(candidate);
    }
    reviewCandidates.push(candidate);
  }

  if (params.includeFileOnly) {
    for (const file of params.fileOnly) {
      reviewCandidates.push({
        source: 'file_only',
        priority: 1,
        reason: 'file exists in production cache but has no DB row and is not canonical',
        storagePath: file.storagePath,
        storyRefs: 0,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        sha256: file.sha256,
      });
    }
  }

  reviewCandidates.sort(sortCandidates);
  dedupeMappedRows.sort(sortCandidates);
  missingFileRows.sort(sortCandidates);
  exactDuplicateRows.sort(sortCandidates);
  textDuplicateRows.sort(sortCandidates);

  return {
    reviewCandidates,
    dedupeMappedRows,
    missingFileRows,
    exactDuplicateRows,
    textDuplicateRows,
  };
}

function priorityFor(params: {
  hasFile: boolean;
  storyRefs: number;
  dedupeCanonicalPath: string | null;
  exactDuplicateCanonicalPath: string | null;
  textDuplicateCanonicalPaths: string[];
}): number {
  if (!params.hasFile) return 0;
  if (params.dedupeCanonicalPath || params.exactDuplicateCanonicalPath) return 0;
  if (params.storyRefs > 0 && params.textDuplicateCanonicalPaths.length === 0) return 4;
  if (params.storyRefs > 0) return 3;
  if (params.textDuplicateCanonicalPaths.length === 0) return 2;
  return 1;
}

function reasonFor(params: {
  hasFile: boolean;
  storyRefs: number;
  dedupeCanonicalPath: string | null;
  exactDuplicateCanonicalPath: string | null;
  textDuplicateCanonicalPaths: string[];
}): string {
  if (!params.hasFile) return 'DB row points to a missing outfit image file';
  if (params.dedupeCanonicalPath) return 'known visual duplicate from local dedupe report';
  if (params.exactDuplicateCanonicalPath) return 'exact file hash duplicate of a canonical image';
  if (params.storyRefs > 0 && params.textDuplicateCanonicalPaths.length === 0) {
    return 'production-only DB row used by stories; no canonical text duplicate';
  }
  if (params.storyRefs > 0) {
    return 'production-only DB row used by stories; text matches canonical description';
  }
  if (params.textDuplicateCanonicalPaths.length === 0) return 'production-only unused DB row';
  return 'production-only unused DB row; text matches canonical description';
}

function sortCandidates(a: ReviewCandidate, b: ReviewCandidate): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (b.storyRefs !== a.storyRefs) return b.storyRefs - a.storyRefs;
  const aDate = Date.parse(a.createdAt || a.modifiedAt || '1970-01-01T00:00:00.000Z');
  const bDate = Date.parse(b.createdAt || b.modifiedAt || '1970-01-01T00:00:00.000Z');
  return bDate - aDate || a.storagePath.localeCompare(b.storagePath);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '').slice(0, 160);
}

function copyReviewImages(params: {
  candidates: ReviewCandidate[];
  outDir: string;
  uploadsDir: string;
  maxImages: number;
}): number {
  if (params.maxImages <= 0) return 0;

  const imageDir = path.join(params.outDir, 'images');
  fs.mkdirSync(imageDir, { recursive: true });

  let copied = 0;
  for (const candidate of params.candidates) {
    if (copied >= params.maxImages) break;
    const source = path.join(params.uploadsDir, normalizeStoragePath(candidate.storagePath));
    if (!fs.existsSync(source)) continue;

    copied += 1;
    const ext = path.extname(source) || '.jpg';
    const basename = sanitizeFileName(path.basename(candidate.storagePath, ext));
    const targetRel = path.join(
      'images',
      `${String(copied).padStart(4, '0')}_${candidate.source}_p${candidate.priority}_${basename}${ext}`,
    );
    fs.copyFileSync(source, path.join(params.outDir, targetRel));
    candidate.exportedImageRelativePath = targetRel;
  }

  return copied;
}

function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function writeCsv(file: string, rows: ReviewCandidate[]): void {
  const headers = [
    'source',
    'priority',
    'reason',
    'storagePath',
    'cacheId',
    'storyRefs',
    'catalogSource',
    'createdAt',
    'modifiedAt',
    'exportedImageRelativePath',
    'dedupeCanonicalPath',
    'exactDuplicateCanonicalPath',
    'textDuplicateCanonicalPaths',
    'outfitText',
  ];
  const lines = [headers.join(',')];

  for (const row of rows) {
    lines.push(
      headers
        .map((key) => {
          const value = (row as JsonRecord)[key];
          if (Array.isArray(value)) return csvCell(value.join('|'));
          return csvCell(value);
        })
        .join(','),
    );
  }

  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function ensureCleanOutDir(outDir: string): void {
  if (!outDir || outDir === '/' || outDir.length < 8) {
    throw new Error(`Refusing to clean suspicious output directory: ${outDir}`);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (args.catalogs.length === 0) throw new Error('At least one --catalog file is required');

  ensureCleanOutDir(args.outDir);

  const catalogRows = loadCatalogRows(args.catalogs);
  const canonicalPaths = new Set(catalogRows.map((row) => row.storagePath));
  const canonicalTextPaths = new Map<string, string[]>();
  for (const row of catalogRows) {
    const key = normalizeText(row.description);
    if (!key) continue;
    canonicalTextPaths.set(key, [...(canonicalTextPaths.get(key) || []), row.storagePath]);
  }

  const dedupeMap = loadDedupeMap(args.dedupeReport);
  const imageFiles = listImageFiles(args.uploadsDir);
  const fileMap = new Map(imageFiles.map((file) => [file.storagePath, file]));
  const pathsByHash = buildPathsByHash(imageFiles);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const rows = await listDbRows(client);
    const dbPaths = new Set(rows.map((row) => normalizeStoragePath(row.storage_path)).filter(Boolean));
    const fileOnly = imageFiles.filter(
      (file) => !dbPaths.has(file.storagePath) && !canonicalPaths.has(file.storagePath),
    );
    const canonicalRows = rows.filter((row) => canonicalPaths.has(normalizeStoragePath(row.storage_path)));
    const productionOnlyRows = rows.filter((row) => {
      const storagePath = normalizeStoragePath(row.storage_path);
      return storagePath.startsWith('outfit_plate_cache/') && !canonicalPaths.has(storagePath);
    });

    const candidates = makeReviewCandidates({
      rows,
      fileOnly,
      fileMap,
      canonicalPaths,
      dedupeMap,
      canonicalTextPaths,
      pathsByHash,
      includeFileOnly: args.includeFileOnly,
    });
    const exportedImages = copyReviewImages({
      candidates: candidates.reviewCandidates,
      outDir: args.outDir,
      uploadsDir: args.uploadsDir,
      maxImages: args.maxImages,
    });

    const exactDuplicateGroups = Array.from(pathsByHash.entries())
      .filter(([, paths]) => paths.length > 1)
      .map(([sha256, paths]) => ({
        sha256,
        paths,
        canonicalPaths: paths.filter((storagePath) => canonicalPaths.has(storagePath)),
      }));

    const summary = {
      generatedAt: new Date().toISOString(),
      mode: 'read-only',
      catalogs: args.catalogs,
      dedupeReport: args.dedupeReport,
      uploadsDir: args.uploadsDir,
      canonical: {
        rows: catalogRows.length,
        uniquePaths: canonicalPaths.size,
        dedupeMappings: dedupeMap.size,
      },
      db: {
        totalRows: rows.length,
        canonicalRows: canonicalRows.length,
        productionOnlyRows: productionOnlyRows.length,
        productionOnlyRowsUsedByStories: productionOnlyRows.filter((row) => storyRefs(row) > 0).length,
      },
      files: {
        totalImageFiles: imageFiles.length,
        fileOnlyImages: fileOnly.length,
        exactDuplicateGroups: exactDuplicateGroups.length,
      },
      review: {
        candidates: candidates.reviewCandidates.length,
        candidatesUsedByStories: candidates.reviewCandidates.filter((row) => row.storyRefs > 0).length,
        dedupeMappedRows: candidates.dedupeMappedRows.length,
        exactDuplicateRows: candidates.exactDuplicateRows.length,
        textDuplicateRows: candidates.textDuplicateRows.length,
        missingFileRows: candidates.missingFileRows.length,
        exportedImages,
        maxImages: args.maxImages,
      },
    };

    writeJson(path.join(args.outDir, 'summary.json'), summary);
    writeJson(path.join(args.outDir, 'review-candidates.json'), candidates.reviewCandidates);
    writeJson(path.join(args.outDir, 'dedupe-mapped-rows.json'), candidates.dedupeMappedRows);
    writeJson(path.join(args.outDir, 'exact-duplicate-rows.json'), candidates.exactDuplicateRows);
    writeJson(path.join(args.outDir, 'text-duplicate-rows.json'), candidates.textDuplicateRows);
    writeJson(path.join(args.outDir, 'missing-file-rows.json'), candidates.missingFileRows);
    writeJson(path.join(args.outDir, 'exact-duplicate-groups.json'), exactDuplicateGroups);
    writeCsv(path.join(args.outDir, 'review-candidates.csv'), candidates.reviewCandidates);
    writeCsv(path.join(args.outDir, 'dedupe-mapped-rows.csv'), candidates.dedupeMappedRows);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
