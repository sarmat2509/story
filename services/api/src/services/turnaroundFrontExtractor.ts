/**
 * Extracts the front (first) character view from a turnaround model sheet image.
 * Detects boundaries via white pixels (background) — works for variable layout.
 */

import sharp from 'sharp';
import { logger } from '../utils/logger';

const WHITE_THRESHOLD = 245;
const MIN_WHITE_RUN_ROWS = 5;
const CONTENT_THRESHOLD = 0.02; // column/row has content if > 2% non-white pixels

function isNonWhite(r: number, g: number, b: number, threshold: number): boolean {
  return r < threshold || g < threshold || b < threshold;
}

/** White for left trim: trim columns with pixels below this (248 = trim near-white, keep glow). */
const LEFT_TRIM_WHITE_THRESHOLD = 248;

/**
 * Find left edge: first column with content (non-white).
 * Threshold 248: trim near-white and light grey; keep character and subtle glow.
 */
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

/** Use top portion of image for gap detection (exclude ground shadows between views). */
const GAP_SCAN_HEIGHT_RATIO = 0.75;

/** Pure white gap (98%). */
const GAP_WHITE_RATIO_PURE = 1;
/** Soft white gap (92%) for anti-aliased/tail-contaminated gaps. */
const GAP_WHITE_RATIO_SOFT = 0.92;
/** If pure and soft edges are within this many columns, use pure. */
const PURE_SOFT_MAX_DISTANCE = 110;

export type RightEdgeDebug = {
  rightEdge: number;
  chosenMethod: string;
  edgePure: number | null;
  edgeSoft: number | null;
  delta: number | null;
};

/**
 * Find right edge of first view.
 * Method 1: first column with pure white (≥98%) after strong content.
 * Method 2: first column with soft white (≥92%) after strong content.
 * If both found and within PURE_SOFT_MAX_DISTANCE cols, use pure. Else use soft.
 */
function findRightEdge(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { rightEdge: number; debug: RightEdgeDebug } {
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
    if (colWhite[x] < strongContentMax) {
      inContent = true;
    }
    if (inContent) {
      if (edgeSoft === -1 && colWhite[x] >= softThreshold) edgeSoft = x;
      if (edgePure === -1 && colWhite[x] >= pureThreshold) edgePure = x;
    }
  }

  const delta = edgePure >= 0 && edgeSoft >= 0 ? edgePure - edgeSoft : null;
  const chosenMethod =
    delta !== null && delta <= PURE_SOFT_MAX_DISTANCE
      ? 'PURE'
      : edgeSoft >= 0
        ? 'SOFT'
        : edgePure >= 0
          ? 'PURE'
          : 'FALLBACK';
  const rightEdge =
    chosenMethod === 'PURE' && edgePure >= 0
      ? edgePure
      : edgeSoft >= 0
        ? edgeSoft
        : edgePure >= 0
          ? edgePure
          : Math.floor(width * 0.25);

  const debug: RightEdgeDebug = {
    rightEdge,
    chosenMethod,
    edgePure: edgePure >= 0 ? edgePure : null,
    edgeSoft: edgeSoft >= 0 ? edgeSoft : null,
    delta,
  };

  return { rightEdge, debug };
}

/**
 * Find bottom of character: last row with content (when scanning from bottom).
 * Cuts the bottom white/labels. When colLeft/colRight given, scan only first view columns.
 */
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

  // Scan from bottom: first content row = bottom of character (cut labels/white below)
  for (let y = height - 1; y >= 0; y--) {
    if (rowNonWhite[y] > contentMin) {
      return y;
    }
  }

  return Math.floor(height * 0.88);
}

/** Row has content if at least this ratio of pixels are non-white. */
const ROW_CONTENT_THRESHOLD = 0.02;

/**
 * Find the largest contiguous vertical region of non-white content.
 * Returns { top, bottom } for the tallest such region.
 */
function findLargestContentRegion(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { top: number; bottom: number } {
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
    return { top: 0, bottom: height - 1 };
  }

  const largest = runs.reduce((a, b) =>
    b.bottom - b.top + 1 > a.bottom - a.top + 1 ? b : a,
  );
  return largest;
}

/**
 * Extract the first (front) character from a turnaround sheet image.
 * Pass 1: extract front view (right + bottom edges).
 * Pass 2: keep largest vertical content region.
 * Pass 3: trim left (pure white only; light yellow remains).
 *
 * @param buffer - Image buffer (PNG/JPEG)
 * @returns Extracted front view as PNG buffer, or null on failure
 */
export type ExtractFrontOptions = {
  onRightEdge?: (debug: RightEdgeDebug) => void;
};

export async function extractFrontFromTurnaround(
  buffer: Buffer,
  options?: ExtractFrontOptions,
): Promise<Buffer | null> {
  try {
    const { data, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    if (width < 100 || height < 100) {
      logger.warn({ width, height }, 'Turnaround image too small');
      return null;
    }

    // Pass 1: find left, right, and bottom of first view on full turnaround.
    // Left edge: skip white padding (model may add gap before first view).
    // Right edge: first white gap after content.
    const leftEdgeFull = findLeftEdgePure(data, width, height, channels);
    const { rightEdge, debug } = findRightEdge(data, width, height, channels);
    options?.onRightEdge?.(debug);
    // Bottom: scan only within first view columns (full-width scan mixes all 4 views).
    const bottomEdge = findBottomEdge(data, width, height, channels, leftEdgeFull, rightEdge);

    const viewHeight = Math.max(50, bottomEdge);
    let viewLeft: number;
    let viewWidth: number;
    if (rightEdge > leftEdgeFull) {
      viewLeft = leftEdgeFull;
      viewWidth = Math.max(50, rightEdge - leftEdgeFull);
    } else {
      // Fallback: gap detection failed (e.g. no clear white between views).
      // Use left edge + estimated width (4 views in a row).
      viewLeft = leftEdgeFull;
      viewWidth = Math.max(50, Math.min(Math.ceil(width / 4), width - leftEdgeFull));
    }

    // Extract first view region (skip left padding if any)
    const firstView = await sharp(buffer)
      .extract({ left: viewLeft, top: 0, width: viewWidth, height: viewHeight })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const vw = firstView.info.width;
    const vh = firstView.info.height;
    const ch = firstView.info.channels;

    // Pass 2: keep only largest vertical content region
    const { top: regionTop, bottom: regionBottom } = findLargestContentRegion(firstView.data, vw, vh, ch);
    const regionHeight = Math.max(50, regionBottom - regionTop + 1);

    const afterVertical = await sharp(firstView.data, { raw: { width: vw, height: vh, channels: ch } })
      .extract({ left: 0, top: regionTop, width: vw, height: regionHeight })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const avw = afterVertical.info.width;
    const avh = afterVertical.info.height;
    const ach = afterVertical.info.channels;

    // Pass 3: trim left (pure white only; light yellow remains)
    const leftEdge = findLeftEdgePure(afterVertical.data, avw, avh, ach);
    const cropWidth = Math.max(50, avw - leftEdge);

    const crop = await sharp(afterVertical.data, { raw: { width: avw, height: avh, channels: ach } })
      .extract({ left: leftEdge, top: 0, width: cropWidth, height: avh })
      .png()
      .toBuffer();

    return crop;
  } catch (err) {
    logger.warn({ err }, 'Front extraction failed');
    return null;
  }
}
