/**
 * Extracts the front (first) character view from a turnaround model sheet image.
 * Right edge on the sheet band: foreground mask (bg RGB + tolerance), 8-connected components;
 * the leftmost large blob is the first view — split at maxX + 1 (no empty column needed).
 * If the mask merges adjacent figures, falls back to white-column heuristic. Background RGB
 * uses border median when the corner is not representative. Watershed / seeds are not
 * implemented yet (merged-blob fallback only).
 */

import sharp from 'sharp';
import { logger } from '../utils/logger';

const CONTENT_THRESHOLD = 0.02; // column/row has content if > 2% foreground pixels (vs sheet bg)

/** Max RGB delta from corner reference; above => pixel “differs from background”. */
function maxRgbDelta(r: number, g: number, b: number, br: number, bg: number, bb: number): number {
  return Math.max(Math.abs(r - br), Math.abs(g - bg), Math.abs(b - bb));
}

/**
 * Tolerance from top-left patch: high percentile of max-channel deviation in corner,
 * so anti-alias / sheet noise stays “background” without hand-tuning per sheet.
 */
function estimateBgToleranceFromCorner(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  br: number,
  bg: number,
  bb: number,
): number {
  const boxX = Math.min(48, width);
  const boxY = Math.min(48, Math.max(8, Math.floor(height * 0.2)));
  const diffs: number[] = [];
  for (let y = 0; y < boxY; y++) {
    for (let x = 0; x < boxX; x++) {
      const i = (y * width + x) * channels;
      diffs.push(maxRgbDelta(data[i], data[i + 1], data[i + 2], br, bg, bb));
    }
  }
  diffs.sort((a, b) => a - b);
  const p90 = diffs[Math.max(0, Math.floor(diffs.length * 0.9) - 1)] ?? 18;
  return Math.max(10, Math.min(48, Math.ceil(p90 * 1.35 + 2)));
}

/** Per-channel medians over border pixels (top, bottom, left, right). */
function estimateBgRgbFromBorderMedian(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (i: number) => {
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  for (let x = 0; x < width; x++) {
    push((0 * width + x) * channels);
    push(((height - 1) * width + x) * channels);
  }
  for (let y = 0; y < height; y++) {
    push((y * width + 0) * channels);
    push((y * width + (width - 1)) * channels);
  }
  rs.sort((a, b) => a - b);
  gs.sort((a, b) => a - b);
  bs.sort((a, b) => a - b);
  const mid = Math.floor(rs.length / 2);
  return [rs[mid], gs[mid], bs[mid]];
}

/** Corner vs border sheet color — use border median when corner is not representative. */
function resolveSheetBgRgb(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): [number, number, number] {
  const cr = data[0];
  const cg = data[1];
  const cb = data[2];
  const [br, bg, bb] = estimateBgRgbFromBorderMedian(data, width, height, channels);
  if (maxRgbDelta(cr, cg, cb, br, bg, bb) > 22) {
    return [br, bg, bb];
  }
  return [cr, cg, cb];
}

/** Sheet / band background RGB + adaptive delta (same as foreground mask). */
export type ForegroundBgParams = { br: number; bg: number; bb: number; delta: number };

/**
 * True when the sheet median color is clearly not paper-white (gray / cream / beige) — then we run
 * tint → pure white on the front crop. Near-white sheets skip that pass.
 */
const NEUTRALIZE_SKIP_IF_MIN_RGB = 251;

export function shouldNeutralizeTurnaroundFrontBackground(sheetBg: ForegroundBgParams): boolean {
  return Math.min(sheetBg.br, sheetBg.bg, sheetBg.bb) < NEUTRALIZE_SKIP_IF_MIN_RGB;
}

export function resolveForegroundBgParams(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): ForegroundBgParams {
  const [br, bg, bb] = resolveSheetBgRgb(data, width, height, channels);
  const delta = estimateBgToleranceFromCorner(data, width, height, channels, br, bg, bb);
  return { br, bg, bb, delta };
}

function isForeground(r: number, g: number, b: number, p: ForegroundBgParams): boolean {
  return maxRgbDelta(r, g, b, p.br, p.bg, p.bb) > p.delta;
}

function isForegroundAtDelta(
  r: number,
  g: number,
  b: number,
  p: ForegroundBgParams,
  fgDelta: number,
): boolean {
  return maxRgbDelta(r, g, b, p.br, p.bg, p.bb) > fgDelta;
}

/** Stricter fg threshold than sheet pass so cream / light fur stays character during white-out. */
const NEUTRALIZE_FG_DELTA_SUB = 2;
/** 8-neighbor dilate passes: blocks edge flood from leaking through anti-alias gaps. */
const NEUTRALIZE_FG_DILATE_PASSES = 3;

const NEI8_NEUT = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
const NEI4_NEUT = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

function dilateBinaryMask8(src: Uint8Array, width: number, height: number, passes: number): Uint8Array {
  let a = new Uint8Array(src);
  let b = new Uint8Array(width * height);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = y * width + x;
        let v = a[s]!;
        if (!v) {
          for (const [dx, dy] of NEI8_NEUT) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height && a[ny * width + nx]) {
              v = 1;
              break;
            }
          }
        }
        b[s] = v;
      }
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

/** Shrink fg mask; used to define character “core” we must not recolor in the shadow-clean pass. */
function erodeBinaryMask8(src: Uint8Array, width: number, height: number, passes: number): Uint8Array {
  let a = new Uint8Array(src);
  let b = new Uint8Array(width * height);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = y * width + x;
        let v = a[s]!;
        if (v) {
          for (const [dx, dy] of NEI8_NEUT) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || !a[ny * width + nx]) {
              v = 0;
              break;
            }
          }
        }
        b[s] = v;
      }
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

/** Erode original fg this many px (core) — outside core we may clamp neutral gray to white (trapped shadow). */
const NEUTRALIZE_CORE_ERODE_PASSES = 3;
/** Neutral dirty shadow: low chroma + mid–high luminance (not pure white yet). */
const SHADOW_GRAY_CHROMA_MAX = 28;
const SHADOW_LUM_MIN = 178;
const SHADOW_LUM_MAX = 253;

function isNeutralishShadowOnWhite(r: number, g: number, b: number): boolean {
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  if (hi - lo > SHADOW_GRAY_CHROMA_MAX) return false;
  const m = (r + g + b) / 3;
  return m >= SHADOW_LUM_MIN && m < SHADOW_LUM_MAX;
}

/** Pixels not in `blocked` that are 4-connected to any image border cell (sheet-only replacement). */
function floodEdgeReachable4(blocked: Uint8Array, width: number, height: number): Uint8Array {
  const reach = new Uint8Array(width * height);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const s = y * width + x;
    if (blocked[s] || reach[s]) return;
    reach[s] = 1;
    stack.push(s);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (stack.length) {
    const s = stack.pop()!;
    const x = s % width;
    const y = (s / width) | 0;
    for (const [dx, dy] of NEI4_NEUT) {
      push(x + dx, y + dy);
    }
  }
  return reach;
}

/**
 * Replace sheet background with white: (1) mask + edge flood from border; (2) clamp neutral
 * light-gray “dirty shadow” outside an eroded character core (fills trapped pockets between limbs
 * and soft halos that were classified as foreground).
 */
export async function neutralizeFrontCropBackgroundToWhite(
  buffer: Buffer,
  sheetBg?: ForegroundBgParams,
): Promise<Buffer> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const c = info.channels;
  if (c < 3) return buffer;

  const p = sheetBg ?? resolveForegroundBgParams(data, w, h, c);
  const fgDelta = Math.max(5, p.delta - NEUTRALIZE_FG_DELTA_SUB);

  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * c;
      if (isForegroundAtDelta(data[o]!, data[o + 1]!, data[o + 2]!, p, fgDelta)) {
        fg[y * w + x] = 1;
      }
    }
  }

  const blocked = dilateBinaryMask8(fg, w, h, NEUTRALIZE_FG_DILATE_PASSES);
  const edgeBg = floodEdgeReachable4(blocked, w, h);

  const out = Buffer.from(data);
  for (let i = 0; i < w * h; i++) {
    if (!edgeBg[i]) continue;
    const o = i * c;
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
  }

  const coreFg = erodeBinaryMask8(fg, w, h, NEUTRALIZE_CORE_ERODE_PASSES);
  for (let i = 0; i < w * h; i++) {
    if (coreFg[i]) continue;
    const o = i * c;
    const r = out[o]!;
    const g = out[o + 1]!;
    const b = out[o + 2]!;
    if (isNeutralishShadowOnWhite(r, g, b)) {
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
    }
  }

  return sharp(out, { raw: { width: w, height: h, channels: c } }).png().toBuffer();
}

/**
 * First column with enough foreground pixels vs sheet background (not absolute white).
 * When `sheetBg` is set (e.g. full band params), use it for narrow crops where corner bg is wrong.
 */
export function findLeftEdgePure(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  sheetBg?: ForegroundBgParams,
): number {
  const p = sheetBg ?? resolveForegroundBgParams(data, width, height, channels);
  const contentMin = height * CONTENT_THRESHOLD;
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      if (isForeground(data[i], data[i + 1], data[i + 2], p)) count++;
    }
    if (count > contentMin) return x;
  }
  return 0;
}

/** Use top portion of image for legacy white-column gap detection. */
const GAP_SCAN_HEIGHT_RATIO = 0.75;

/** Pure white gap (98%). */
const GAP_WHITE_RATIO_PURE = 1;
/** Soft white gap (92%) for anti-aliased/tail-contaminated gaps. */
const GAP_WHITE_RATIO_SOFT = 0.92;
/** If pure and soft edges are within this many columns, use pure. */
const PURE_SOFT_MAX_DISTANCE = 110;

/** Min foreground area (px) for a CC blob to count as a “figure” fragment. */
const MASK_CC_MIN_AREA_ABS = 2000;
const MASK_CC_MIN_AREA_FRAC = 0.0012;
/** Left blob must be at least this fraction of the largest blob’s area (filters specks). */
const MASK_CC_LEFT_MIN_FRAC_OF_MAX = 0.18;
/** Blobs starting further right are not the first view. */
const MASK_CC_LEFT_MAX_MIN_X_FRAC = 0.48;
/** If the only large blob spans this fraction of width, treat as merged → legacy. */
const MASK_CC_MERGED_MIN_WIDTH_FRAC = 0.42;
/** Group blobs whose minX is within this many px of the leftmost candidate minX. */
const MASK_CC_LEFT_GROUP_SLACK_PX = 40;

/** Optional ids/path so logs point at a concrete turnaround asset. */
export type TurnaroundRightEdgeLogContext = {
  turnaroundStoragePath: string;
  characterId?: string;
  childId?: string;
};

export type RightEdgeDebug = {
  rightEdge: number;
  chosenMethod: string;
  edgePure: number | null;
  edgeSoft: number | null;
  delta: number | null;
  /** mask_cc8: number of CC blobs at or above min area. */
  maskCcLargeComponents?: number | null;
  /** mask_cc8: max X of the chosen left blob (inclusive); split uses maxX + 1. */
  maskCcLeftBlobMaxX?: number | null;
  /** mask_cc8: min X of chosen left blob — trims sheet margin when white-column left is 0. */
  maskCcLeftBlobMinX?: number | null;
  /** mask_cc8: max Y of chosen left blob — caps bottom when caption is disconnected in mask. */
  maskCcLeftBlobMaxY?: number | null;
  /** mask_cc8: bg tolerance used to build the mask. */
  maskCcBgDelta?: number | null;
};

type CcBlob = { minX: number; maxX: number; minY: number; maxY: number; area: number };

/** 8-neighbor offsets. */
const NEI8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function buildForegroundMask(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  /** When set (e.g. full band), use same bg as sheet-wide CC so a bottom crop does not re-estimate tint. */
  sheetBg?: ForegroundBgParams,
): { mask: Uint8Array; delta: number } {
  const p = sheetBg ?? resolveForegroundBgParams(data, width, height, channels);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (isForeground(data[i], data[i + 1], data[i + 2], p)) {
        mask[y * width + x] = 1;
      }
    }
  }
  return { mask, delta: p.delta };
}

function labelConnectedComponents8(mask: Uint8Array, width: number, height: number): Int32Array {
  const labels = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  let sp = 0;
  let currentLabel = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = y * width + x;
      if (!mask[s] || labels[s] !== 0) continue;
      currentLabel++;
      sp = 0;
      stack[sp++] = s;
      labels[s] = currentLabel;
      while (sp > 0) {
        const p = stack[--sp]!;
        const px = p % width;
        const py = (p / width) | 0;
        for (let k = 0; k < 8; k++) {
          const nx = px + NEI8[k]![0];
          const ny = py + NEI8[k]![1];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (!mask[q] || labels[q] !== 0) continue;
          labels[q] = currentLabel;
          stack[sp++] = q;
        }
      }
    }
  }

  return labels;
}

function collectBlobStats(
  labels: Int32Array,
  width: number,
  height: number,
  numLabels: number,
): CcBlob[] {
  const stats: CcBlob[] = [];
  for (let i = 0; i <= numLabels; i++) {
    stats.push({
      minX: width,
      maxX: -1,
      minY: height,
      maxY: -1,
      area: 0,
    });
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lab = labels[y * width + x];
      if (lab <= 0) continue;
      const st = stats[lab]!;
      st.area++;
      if (x < st.minX) st.minX = x;
      if (x > st.maxX) st.maxX = x;
      if (y < st.minY) st.minY = y;
      if (y > st.maxY) st.maxY = y;
    }
  }
  const out: CcBlob[] = [];
  for (let lab = 1; lab <= numLabels; lab++) {
    const st = stats[lab]!;
    if (st.area > 0 && st.maxX >= 0) out.push(st);
  }
  return out;
}

/**
 * First view | rest of sheet: leftmost significant foreground blob (8-CC on bg-removed mask).
 * Works when view1 and view2 do not touch in the mask; if one merged blob, returns null.
 */
function findRightEdgeMaskCc(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  sheetBg?: ForegroundBgParams,
): { rightEdge: number; debug: RightEdgeDebug } | null {
  const { mask, delta } = buildForegroundMask(data, width, height, channels, sheetBg);
  const labels = labelConnectedComponents8(mask, width, height);
  let maxLab = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i]! > maxLab) maxLab = labels[i]!;
  }
  if (maxLab <= 0) return null;

  const rawBlobs = collectBlobStats(labels, width, height, maxLab);
  const minArea = Math.max(MASK_CC_MIN_AREA_ABS, Math.floor(width * height * MASK_CC_MIN_AREA_FRAC));
  const blobs = rawBlobs.filter((b) => b.area >= minArea);
  if (blobs.length === 0) return null;

  const maxArea = Math.max(...blobs.map((b) => b.area));
  const leftMaxX = Math.floor(width * MASK_CC_LEFT_MAX_MIN_X_FRAC);
  let candidates = blobs.filter(
    (b) => b.minX < leftMaxX && b.area >= maxArea * MASK_CC_LEFT_MIN_FRAC_OF_MAX,
  );
  if (candidates.length === 0) {
    candidates = blobs.filter((b) => b.area >= maxArea * MASK_CC_LEFT_MIN_FRAC_OF_MAX);
  }
  if (candidates.length === 0) return null;

  const minX0 = Math.min(...candidates.map((b) => b.minX));
  const nearLeft = candidates.filter((b) => b.minX <= minX0 + MASK_CC_LEFT_GROUP_SLACK_PX);
  nearLeft.sort((a, b) => b.area - a.area);
  const leftBlob = nearLeft[0]!;
  const blobW = leftBlob.maxX - leftBlob.minX + 1;

  if (blobs.length === 1 && blobW >= Math.floor(width * MASK_CC_MERGED_MIN_WIDTH_FRAC)) {
    return null;
  }

  const rightEdge = Math.min(width, leftBlob.maxX + 1);

  return {
    rightEdge,
    debug: {
      rightEdge,
      chosenMethod: 'mask_cc8',
      edgePure: null,
      edgeSoft: null,
      delta: null,
      maskCcLargeComponents: blobs.length,
      maskCcLeftBlobMaxX: leftBlob.maxX,
      maskCcLeftBlobMinX: leftBlob.minX,
      maskCcLeftBlobMaxY: leftBlob.maxY,
      maskCcBgDelta: delta,
    },
  };
}

/**
 * Find right edge of first view (legacy).
 * Method 1: first column with pure white (≥98%) after strong content.
 * Method 2: first column with soft white (≥92%) after strong content.
 * If both found and within PURE_SOFT_MAX_DISTANCE cols, use pure. Else use soft.
 */
function findRightEdgeLegacy(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): { rightEdge: number; debug: RightEdgeDebug } {
  const scanRows = Math.floor(height * GAP_SCAN_HEIGHT_RATIO);
  const p = resolveForegroundBgParams(data, width, height, channels);
  /** Per column: rows that look like sheet background (gap between figures on tinted paper). */
  const colBgLike: number[] = [];
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = 0; y < scanRows; y++) {
      const i = (y * width + x) * channels;
      if (!isForeground(data[i], data[i + 1], data[i + 2], p)) count++;
    }
    colBgLike[x] = count;
  }

  const pureThreshold = Math.floor(scanRows * GAP_WHITE_RATIO_PURE);
  const softThreshold = Math.floor(scanRows * GAP_WHITE_RATIO_SOFT);
  const strongContentMax = Math.floor(scanRows * 0.85);
  let inContent = false;
  let edgePure = -1;
  let edgeSoft = -1;

  for (let x = 0; x < width; x++) {
    if (colBgLike[x] < strongContentMax) {
      inContent = true;
    }
    if (inContent) {
      if (edgeSoft === -1 && colBgLike[x] >= softThreshold) edgeSoft = x;
      if (edgePure === -1 && colBgLike[x] >= pureThreshold) edgePure = x;
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

export function findRightEdge(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  logContext?: TurnaroundRightEdgeLogContext,
): { rightEdge: number; debug: RightEdgeDebug } {
  const cc = findRightEdgeMaskCc(data, width, height, channels);
  if (
    cc &&
    cc.rightEdge >= 80 &&
    cc.rightEdge > Math.floor(width * 0.1) &&
    cc.rightEdge < Math.floor(width * 0.9)
  ) {
    return cc;
  }
  const leg = findRightEdgeLegacy(data, width, height, channels);
  if (cc && logContext) {
    logger.warn(
      {
        ...logContext,
        ccRight: cc.rightEdge,
        legacyRight: leg.rightEdge,
        width,
        height,
        maskCcLargeComponents: cc.debug.maskCcLargeComponents ?? null,
      },
      'Turnaround right edge: mask CC rejected bounds, using legacy white scan',
    );
  } else if (logContext) {
    logger.warn(
      { ...logContext, width, height, legacyRight: leg.rightEdge },
      'Turnaround right edge: mask CC unavailable (merged blobs or weak mask); using legacy white scan',
    );
  } else {
    logger.debug({ legacyRight: leg.rightEdge, width }, 'Turnaround right edge: mask CC unavailable, legacy white scan');
  }
  return leg;
}

/**
 * Find bottom of character: last row with enough foreground vs sheet bg (when scanning from bottom).
 * When colLeft/colRight given, scan only first view columns. Pass sheetBg from the full band on tinted paper.
 */
export function findBottomEdge(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  colLeft?: number,
  colRight?: number,
  sheetBg?: ForegroundBgParams,
): number {
  const xStart = colLeft ?? 0;
  const xEnd = colRight ?? width;
  const scanWidth = xEnd - xStart;
  const p = sheetBg ?? resolveForegroundBgParams(data, width, height, channels);

  const rowFg: number[] = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = xStart; x < xEnd; x++) {
      const i = (y * width + x) * channels;
      if (isForeground(data[i], data[i + 1], data[i + 2], p)) count++;
    }
    rowFg[y] = count;
  }

  const contentMin = scanWidth * CONTENT_THRESHOLD;

  for (let y = height - 1; y >= 0; y--) {
    if (rowFg[y] > contentMin) {
      return y;
    }
  }

  return Math.floor(height * 0.88);
}

/**
 * Row must exceed this fraction of “non–near-white” pixels to count as content (top trim).
 * Slightly stricter than CONTENT_THRESHOLD (2%): sheet noise often stays below 2% per row,
 * but many faint-speckle rows still exceed 2% — those would block trimming the head margin.
 */
const TOP_TRIM_ROW_CONTENT_FRAC = 0.055;

/**
 * First row from the top with enough foreground vs sheet background — trims margin above the head.
 * Pass `sheetBg` from the horizontal band so gray/beige paper is not treated as “white 248”.
 */
export function findTopEdge(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  sheetBg?: ForegroundBgParams,
): number {
  const p = sheetBg ?? resolveForegroundBgParams(data, width, height, channels);
  const rowFg: number[] = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (isForeground(data[i], data[i + 1], data[i + 2], p)) count++;
    }
    rowFg[y] = count;
  }
  const contentMin = width * TOP_TRIM_ROW_CONTENT_FRAC;
  for (let y = 0; y < height; y++) {
    if (rowFg[y] > contentMin) return y;
  }
  return 0;
}

/** Row has content if at least this ratio of pixels are non-white. */
const ROW_CONTENT_THRESHOLD = 0.02;

function sumRowNonWhite(rowNonWhite: number[], top: number, bottom: number): number {
  let s = 0;
  for (let y = top; y <= bottom; y++) s += rowNonWhite[y];
  return s;
}

export type VerticalContentRun = { top: number; bottom: number; mass: number; height: number };

/**
 * Main contiguous vertical band of non-white content (rows separated by near-white rows).
 * Picks the run with largest total non-white pixel mass so thin top/bottom metadata lines
 * lose to the figure; tie-break by taller run.
 */
export function findLargestContentRegion(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  /** When cropping a strip, pass bg from the full sheet band so row “content” is not white-based. */
  sheetBg?: ForegroundBgParams,
): { top: number; bottom: number; runs: VerticalContentRun[] } {
  const p = sheetBg ?? resolveForegroundBgParams(data, width, height, channels);
  const rowFg: number[] = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (isForeground(data[i], data[i + 1], data[i + 2], p)) count++;
    }
    rowFg[y] = count;
  }

  const contentMin = width * ROW_CONTENT_THRESHOLD;
  const rawRuns: { top: number; bottom: number }[] = [];
  let runStart = -1;

  for (let y = 0; y < height; y++) {
    const hasContent = rowFg[y] > contentMin;
    if (hasContent) {
      if (runStart === -1) runStart = y;
    } else {
      if (runStart >= 0) {
        rawRuns.push({ top: runStart, bottom: y - 1 });
        runStart = -1;
      }
    }
  }
  if (runStart >= 0) rawRuns.push({ top: runStart, bottom: height - 1 });

  if (rawRuns.length === 0) {
    return { top: 0, bottom: height - 1, runs: [] };
  }

  const runs: VerticalContentRun[] = rawRuns.map((r) => {
    const mass = sumRowNonWhite(rowFg, r.top, r.bottom);
    const heightPx = r.bottom - r.top + 1;
    return { ...r, mass, height: heightPx };
  });

  const largest = runs.reduce((a, b) => {
    if (b.mass !== a.mass) return b.mass > a.mass ? b : a;
    return b.height > a.height ? b : a;
  });

  return { top: largest.top, bottom: largest.bottom, runs };
}

/**
 * Extract the first (front) character from a turnaround sheet image.
 * 0) Full sheet: main horizontal band (crop top/bottom metadata; max non-white mass between empty rows).
 * 1) On that band: column gaps → right edge, left padding, bottom of first view.
 * 2) First-view strip: optional vertical tighten (row runs).
 * 2b) Trim top empty rows (foreground vs band bg + row density).
 * 3) Trim left margin (foreground vs band bg).
 * 4) Optional: replace residual sheet tint with pure white when band median is not already near-white
 *    (shouldNeutralizeTurnaroundFrontBackground); skip on bright white paper.
 *
 * @param buffer - Image buffer (PNG/JPEG)
 * @returns Extracted front view as PNG buffer, or null on failure
 */
export type ExtractFrontOptions = {
  onRightEdge?: (debug: RightEdgeDebug) => void;
  /** When set, right-edge warnings include turnaround path / entity ids. */
  rightEdgeLogContext?: TurnaroundRightEdgeLogContext;
  /**
   * `false`: never white-out. `true`: always white-out (debug). Omitted: white-out only if the sheet
   * median is not already near-white (shouldNeutralizeTurnaroundFrontBackground).
   */
  neutralizeBackgroundToWhite?: boolean;
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

    // Step 0: strip top/bottom sheet chrome (metadata lines) — full width, tight vertical band of figures.
    const { top: bandTop, bottom: bandBottom, runs: sheetBandRuns } = findLargestContentRegion(
      data,
      width,
      height,
      channels,
    );
    let bandY0 = bandTop;
    let bandY1 = bandBottom;
    const bandPixelH = bandY1 - bandY0 + 1;
    if (sheetBandRuns.length === 0 || bandPixelH < Math.min(120, Math.floor(height * 0.25))) {
      bandY0 = 0;
      bandY1 = height - 1;
    }
    const bandH = bandY1 - bandY0 + 1;

    const sheetBand = await sharp(buffer)
      .extract({ left: 0, top: bandY0, width, height: bandH })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const bandData = sheetBand.data;
    const bw = sheetBand.info.width;
    const bh = sheetBand.info.height;
    const bch = sheetBand.info.channels;
    const bandBg = resolveForegroundBgParams(bandData, bw, bh, bch);

    // Step 1: on the sheet band — mask CC right edge; optional bbox trims margin/caption.
    const leftEdgeFull = findLeftEdgePure(bandData, bw, bh, bch, bandBg);
    const { rightEdge, debug } = findRightEdge(bandData, bw, bh, bch, options?.rightEdgeLogContext);
    options?.onRightEdge?.(debug);

    let viewLeft = leftEdgeFull;
    if (debug.chosenMethod === 'mask_cc8' && debug.maskCcLeftBlobMinX != null) {
      viewLeft = Math.max(leftEdgeFull, debug.maskCcLeftBlobMinX);
    }

    let bottomEdge = findBottomEdge(bandData, bw, bh, bch, viewLeft, rightEdge, bandBg);
    if (debug.chosenMethod === 'mask_cc8' && debug.maskCcLeftBlobMaxY != null) {
      bottomEdge = Math.min(bottomEdge, debug.maskCcLeftBlobMaxY);
      bottomEdge = Math.max(50, bottomEdge);
    }

    const viewHeight = Math.max(50, bottomEdge);
    let viewWidth: number;
    if (rightEdge > viewLeft) {
      viewWidth = Math.max(50, rightEdge - viewLeft);
    } else {
      viewWidth = Math.max(50, Math.min(Math.ceil(bw / 4), bw - viewLeft));
    }

    const firstView = await sharp(buffer)
      .extract({ left: viewLeft, top: bandY0, width: viewWidth, height: Math.min(viewHeight, bandH) })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const vw = firstView.info.width;
    const vh = firstView.info.height;
    const ch = firstView.info.channels;

    // Pass 2: keep only largest vertical content region
    const { top: regionTop, bottom: regionBottom } = findLargestContentRegion(
      firstView.data,
      vw,
      vh,
      ch,
      bandBg,
    );
    const regionHeight = Math.max(50, regionBottom - regionTop + 1);

    const afterVertical = await sharp(firstView.data, { raw: { width: vw, height: vh, channels: ch } })
      .extract({ left: 0, top: regionTop, width: vw, height: regionHeight })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let avw = afterVertical.info.width;
    let avh = afterVertical.info.height;
    let ach = afterVertical.info.channels;
    let verticalData = afterVertical.data;

    const topEdge = findTopEdge(verticalData, avw, avh, ach, bandBg);
    const heightAfterTop = Math.max(50, avh - topEdge);
    if (topEdge > 0) {
      const afterTop = await sharp(verticalData, { raw: { width: avw, height: avh, channels: ach } })
        .extract({ left: 0, top: topEdge, width: avw, height: heightAfterTop })
        .raw()
        .toBuffer({ resolveWithObject: true });
      verticalData = afterTop.data;
      avw = afterTop.info.width;
      avh = afterTop.info.height;
      ach = afterTop.info.channels;
    }

    // Pass 3: trim left (pure white only; light yellow remains)
    const leftEdge = findLeftEdgePure(verticalData, avw, avh, ach, bandBg);
    const cropWidth = Math.max(50, avw - leftEdge);

    const crop = await sharp(verticalData, { raw: { width: avw, height: avh, channels: ach } })
      .extract({ left: leftEdge, top: 0, width: cropWidth, height: avh })
      .png()
      .toBuffer();

    if (options?.neutralizeBackgroundToWhite === false) {
      return crop;
    }
    if (options?.neutralizeBackgroundToWhite !== true && !shouldNeutralizeTurnaroundFrontBackground(bandBg)) {
      return crop;
    }
    return neutralizeFrontCropBackgroundToWhite(crop, bandBg);
  } catch (err) {
    logger.warn({ err }, 'Front extraction failed');
    return null;
  }
}
