/**
 * Analyze IMAGE_OTHER vs STOP token counts from app.log
 *
 * Parses Gemini API response logs to compare token usage between successful
 * (STOP) and failed (IMAGE_OTHER) image generation requests.
 *
 * Run: npx tsx src/scripts/analyzeImageOtherTokens.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface ResponseEntry {
  time: number;
  date: string;
  finishReason: string;
  promptTokenCount: number;
  textTokens: number;
  imageTokens: number;
  operationType: string;
  hasContent: boolean;
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').substring(0, 19);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  const logPath = path.resolve(__dirname, '../../logs/app.log');
  if (!fs.existsSync(logPath)) {
    console.error(`Log file not found: ${logPath}`);
    process.exit(1);
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  IMAGE_OTHER Token Analysis                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Parsing: ${logPath}`);

  const entries: ResponseEntry[] = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(logPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    // Only parse Gemini API response lines with usage metadata
    if (!line.includes('candidatesSummary') || !line.includes('usageMetadata')) continue;

    try {
      const obj = JSON.parse(line);
      if (!obj.usageMetadata || !obj.candidatesSummary?.[0]) continue;

      const candidate = obj.candidatesSummary[0];
      const finishReason = candidate.finishReason || 'UNKNOWN';

      // Only interested in image generation (STOP or IMAGE_OTHER)
      if (finishReason !== 'STOP' && finishReason !== 'IMAGE_OTHER') continue;

      const usage = obj.usageMetadata;
      const textTokens = usage.promptTokensDetails?.find((d: any) => d.modality === 'TEXT')?.tokenCount || 0;
      const imageTokens = usage.promptTokensDetails?.find((d: any) => d.modality === 'IMAGE')?.tokenCount || 0;

      entries.push({
        time: obj.time,
        date: formatDate(obj.time),
        finishReason,
        promptTokenCount: usage.promptTokenCount || 0,
        textTokens,
        imageTokens,
        operationType: obj.operationType || 'unknown',
        hasContent: candidate.hasContent || false,
      });
    } catch {
      // Skip malformed lines
    }
  }

  console.log(`Found ${entries.length} Gemini API image responses\n`);

  // ─── Split by outcome ────────────────────────────────────────────────────

  const stop = entries.filter(e => e.finishReason === 'STOP');
  const imageOther = entries.filter(e => e.finishReason === 'IMAGE_OTHER');

  // ─── Split by time period ────────────────────────────────────────────────

  // Feb 13-15 vs Feb 16
  const cutoff = new Date('2026-02-16T00:00:00').getTime();
  const earlyStop = stop.filter(e => e.time < cutoff);
  const earlyOther = imageOther.filter(e => e.time < cutoff);
  const lateStop = stop.filter(e => e.time >= cutoff);
  const lateOther = imageOther.filter(e => e.time >= cutoff);

  // ─── Stats helper ────────────────────────────────────────────────────────

  function printStats(label: string, items: ResponseEntry[]) {
    if (items.length === 0) {
      console.log(`  ${label}: (no data)`);
      return;
    }
    const pt = items.map(e => e.promptTokenCount);
    const tt = items.map(e => e.textTokens);
    const it = items.map(e => e.imageTokens);

    console.log(`  ${label} (n=${items.length}):`);
    console.log(`    promptTokens  — mean: ${mean(pt).toFixed(0)}, median: ${median(pt)}, p95: ${percentile(pt, 95)}, min: ${Math.min(...pt)}, max: ${Math.max(...pt)}`);
    console.log(`    textTokens    — mean: ${mean(tt).toFixed(0)}, median: ${median(tt)}, p95: ${percentile(tt, 95)}, min: ${Math.min(...tt)}, max: ${Math.max(...tt)}`);
    console.log(`    imageTokens   — mean: ${mean(it).toFixed(0)}, median: ${median(it)}, p95: ${percentile(it, 95)}, min: ${Math.min(...it)}, max: ${Math.max(...it)}`);
  }

  // ─── Overall statistics ──────────────────────────────────────────────────

  console.log('── Overall Token Statistics ──');
  console.log('');
  printStats('STOP (success)', stop);
  console.log('');
  printStats('IMAGE_OTHER (failure)', imageOther);

  console.log('');
  console.log('── By Time Period ──');
  console.log('');
  console.log('  Feb 13-15 (before spike):');
  printStats('    STOP', earlyStop);
  printStats('    IMAGE_OTHER', earlyOther);
  console.log(`    Failure rate: ${earlyOther.length}/${earlyStop.length + earlyOther.length} = ${((earlyOther.length / (earlyStop.length + earlyOther.length || 1)) * 100).toFixed(1)}%`);

  console.log('');
  console.log('  Feb 16 (after spike):');
  printStats('    STOP', lateStop);
  printStats('    IMAGE_OTHER', lateOther);
  console.log(`    Failure rate: ${lateOther.length}/${lateStop.length + lateOther.length} = ${((lateOther.length / (lateStop.length + lateOther.length || 1)) * 100).toFixed(1)}%`);

  // ─── Token threshold analysis ────────────────────────────────────────────

  console.log('');
  console.log('── Token Threshold Analysis ──');
  console.log('');

  const allTokenCounts = entries.map(e => e.promptTokenCount);
  const uniqueTokenBuckets = [500, 1000, 1500, 2000, 2500, 3000];

  console.log('  promptTokens bucket | STOP | IMAGE_OTHER | Failure Rate');
  console.log('  --------------------|------|-------------|-------------');

  for (let i = 0; i < uniqueTokenBuckets.length; i++) {
    const lo = i === 0 ? 0 : uniqueTokenBuckets[i - 1];
    const hi = uniqueTokenBuckets[i];
    const inBucket = entries.filter(e => e.promptTokenCount > lo && e.promptTokenCount <= hi);
    const s = inBucket.filter(e => e.finishReason === 'STOP').length;
    const f = inBucket.filter(e => e.finishReason === 'IMAGE_OTHER').length;
    const rate = s + f > 0 ? ((f / (s + f)) * 100).toFixed(1) : 'n/a';
    console.log(`  ${String(lo).padStart(5)}-${String(hi).padStart(5)}        | ${String(s).padStart(4)} | ${String(f).padStart(11)} | ${rate}%`);
  }

  // Above max bucket
  const maxBucket = uniqueTokenBuckets[uniqueTokenBuckets.length - 1];
  const above = entries.filter(e => e.promptTokenCount > maxBucket);
  const sAbove = above.filter(e => e.finishReason === 'STOP').length;
  const fAbove = above.filter(e => e.finishReason === 'IMAGE_OTHER').length;
  const rateAbove = sAbove + fAbove > 0 ? ((fAbove / (sAbove + fAbove)) * 100).toFixed(1) : 'n/a';
  console.log(`  ${String(maxBucket).padStart(5)}+           | ${String(sAbove).padStart(4)} | ${String(fAbove).padStart(11)} | ${rateAbove}%`);

  // ─── Image token analysis ────────────────────────────────────────────────

  console.log('');
  console.log('── Image Token Buckets ──');
  console.log('');

  const imgBuckets = [0, 258, 516, 774, 1032, 1290, 2000];
  console.log('  imageTokens bucket  | STOP | IMAGE_OTHER | Failure Rate');
  console.log('  --------------------|------|-------------|-------------');

  for (let i = 0; i < imgBuckets.length; i++) {
    const lo = i === 0 ? 0 : imgBuckets[i - 1] + 1;
    const hi = imgBuckets[i];
    if (lo > hi) continue;
    const inBucket = entries.filter(e => e.imageTokens >= lo && e.imageTokens <= hi);
    const s = inBucket.filter(e => e.finishReason === 'STOP').length;
    const f = inBucket.filter(e => e.finishReason === 'IMAGE_OTHER').length;
    const rate = s + f > 0 ? ((f / (s + f)) * 100).toFixed(1) : 'n/a';
    console.log(`  ${String(lo).padStart(5)}-${String(hi).padStart(5)}        | ${String(s).padStart(4)} | ${String(f).padStart(11)} | ${rate}%`);
  }

  // ─── Temporal clustering ─────────────────────────────────────────────────

  console.log('');
  console.log('── Temporal Clustering ──');
  console.log('  (consecutive IMAGE_OTHER streaks)');
  console.log('');

  let currentStreak = 0;
  let maxStreak = 0;
  const streaks: number[] = [];

  for (const e of entries) {
    if (e.finishReason === 'IMAGE_OTHER') {
      currentStreak++;
    } else {
      if (currentStreak > 0) streaks.push(currentStreak);
      currentStreak = 0;
    }
  }
  if (currentStreak > 0) streaks.push(currentStreak);
  maxStreak = streaks.length > 0 ? Math.max(...streaks) : 0;

  console.log(`  Total streaks: ${streaks.length}`);
  console.log(`  Longest streak: ${maxStreak} consecutive IMAGE_OTHER`);
  console.log(`  Streak distribution: ${streaks.sort((a, b) => b - a).join(', ')}`);

  // ─── Operation type analysis ─────────────────────────────────────────────

  console.log('');
  console.log('── By Operation Type ──');
  console.log('');

  const opTypes = [...new Set(entries.map(e => e.operationType))];
  for (const op of opTypes) {
    const opEntries = entries.filter(e => e.operationType === op);
    const s = opEntries.filter(e => e.finishReason === 'STOP').length;
    const f = opEntries.filter(e => e.finishReason === 'IMAGE_OTHER').length;
    const rate = s + f > 0 ? ((f / (s + f)) * 100).toFixed(1) : 'n/a';
    console.log(`  ${op}: STOP=${s}, IMAGE_OTHER=${f}, failure rate=${rate}%`);
  }

  console.log('');
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
