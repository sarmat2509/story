/**
 * Diagnostic script: analyze image columns for turnaround front extraction.
 * Logs white pixel counts per column to debug right-edge detection.
 *
 * Usage:
 *   pnpm api:script npx tsx src/scripts/analyzeTurnaroundColumns.ts [path/to/image.png]
 *
 * Default path: uploads/development/.../character_front/1773220900677.png
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

const WHITE_THRESHOLD = 245;
const GAP_SCAN_HEIGHT_RATIO = 0.75;
const GAP_WHITE_RATIO_PURE = 0.98;
const GAP_WHITE_RATIO_SOFT = 0.92;
const PURE_SOFT_MAX_DISTANCE = 100;
const STRONG_CONTENT_MAX = 0.85; // must pass through character (<85% white)

const DEFAULT_IMAGE = path.resolve(
  __dirname,
  '../../uploads/development/23a825d6-d750-4297-bf17-5e2452d112aa/photos/character_front/1773220900677.png',
);

async function analyzeImage(imagePath: string) {
  const resolvedPath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(imagePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`\n=== Analyzing: ${resolvedPath}\n`);

  const { data, info } = await sharp(resolvedPath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  const scanRows = Math.floor(height * GAP_SCAN_HEIGHT_RATIO);
  const pureThreshold = Math.floor(scanRows * GAP_WHITE_RATIO_PURE);
  const softThreshold = Math.floor(scanRows * GAP_WHITE_RATIO_SOFT);
  const strongContentMax = Math.floor(scanRows * STRONG_CONTENT_MAX);

  console.log(`Image: ${width}x${height}, channels=${channels}`);
  console.log(`Scan rows (top ${GAP_SCAN_HEIGHT_RATIO * 100}%): ${scanRows}`);
  console.log(`Pure (98%): >= ${pureThreshold} white | Soft (92%): >= ${softThreshold} white`);
  console.log(`Strong content: < ${strongContentMax} white (${STRONG_CONTENT_MAX * 100}%)\n`);

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

  const maxWhite = Math.max(...colWhite);
  const minWhite = Math.min(...colWhite);
  console.log(`Columns: white min=${minWhite}, max=${maxWhite}\n`);

  let inContent = false;
  let edgePure = -1;
  let edgeSoft = -1;
  const regions: { type: string; start: number; end: number; avgWhite: number }[] = [];
  let regionStart = 0;
  let regionType: 'content' | 'gap' = colWhite[0] >= softThreshold ? 'gap' : 'content';

  for (let x = 0; x < width; x++) {
    const isGapSoft = colWhite[x] >= softThreshold;
    const ratio = (colWhite[x] / scanRows * 100).toFixed(1);

    if (colWhite[x] < strongContentMax) inContent = true;
    if (inContent) {
      if (edgeSoft === -1 && colWhite[x] >= softThreshold) edgeSoft = x;
      if (edgePure === -1 && colWhite[x] >= pureThreshold) edgePure = x;
    }

    const currentType = isGapSoft ? 'gap' : 'content';
    if (currentType !== regionType) {
      const avgWhite =
        colWhite.slice(regionStart, x).reduce((a, b) => a + b, 0) / (x - regionStart);
      regions.push({ type: regionType, start: regionStart, end: x - 1, avgWhite });
      regionStart = x;
      regionType = currentType;
    }

    const isSample = x % 25 === 0 || x < 15 || x > width - 15;
    if (isSample) {
      console.log(`  x=${String(x).padStart(4)} white=${String(colWhite[x]).padStart(4)} (${ratio}%) ${isGapSoft ? 'GAP' : 'content'}`);
    }
  }

  const rightEdge =
    edgePure >= 0 && edgeSoft >= 0 && edgePure - edgeSoft <= PURE_SOFT_MAX_DISTANCE
      ? edgePure
      : edgeSoft >= 0
        ? edgeSoft
        : edgePure >= 0
          ? edgePure
          : Math.floor(width * 0.25);

  if (rightEdge >= 0) {
    console.log('\n--- Boundary zone (around right edge) ---');
    const lo = Math.max(0, rightEdge - 5);
    const hi = Math.min(width - 1, rightEdge + 5);
    for (let x = lo; x <= hi; x++) {
      const ratio = (colWhite[x] / scanRows * 100).toFixed(1);
      const isGap = colWhite[x] >= softThreshold;
      const tag = x === rightEdge ? ' <-- RIGHT EDGE' : '';
      console.log(`  x=${String(x).padStart(4)} white=${String(colWhite[x]).padStart(4)} (${ratio}%) ${isGap ? 'GAP' : 'content'}${tag}`);
    }
  } else {
    console.log(`\n--- No gap found ---`);
    let seenContent = false;
    let bestCol = -1;
    let bestWhite = 0;
    for (let x = 0; x < width; x++) {
      if (colWhite[x] < strongContentMax) seenContent = true;
      if (seenContent && colWhite[x] > bestWhite) {
        bestWhite = colWhite[x];
        bestCol = x;
      }
    }
    if (bestCol >= 0) {
      const pct = (bestWhite / scanRows * 100).toFixed(1);
      console.log(`  Best column after content: x=${bestCol} white=${bestWhite} (${pct}%)`);
    }
  }

  const avgWhite = colWhite.slice(regionStart, width).reduce((a, b) => a + b, 0) / (width - regionStart);
  regions.push({ type: regionType, start: regionStart, end: width - 1, avgWhite });

  console.log('\n--- Regions ---');
  for (const r of regions) {
    const avgPct = (r.avgWhite / scanRows * 100).toFixed(1);
    console.log(`  ${r.type.padEnd(8)} x=${r.start}-${r.end} (${r.end - r.start + 1} cols) avg white=${avgPct}%`);
  }

  console.log('\n--- Result ---');
  console.log(`  edgePure (98%): x=${edgePure >= 0 ? edgePure : 'none'}`);
  console.log(`  edgeSoft (92%): x=${edgeSoft >= 0 ? edgeSoft : 'none'}`);

  const delta = edgePure >= 0 && edgeSoft >= 0 ? edgePure - edgeSoft : null;
  const chosenMethod =
    delta !== null && delta <= PURE_SOFT_MAX_DISTANCE
      ? 'PURE'
      : edgeSoft >= 0
        ? 'SOFT'
        : edgePure >= 0
          ? 'PURE'
          : 'FALLBACK';

  if (delta !== null) {
    console.log(`  delta (edgePure - edgeSoft): ${delta} cols`);
    console.log(`  chosen method: ${chosenMethod} (pure if delta <= ${PURE_SOFT_MAX_DISTANCE})`);
  } else {
    console.log(`  chosen method: ${chosenMethod} (only one edge found)`);
  }
  console.log(`  Extractor would use rightEdge=${rightEdge} (crop width=${rightEdge})\n`);
}

const imagePath = process.argv[2] ?? DEFAULT_IMAGE;
analyzeImage(imagePath).catch((err) => {
  console.error(err);
  process.exit(1);
});
