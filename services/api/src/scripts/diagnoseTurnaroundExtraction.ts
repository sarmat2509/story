/**
 * Diagnostic script: run turnaround front extraction step-by-step with verbose logging.
 * Optionally saves intermediate images for inspection.
 *
 * Usage:
 *   pnpm api:script npx tsx src/scripts/diagnoseTurnaroundExtraction.ts <storagePath>
 *   pnpm api:script npx tsx src/scripts/diagnoseTurnaroundExtraction.ts <storagePath> --save
 *
 * Example:
 *   pnpm api:script npx tsx src/scripts/diagnoseTurnaroundExtraction.ts uploads/development/23a825d6-d750-4297-bf17-5e2452d112aa/photos/character_turnaround/1773225711847.png --save
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

// Copy constants and logic from turnaroundFrontExtractor (inline for script independence)
const WHITE_THRESHOLD = 245;
const CONTENT_THRESHOLD = 0.02;
const LEFT_TRIM_WHITE_THRESHOLD = 248;
const GAP_SCAN_HEIGHT_RATIO = 0.75;
const GAP_WHITE_RATIO_PURE = 1;
const GAP_WHITE_RATIO_SOFT = 0.92;
const PURE_SOFT_MAX_DISTANCE = 110;
const ROW_CONTENT_THRESHOLD = 0.02;

function isNonWhite(r: number, g: number, b: number, threshold: number): boolean {
  return r < threshold || g < threshold || b < threshold;
}

function findLeftEdgePure(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): number {
  const contentMin = height * CONTENT_THRESHOLD;
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      if (isNonWhite(data[i], data[i + 1], data[i + 2], LEFT_TRIM_WHITE_THRESHOLD)) count++;
    }
    if (count > contentMin) return x;
  }
  return 0;
}

function findRightEdge(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { rightEdge: number; edgePure: number; edgeSoft: number } {
  const scanRows = Math.floor(height * GAP_SCAN_HEIGHT_RATIO);
  const colWhite: number[] = [];
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < scanRows; y++) {
      const i = (y * width + x) * channels;
      if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
        count++;
      }
    }
    colWhite[x] = count;
  }
  const pureThreshold = Math.floor(scanRows * GAP_WHITE_RATIO_PURE);
  const softThreshold = Math.floor(scanRows * GAP_WHITE_RATIO_SOFT);
  const strongContentMax = Math.floor(scanRows * 0.85);
  let inContent = false;
  let edgePure = -1;
  let edgeSoft = -1;
  for (let x = 0; x < width; x++) {
    if (colWhite[x] < strongContentMax) inContent = true;
    if (inContent) {
      if (edgeSoft === -1 && colWhite[x] >= softThreshold) edgeSoft = x;
      if (edgePure === -1 && colWhite[x] >= pureThreshold) edgePure = x;
    }
  }
  const delta = edgePure >= 0 && edgeSoft >= 0 ? edgePure - edgeSoft : null;
  const rightEdge =
    delta !== null && delta <= PURE_SOFT_MAX_DISTANCE && edgePure >= 0
      ? edgePure
      : edgeSoft >= 0
        ? edgeSoft
        : edgePure >= 0
          ? edgePure
          : Math.floor(width * 0.25);
  return { rightEdge, edgePure: edgePure >= 0 ? edgePure : -1, edgeSoft: edgeSoft >= 0 ? edgeSoft : -1 };
}

function findBottomEdge(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  colLeft?: number,
  colRight?: number,
): number {
  const xStart = colLeft ?? 0;
  const xEnd = colRight ?? width;
  const scanWidth = xEnd - xStart;
  const rowNonWhite: number[] = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = xStart; x < xEnd; x++) {
      const i = (y * width + x) * channels;
      if (data[i] < WHITE_THRESHOLD || data[i + 1] < WHITE_THRESHOLD || data[i + 2] < WHITE_THRESHOLD) {
        count++;
      }
    }
    rowNonWhite[y] = count;
  }
  const contentMin = scanWidth * CONTENT_THRESHOLD;
  for (let y = height - 1; y >= 0; y--) {
    if (rowNonWhite[y] > contentMin) return y;
  }
  return Math.floor(height * 0.88);
}

function findLargestContentRegion(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { top: number; bottom: number; runs: { top: number; bottom: number }[] } {
  const rowNonWhite: number[] = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (isNonWhite(data[i], data[i + 1], data[i + 2], WHITE_THRESHOLD)) count++;
    }
    rowNonWhite[y] = count;
  }
  const contentMin = width * ROW_CONTENT_THRESHOLD;
  const runs: { top: number; bottom: number }[] = [];
  let runStart = -1;
  for (let y = 0; y < height; y++) {
    const hasContent = rowNonWhite[y] > contentMin;
    if (hasContent) {
      if (runStart === -1) runStart = y;
    } else {
      if (runStart >= 0) {
        runs.push({ top: runStart, bottom: y - 1 });
        runStart = -1;
      }
    }
  }
  if (runStart >= 0) runs.push({ top: runStart, bottom: height - 1 });
  if (runs.length === 0) {
    return { top: 0, bottom: height - 1, runs: [] };
  }
  const largest = runs.reduce((a, b) =>
    b.bottom - b.top + 1 > a.bottom - a.top + 1 ? b : a,
  );
  return { top: largest.top, bottom: largest.bottom, runs };
}

async function diagnose(imagePath: string, saveIntermediate: boolean) {
  const resolvedPath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(process.cwd(), imagePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const outDir = saveIntermediate
    ? path.join(path.dirname(resolvedPath), 'diagnose_extraction')
    : null;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`Saving intermediate images to: ${outDir}\n`);
  }

  console.log(`=== Diagnosing: ${resolvedPath}\n`);

  const buffer = fs.readFileSync(resolvedPath);
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  console.log(`Image: ${width}x${height}, channels=${channels}\n`);

  // --- Pass 1 ---
  console.log('--- Pass 1: Find bounds on full turnaround ---');
  const leftEdgeFull = findLeftEdgePure(data, width, height, channels);
  const { rightEdge, edgePure, edgeSoft } = findRightEdge(data, width, height, channels);
  const bottomEdge = findBottomEdge(data, width, height, channels, leftEdgeFull, rightEdge);

  console.log(`  leftEdgeFull: ${leftEdgeFull}`);
  console.log(`  rightEdge: ${rightEdge} (edgePure=${edgePure}, edgeSoft=${edgeSoft})`);
  console.log(`  bottomEdge: ${bottomEdge}`);

  const viewHeight = Math.max(50, bottomEdge);
  let viewLeft: number;
  let viewWidth: number;
  if (rightEdge > leftEdgeFull) {
    viewLeft = leftEdgeFull;
    viewWidth = Math.max(50, rightEdge - leftEdgeFull);
  } else {
    viewLeft = leftEdgeFull;
    viewWidth = Math.max(50, Math.min(Math.ceil(width / 4), width - leftEdgeFull));
  }

  console.log(`  viewLeft: ${viewLeft}, viewWidth: ${viewWidth}, viewHeight: ${viewHeight}`);

  const firstView = await sharp(buffer)
    .extract({ left: viewLeft, top: 0, width: viewWidth, height: viewHeight })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const vw = firstView.info.width;
  const vh = firstView.info.height;
  const ch = firstView.info.channels;

  if (outDir) {
    const pass1Png = await sharp(firstView.data, { raw: { width: vw, height: vh, channels: ch } })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(outDir, 'pass1_firstView.png'), pass1Png);
    console.log(`  Saved: pass1_firstView.png (${vw}x${vh})`);
  }

  // --- Pass 2 ---
  console.log('\n--- Pass 2: Largest vertical content region ---');
  const { top: regionTop, bottom: regionBottom, runs } = findLargestContentRegion(
    firstView.data,
    vw,
    vh,
    ch,
  );
  const regionHeight = Math.max(50, regionBottom - regionTop + 1);

  console.log(`  Runs found: ${runs.length}`);
  runs.forEach((r, i) => {
    const h = r.bottom - r.top + 1;
    const tag = r.top === regionTop && r.bottom === regionBottom ? ' (CHOSEN)' : '';
    console.log(`    run ${i}: y=${r.top}-${r.bottom} (height=${h})${tag}`);
  });
  console.log(`  regionTop: ${regionTop}, regionBottom: ${regionBottom}, regionHeight: ${regionHeight}`);

  const afterVertical = await sharp(firstView.data, { raw: { width: vw, height: vh, channels: ch } })
    .extract({ left: 0, top: regionTop, width: vw, height: regionHeight })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const avw = afterVertical.info.width;
  const avh = afterVertical.info.height;
  const ach = afterVertical.info.channels;

  if (outDir) {
    const pass2Png = await sharp(afterVertical.data, { raw: { width: avw, height: avh, channels: ach } })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(outDir, 'pass2_afterVertical.png'), pass2Png);
    console.log(`  Saved: pass2_afterVertical.png (${avw}x${avh})`);
  }

  // --- Pass 3 ---
  console.log('\n--- Pass 3: Trim left (pure white) ---');
  const leftEdge = findLeftEdgePure(afterVertical.data, avw, avh, ach);
  const cropWidth = Math.max(50, avw - leftEdge);

  console.log(`  leftEdge: ${leftEdge}, cropWidth: ${cropWidth}`);

  const crop = await sharp(afterVertical.data, { raw: { width: avw, height: avh, channels: ach } })
    .extract({ left: leftEdge, top: 0, width: cropWidth, height: avh })
    .png()
    .toBuffer();

  if (outDir) {
    fs.writeFileSync(path.join(outDir, 'pass3_final.png'), crop);
    console.log(`  Saved: pass3_final.png (${cropWidth}x${avh}), size=${(crop.length / 1024).toFixed(1)} KB`);
  }

  console.log('\n--- Summary ---');
  console.log(`  Final crop: ${cropWidth}x${avh}, ${(crop.length / 1024).toFixed(1)} KB`);
}

const storagePath = process.argv[2];
const save = process.argv.includes('--save');

if (!storagePath) {
  console.error('Usage: npx tsx src/scripts/diagnoseTurnaroundExtraction.ts <storagePath> [--save]');
  process.exit(1);
}

// Resolve path: if relative, assume from uploads root
const imagePath = storagePath.startsWith('uploads/')
  ? path.resolve(process.cwd(), storagePath)
  : path.resolve(process.cwd(), 'uploads', storagePath);

diagnose(imagePath, save).catch((err) => {
  console.error(err);
  process.exit(1);
});
