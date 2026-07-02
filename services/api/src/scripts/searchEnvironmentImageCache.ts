/**
 * Search reusable environment images by semantic similarity.
 *
 * Usage:
 *   pnpm --dir services/api exec tsx src/scripts/searchEnvironmentImageCache.ts "A moonlit garden with glass flowers"
 *   pnpm --dir services/api exec tsx src/scripts/searchEnvironmentImageCache.ts --threshold 0.88 --limit 10 "A cozy spaceship kitchen"
 */

import './loadEnvForScripts';
import { desc } from 'drizzle-orm';
import { db, closeDatabaseConnection } from '../db';
import { environmentImageCache } from '../db/schema';
import {
  ENVIRONMENT_REFERENCE_CACHE_PREFIX,
  buildEnvironmentImageCacheDescription,
} from '../prompts/image';
import { cosineSimilarity, generateEmbedding } from '../services/embeddingService';
import { config } from '../config';

interface Args {
  description: string;
  threshold: number;
  limit: number;
  includeLegacy: boolean;
  raw: boolean;
}

function printHelp(): void {
  console.log(`
Search environment_image_cache by embedding similarity.

Usage:
  pnpm --dir services/api exec tsx src/scripts/searchEnvironmentImageCache.ts [options] "<description>"

Options:
  --threshold <number>   Similarity threshold for HIT/MISS. Default: config value.
  --limit <number>       Number of rows to print. Default: 10.
  --include-legacy       Include old cache rows without the current environment prefix.
  --raw                  Embed the description as-is, without environment cache normalization.
  --help                 Show this help.

Examples:
  pnpm --dir services/api exec tsx src/scripts/searchEnvironmentImageCache.ts "A moonlit garden with glass flowers and a stone fountain"
  pnpm --dir services/api exec tsx src/scripts/searchEnvironmentImageCache.ts --threshold 0.9 --limit 20 "A cozy spaceship kitchen"
`.trim());
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): Args | null {
  if (argv.includes('--help') || argv.includes('-h')) return null;

  const positional: string[] = [];
  let threshold = config.image.environmentEmbeddingSimilarityThreshold;
  let limit = 10;
  let includeLegacy = false;
  let raw = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--threshold') {
      threshold = Number(readValue(argv, i, arg));
      i++;
      continue;
    }
    if (arg === '--limit') {
      limit = Number(readValue(argv, i, arg));
      i++;
      continue;
    }
    if (arg === '--include-legacy') {
      includeLegacy = true;
      continue;
    }
    if (arg === '--raw') {
      raw = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }

  const description = positional.join(' ').trim();
  if (!description) {
    throw new Error('Description is required. Pass it as a quoted positional argument.');
  }
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) {
    throw new Error('--threshold must be a number between -1 and 1');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('--limit must be a positive integer');
  }

  return { description, threshold, limit, includeLegacy, raw };
}

function compactText(value: string, maxLength = 180): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    printHelp();
    return;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Run inside the API container or export DATABASE_URL.');
  }

  const queryText = args.raw
    ? args.description
    : buildEnvironmentImageCacheDescription(args.description);
  const queryEmbedding = await generateEmbedding(queryText);

  const rows = await db
    .select()
    .from(environmentImageCache)
    .orderBy(desc(environmentImageCache.createdAt));

  const scored = rows
    .filter((row) => args.includeLegacy || row.description.startsWith(ENVIRONMENT_REFERENCE_CACHE_PREFIX))
    .map((row) => ({
      row,
      score: cosineSimilarity(queryEmbedding, row.descriptionEmbedding),
    }))
    .sort((a, b) => b.score - a.score);

  const hits = scored.filter((item) => item.score >= args.threshold);
  const top = scored.slice(0, args.limit);

  console.log('\nEnvironment image cache similarity search');
  console.log('='.repeat(80));
  console.log('Query:', compactText(args.description));
  console.log('Embedded text:', compactText(queryText));
  console.log('Threshold:', args.threshold);
  console.log('Limit:', args.limit);
  console.log('Total cache rows:', rows.length);
  console.log('Eligible rows:', scored.length);
  console.log('Hits above threshold:', hits.length);

  if (top.length === 0) {
    console.log('\nNo eligible environment cache rows found.');
    return;
  }

  console.log('\nTop matches:');
  for (const [index, item] of top.entries()) {
    const { row, score } = item;
    const label = score >= args.threshold ? 'HIT' : 'MISS';
    console.log('\n' + `${index + 1}. ${label} score=${score.toFixed(4)}`);
    console.log('   id:', row.id);
    console.log('   storagePath:', row.storagePath);
    if (row.storageUrl) console.log('   storageUrl:', row.storageUrl);
    console.log('   createdAt:', row.createdAt.toISOString());
    console.log('   description:', compactText(row.description));
  }
}

main()
  .catch((error) => {
    console.error('Environment cache search failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnection().catch(() => undefined);
  });
