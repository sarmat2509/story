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
import {
  findRightEdge,
  findLargestContentRegion,
  findTopEdge,
  findBottomEdge,
  findLeftEdgePure,
  resolveForegroundBgParams,
  neutralizeFrontCropBackgroundToWhite,
  shouldNeutralizeTurnaroundFrontBackground,
} from '../services/turnaroundFrontExtractor';

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

  // --- Pass 0: full-width horizontal band (drop top/bottom sheet text) ---
  console.log('--- Pass 0: Main vertical band on full sheet (before column gaps) ---');
  const bandPick = findLargestContentRegion(data, width, height, channels);
  let bandY0 = bandPick.top;
  let bandY1 = bandPick.bottom;
  const bandPixelH = bandY1 - bandY0 + 1;
  if (bandPick.runs.length === 0 || bandPixelH < Math.min(120, Math.floor(height * 0.25))) {
    bandY0 = 0;
    bandY1 = height - 1;
    console.log('  (fallback: full image height — band pick too small or empty)');
  }
  const bandH = bandY1 - bandY0 + 1;
  console.log(`  bandY0: ${bandY0}, bandY1: ${bandY1}, bandH: ${bandH}`);
  console.log(`  band runs: ${bandPick.runs.length}`);
  bandPick.runs.forEach((r, i) => {
    const tag = r.top === bandPick.top && r.bottom === bandPick.bottom ? ' (CHOSEN)' : '';
    console.log(`    run ${i}: y=${r.top}-${r.bottom} height=${r.height} mass=${r.mass}${tag}`);
  });

  if (outDir) {
    const bandPng = await sharp(buffer)
      .extract({ left: 0, top: bandY0, width, height: bandH })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(outDir, 'pass0_sheet_band.png'), bandPng);
    console.log(`  Saved: pass0_sheet_band.png (${width}x${bandH})`);
  }

  const sheetBand = await sharp(buffer)
    .extract({ left: 0, top: bandY0, width, height: bandH })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bandData = sheetBand.data;
  const bw = sheetBand.info.width;
  const bh = sheetBand.info.height;
  const bch = sheetBand.info.channels;
  const bandBg = resolveForegroundBgParams(bandData, bw, bh, bch);

  // --- Pass 1: column gaps + edges on the band only ---
  console.log('\n--- Pass 1: Bounds on sheet band (gaps between views) ---');
  console.log(
    `  bandBg: rgb=(${bandBg.br},${bandBg.bg},${bandBg.bb}) delta=${bandBg.delta} (foreground = max channel deviation from bg > delta)`,
  );
  const leftEdgeFull = findLeftEdgePure(bandData, bw, bh, bch, bandBg);
  const { rightEdge, debug: rightDebug } = findRightEdge(bandData, bw, bh, bch);

  let viewLeft = leftEdgeFull;
  if (rightDebug.chosenMethod === 'mask_cc8' && rightDebug.maskCcLeftBlobMinX != null) {
    viewLeft = Math.max(leftEdgeFull, rightDebug.maskCcLeftBlobMinX);
  }

  let bottomEdge = findBottomEdge(bandData, bw, bh, bch, viewLeft, rightEdge, bandBg);
  if (rightDebug.chosenMethod === 'mask_cc8' && rightDebug.maskCcLeftBlobMaxY != null) {
    bottomEdge = Math.min(bottomEdge, rightDebug.maskCcLeftBlobMaxY);
    bottomEdge = Math.max(50, bottomEdge);
  }

  console.log(`  leftEdgeFull: ${leftEdgeFull}`);
  console.log(`  rightEdge: ${rightEdge} (${JSON.stringify(rightDebug)})`);
  console.log(`  bottomEdge: ${bottomEdge}`);
  console.log(`  viewLeft (after mask_cc8 trim): ${viewLeft}`);

  const viewHeight = Math.max(50, bottomEdge);
  let viewWidth: number;
  if (rightEdge > viewLeft) {
    viewWidth = Math.max(50, rightEdge - viewLeft);
  } else {
    viewWidth = Math.max(50, Math.min(Math.ceil(bw / 4), bw - viewLeft));
  }

  console.log(`  viewLeft: ${viewLeft}, viewWidth: ${viewWidth}, viewHeight: ${viewHeight}`);

  const firstView = await sharp(buffer)
    .extract({ left: viewLeft, top: bandY0, width: viewWidth, height: Math.min(viewHeight, bandH) })
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
  console.log('\n--- Pass 2: Vertical tighten inside first-view strip (row runs) ---');
  const { top: regionTop, bottom: regionBottom, runs } = findLargestContentRegion(
    firstView.data,
    vw,
    vh,
    ch,
    bandBg,
  );
  const regionHeight = Math.max(50, regionBottom - regionTop + 1);

  console.log(`  Runs found: ${runs.length}`);
  runs.forEach((r, i) => {
    const tag = r.top === regionTop && r.bottom === regionBottom ? ' (CHOSEN)' : '';
    console.log(`    run ${i}: y=${r.top}-${r.bottom} height=${r.height} mass=${r.mass}${tag}`);
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

  // --- Pass 2b: top trim (matches extractFrontFromTurnaround) ---
  console.log('\n--- Pass 2b: Trim top margin (foreground vs band bg, ~5.5% row) ---');
  const topEdge = findTopEdge(afterVertical.data, avw, avh, ach, bandBg);
  const heightAfterTop = Math.max(50, avh - topEdge);
  console.log(`  topEdge: ${topEdge}, heightAfterTop: ${heightAfterTop}`);

  let stripData = afterVertical.data;
  let sW = avw;
  let sH = avh;
  let sCh = ach;
  if (topEdge > 0) {
    const afterTop = await sharp(afterVertical.data, { raw: { width: avw, height: avh, channels: ach } })
      .extract({ left: 0, top: topEdge, width: avw, height: heightAfterTop })
      .raw()
      .toBuffer({ resolveWithObject: true });
    stripData = afterTop.data;
    sW = afterTop.info.width;
    sH = afterTop.info.height;
    sCh = afterTop.info.channels;
  }

  if (outDir) {
    const pass2bPng = await sharp(stripData, { raw: { width: sW, height: sH, channels: sCh } })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(outDir, 'pass2b_afterTopTrim.png'), pass2bPng);
    console.log(`  Saved: pass2b_afterTopTrim.png (${sW}x${sH})`);
  }

  // --- Pass 3 ---
  console.log('\n--- Pass 3: Trim left margin (foreground vs band bg) ---');
  const leftEdge = findLeftEdgePure(stripData, sW, sH, sCh, bandBg);
  const cropWidth = Math.max(50, sW - leftEdge);

  console.log(`  leftEdge: ${leftEdge}, cropWidth: ${cropWidth}`);

  const crop = await sharp(stripData, { raw: { width: sW, height: sH, channels: sCh } })
    .extract({ left: leftEdge, top: 0, width: cropWidth, height: sH })
    .png()
    .toBuffer();

  if (outDir) {
    fs.writeFileSync(path.join(outDir, 'pass3_before_white_bg.png'), crop);
    console.log(`  Saved: pass3_before_white_bg.png (${cropWidth}x${sH}), size=${(crop.length / 1024).toFixed(1)} KB`);
  }

  // --- Pass 4 (matches extractFrontFromTurnaround default) ---
  console.log('\n--- Pass 4: Sheet tint → pure white (only if sheet not already near-white) ---');
  const doNeutralize = shouldNeutralizeTurnaroundFrontBackground(bandBg);
  console.log(
    `  shouldNeutralize: ${doNeutralize} (min rgb=${Math.min(bandBg.br, bandBg.bg, bandBg.bb)}, threshold skip if ≥251)`,
  );
  const finalPng = doNeutralize
    ? await neutralizeFrontCropBackgroundToWhite(crop, bandBg)
    : crop;
  if (!doNeutralize) {
    console.log('  (skipped — band median already near-white)');
  }
  console.log(`  finalPng size: ${(finalPng.length / 1024).toFixed(1)} KB`);

  if (outDir) {
    fs.writeFileSync(path.join(outDir, 'pass4_final_white_bg.png'), finalPng);
    console.log(`  Saved: pass4_final_white_bg.png (${cropWidth}x${sH})`);
  }

  console.log('\n--- Summary ---');
  console.log(`  Final crop (API): ${cropWidth}x${sH}, ${(finalPng.length / 1024).toFixed(1)} KB`);
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
