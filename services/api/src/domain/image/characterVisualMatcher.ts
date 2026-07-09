import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export type CharacterVisualMatcherReference = {
  characterName: string;
  imageData: Buffer;
  identitySource?: 'turnaround' | 'reference_photo' | 'dressed_turnaround';
};

export type VisualMatcherRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CharacterVisualMatcherResult = {
  characterName: string;
  verdict: 'strong_match' | 'uncertain' | 'suspicious';
  score: number;
  bestReferenceView: number;
  bestReferenceLabel: string;
  bestCrop: VisualMatcherRect;
  bestCropRelative: VisualMatcherRect;
  metrics: {
    full: VisualMatcherMetricBreakdown;
    head: VisualMatcherMetricBreakdown;
    torso: VisualMatcherMetricBreakdown;
    overallScore01: number;
    embedding?: VisualMatcherEmbeddingBreakdown;
  };
  topCandidates: Array<{
    score: number;
    heuristicScore?: number;
    embeddingCosine?: number;
    referenceView: number;
    referenceLabel: string;
    cropRelative: VisualMatcherRect;
  }>;
};

export type CharacterVisualMatcherPanelResult = {
  panelWidth: number;
  panelHeight: number;
  characters: CharacterVisualMatcherResult[];
};

export type CharacterVisualMatcherOptions = {
  dumpDir?: string;
  embeddingModel?: string;
  embeddingPrefilterPerView?: number;
};

type RawRgbImage = {
  data: Buffer;
  width: number;
  height: number;
  scaleFromOriginal: number;
  originalWidth: number;
  originalHeight: number;
};

type ReferenceView = {
  characterName: string;
  label: string;
  viewIndex: number;
  buffer: Buffer;
  aspectRatio: number;
  full: ImageFingerprint;
  head: ImageFingerprint;
  torso: ImageFingerprint;
  embedding?: number[];
};

type CandidateMatch = {
  score01: number;
  heuristicScore01: number;
  embeddingCosine?: number;
  reference: ReferenceView;
  rect: VisualMatcherRect;
  metrics: {
    full: VisualMatcherMetricBreakdown;
    head: VisualMatcherMetricBreakdown;
    torso: VisualMatcherMetricBreakdown;
  };
};

export type VisualMatcherMetricBreakdown = {
  score01: number;
  hueIntersection: number;
  rgbIntersection: number;
  luminanceIntersection: number;
  spatialCosine: number;
  edgeCosine: number;
  hashSimilarity: number;
};

export type VisualMatcherEmbeddingBreakdown = {
  model: string;
  cosine: number;
  score01: number;
  heuristicScore01: number;
  prefilterPerView: number;
};

type ImageFingerprint = {
  hueHist: number[];
  rgbHist: number[];
  luminanceHist: number[];
  spatial: number[];
  edge: number[];
  hashBits: Uint8Array;
};

type EmbeddingRuntime = {
  model: string;
  RawImage: new (
    data: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    channels: 1 | 2 | 3 | 4
  ) => unknown;
  extractor: (image: unknown, options?: Record<string, unknown>) => Promise<{
    data: Float32Array | number[];
    dims: number[];
  }>;
};

const PANEL_MAX_SIDE = 360;
const FINGERPRINT_GRID = 32;
const SPATIAL_GRID = 12;
const EDGE_GRID = 16;
const HASH_GRID = 16;
const HUE_BINS = 24;
const RGB_BINS_PER_CHANNEL = 4;
const LUMINANCE_BINS = 8;

const HEIGHT_SCALES = [0.22, 0.3, 0.39, 0.5, 0.64, 0.8, 0.96];
const WIDTH_SCALES = [0.18, 0.25, 0.34, 0.46, 0.6, 0.78, 0.96];
const TOP_CANDIDATES = 5;
const EMBEDDING_PREFILTER_PER_VIEW = 12;
const FULLER_CROP_TIE_SCORE_DELTA = 0.015;

const STRONG_MATCH_THRESHOLD = 74;
const SUSPICIOUS_THRESHOLD = 62;
const EMBEDDING_STRONG_COSINE_THRESHOLD = 0.6;
const EMBEDDING_SUSPICIOUS_COSINE_THRESHOLD = 0.52;
const embeddingRuntimeByModel = new Map<string, Promise<EmbeddingRuntime>>();

async function loadRawRgb(buffer: Buffer, maxSide: number): Promise<RawRgbImage> {
  const meta = await sharp(buffer).metadata();
  const originalWidth = meta.width || 1;
  const originalHeight = meta.height || 1;
  const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
  const resizedWidth = Math.max(1, Math.round(originalWidth * scale));
  const resizedHeight = Math.max(1, Math.round(originalHeight * scale));
  const { data, info } = await sharp(buffer)
    .resize(resizedWidth, resizedHeight, { fit: 'fill' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    scaleFromOriginal: scale,
    originalWidth,
    originalHeight,
  };
}

async function getEmbeddingRuntime(model: string): Promise<EmbeddingRuntime> {
  const cached = embeddingRuntimeByModel.get(model);
  if (cached) return cached;

  const loading = (async () => {
    const transformers = await import('@huggingface/transformers');
    const extractor = await transformers.pipeline('image-feature-extraction', model, { dtype: 'q8' });
    return {
      model,
      RawImage: transformers.RawImage as EmbeddingRuntime['RawImage'],
      extractor: extractor as EmbeddingRuntime['extractor'],
    };
  })();
  embeddingRuntimeByModel.set(model, loading);
  return loading;
}

async function rawImageForEmbedding(buffer: Buffer, runtime: EmbeddingRuntime): Promise<unknown> {
  const { data, info } = await sharp(buffer)
    .resize(224, 224, { fit: 'contain', background: '#ffffff' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new runtime.RawImage(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    Math.min(4, Math.max(1, info.channels)) as 1 | 2 | 3 | 4
  );
}

function normalizeEmbedding(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude <= 1e-9) return values.map(() => 0);
  return values.map((value) => value / magnitude);
}

function embeddingFromTensor(output: { data: Float32Array | number[]; dims: number[] }): number[] {
  const values = Array.from(output.data);
  if (output.dims.length === 3) {
    const tokenCount = output.dims[1] || 0;
    const dim = output.dims[2] || 0;
    if (tokenCount > 0 && dim > 0 && values.length >= dim) {
      return normalizeEmbedding(values.slice(0, dim));
    }
  }
  return normalizeEmbedding(values);
}

async function embedImageBuffer(buffer: Buffer, runtime: EmbeddingRuntime): Promise<number[]> {
  const rawImage = await rawImageForEmbedding(buffer, runtime);
  const output = await runtime.extractor(rawImage, { normalize: true });
  return embeddingFromTensor(output);
}

function embeddingCosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return clamp(dot, -1, 1);
}

function embeddingScore01(cosineSimilarity: number): number {
  return clamp((cosineSimilarity + 1) / 2, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRect(rect: VisualMatcherRect, image: RawRgbImage): VisualMatcherRect {
  return {
    left: clamp(rect.left, 0, Math.max(0, image.width - 1)),
    top: clamp(rect.top, 0, Math.max(0, image.height - 1)),
    width: clamp(rect.width, 1, image.width),
    height: clamp(rect.height, 1, image.height),
  };
}

function rectToOriginal(rect: VisualMatcherRect, image: RawRgbImage): VisualMatcherRect {
  const inv = image.scaleFromOriginal > 0 ? 1 / image.scaleFromOriginal : 1;
  return {
    left: Math.round(rect.left * inv),
    top: Math.round(rect.top * inv),
    width: Math.round(rect.width * inv),
    height: Math.round(rect.height * inv),
  };
}

function rectToRelative(rect: VisualMatcherRect, image: RawRgbImage): VisualMatcherRect {
  return {
    left: round3(rect.left / image.width),
    top: round3(rect.top / image.height),
    width: round3(rect.width / image.width),
    height: round3(rect.height / image.height),
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function sampleRgb(
  image: RawRgbImage,
  rect: VisualMatcherRect,
  gx: number,
  gy: number,
  grid: number
): [number, number, number] {
  const x = clamp(
    Math.floor(rect.left + ((gx + 0.5) / grid) * rect.width),
    0,
    image.width - 1
  );
  const y = clamp(
    Math.floor(rect.top + ((gy + 0.5) / grid) * rect.height),
    0,
    image.height - 1
  );
  const offset = (y * image.width + x) * 3;
  return [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!];
}

function normalizeVector(values: number[]): number[] {
  const mag = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (mag <= 1e-9) return values.map(() => 0);
  return values.map((value) => value / mag);
}

function normalizeHistogram(values: number[]): number[] {
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (sum <= 1e-9) return values.map(() => 0);
  return values.map((value) => value / sum);
}

function computeFingerprint(image: RawRgbImage, rawRect?: VisualMatcherRect): ImageFingerprint {
  const rect = normalizeRect(rawRect || { left: 0, top: 0, width: image.width, height: image.height }, image);
  const hueHist = Array(HUE_BINS).fill(0) as number[];
  const rgbHist = Array(RGB_BINS_PER_CHANNEL ** 3).fill(0) as number[];
  const luminanceHist = Array(LUMINANCE_BINS).fill(0) as number[];
  const spatial: number[] = [];
  const gray = Array(FINGERPRINT_GRID * FINGERPRINT_GRID).fill(0) as number[];

  for (let y = 0; y < FINGERPRINT_GRID; y++) {
    for (let x = 0; x < FINGERPRINT_GRID; x++) {
      const [r, g, b] = sampleRgb(image, rect, x, y, FINGERPRINT_GRID);
      const hsv = rgbToHsv(r, g, b);
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const colorWeight = clamp((hsv.s * 0.65 + chroma * 0.35) * (0.35 + hsv.v * 0.65), 0.04, 1);

      if (hsv.s > 0.08 && hsv.v > 0.08) {
        hueHist[Math.min(HUE_BINS - 1, Math.floor((hsv.h / 360) * HUE_BINS))] += colorWeight;
      }

      const rb = Math.min(RGB_BINS_PER_CHANNEL - 1, Math.floor((r / 256) * RGB_BINS_PER_CHANNEL));
      const gb = Math.min(RGB_BINS_PER_CHANNEL - 1, Math.floor((g / 256) * RGB_BINS_PER_CHANNEL));
      const bb = Math.min(RGB_BINS_PER_CHANNEL - 1, Math.floor((b / 256) * RGB_BINS_PER_CHANNEL));
      rgbHist[(rb * RGB_BINS_PER_CHANNEL + gb) * RGB_BINS_PER_CHANNEL + bb] += 0.25 + colorWeight;
      luminanceHist[Math.min(LUMINANCE_BINS - 1, Math.floor(lum * LUMINANCE_BINS))] += 1;
      gray[y * FINGERPRINT_GRID + x] = lum;
    }
  }

  for (let y = 0; y < SPATIAL_GRID; y++) {
    for (let x = 0; x < SPATIAL_GRID; x++) {
      const [r, g, b] = sampleRgb(image, rect, x, y, SPATIAL_GRID);
      const hsv = rgbToHsv(r, g, b);
      const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      const weight = clamp(0.15 + hsv.s * 0.45 + chroma * 0.4, 0.08, 1);
      spatial.push((r / 255) * weight, (g / 255) * weight, (b / 255) * weight);
    }
  }

  const edge: number[] = [];
  for (let y = 0; y < EDGE_GRID; y++) {
    for (let x = 0; x < EDGE_GRID; x++) {
      const gx = Math.min(FINGERPRINT_GRID - 2, Math.max(1, Math.floor(((x + 0.5) / EDGE_GRID) * FINGERPRINT_GRID)));
      const gy = Math.min(FINGERPRINT_GRID - 2, Math.max(1, Math.floor(((y + 0.5) / EDGE_GRID) * FINGERPRINT_GRID)));
      const dx =
        gray[(gy - 1) * FINGERPRINT_GRID + (gx + 1)] +
        2 * gray[gy * FINGERPRINT_GRID + (gx + 1)] +
        gray[(gy + 1) * FINGERPRINT_GRID + (gx + 1)] -
        gray[(gy - 1) * FINGERPRINT_GRID + (gx - 1)] -
        2 * gray[gy * FINGERPRINT_GRID + (gx - 1)] -
        gray[(gy + 1) * FINGERPRINT_GRID + (gx - 1)];
      const dy =
        gray[(gy + 1) * FINGERPRINT_GRID + (gx - 1)] +
        2 * gray[(gy + 1) * FINGERPRINT_GRID + gx] +
        gray[(gy + 1) * FINGERPRINT_GRID + (gx + 1)] -
        gray[(gy - 1) * FINGERPRINT_GRID + (gx - 1)] -
        2 * gray[(gy - 1) * FINGERPRINT_GRID + gx] -
        gray[(gy - 1) * FINGERPRINT_GRID + (gx + 1)];
      edge.push(Math.sqrt(dx * dx + dy * dy));
    }
  }

  const hashSamples: number[] = [];
  for (let y = 0; y < HASH_GRID; y++) {
    for (let x = 0; x < HASH_GRID; x++) {
      const [r, g, b] = sampleRgb(image, rect, x, y, HASH_GRID);
      hashSamples.push((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
    }
  }
  const avg = hashSamples.reduce((sum, value) => sum + value, 0) / hashSamples.length;
  const hashBits = Uint8Array.from(hashSamples.map((value) => (value >= avg ? 1 : 0)));

  return {
    hueHist: normalizeHistogram(hueHist),
    rgbHist: normalizeHistogram(rgbHist),
    luminanceHist: normalizeHistogram(luminanceHist),
    spatial: normalizeVector(spatial),
    edge: normalizeVector(edge),
    hashBits,
  };
}

function histogramIntersection(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += Math.min(a[i]!, b[i]!);
  return clamp(sum, 0, 1);
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return clamp(dot, 0, 1);
}

function hashSimilarity(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let same = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) same++;
  }
  return same / n;
}

function compareFingerprints(a: ImageFingerprint, b: ImageFingerprint): VisualMatcherMetricBreakdown {
  const hueIntersection = histogramIntersection(a.hueHist, b.hueHist);
  const rgbIntersection = histogramIntersection(a.rgbHist, b.rgbHist);
  const luminanceIntersection = histogramIntersection(a.luminanceHist, b.luminanceHist);
  const spatialCosine = cosine(a.spatial, b.spatial);
  const edgeCosine = cosine(a.edge, b.edge);
  const hash = hashSimilarity(a.hashBits, b.hashBits);
  const score01 =
    0.28 * hueIntersection +
    0.22 * rgbIntersection +
    0.1 * luminanceIntersection +
    0.22 * spatialCosine +
    0.12 * edgeCosine +
    0.06 * hash;

  return {
    score01: clamp(score01, 0, 1),
    hueIntersection,
    rgbIntersection,
    luminanceIntersection,
    spatialCosine,
    edgeCosine,
    hashSimilarity: hash,
  };
}

function partRect(rect: VisualMatcherRect, kind: 'head' | 'torso'): VisualMatcherRect {
  if (kind === 'head') {
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: Math.max(1, rect.height * 0.42),
    };
  }
  return {
    left: rect.left,
    top: rect.top + rect.height * 0.28,
    width: rect.width,
    height: Math.max(1, rect.height * 0.5),
  };
}

function compareCandidateToReference(
  panel: RawRgbImage,
  rect: VisualMatcherRect,
  reference: ReferenceView
): CandidateMatch {
  const full = compareFingerprints(computeFingerprint(panel, rect), reference.full);
  const head = compareFingerprints(computeFingerprint(panel, partRect(rect, 'head')), reference.head);
  const torso = compareFingerprints(computeFingerprint(panel, partRect(rect, 'torso')), reference.torso);
  const score01 = 0.56 * full.score01 + 0.22 * head.score01 + 0.22 * torso.score01;
  return { score01, heuristicScore01: score01, reference, rect, metrics: { full, head, torso } };
}

function generateCandidateRects(panel: RawRgbImage, referenceAspectRatio: number): VisualMatcherRect[] {
  const rects: VisualMatcherRect[] = [];
  const seen = new Set<string>();
  const addRect = (left: number, top: number, width: number, height: number) => {
    if (width < 24 || height < 24) return;
    if (width > panel.width || height > panel.height) return;
    const l = Math.round(clamp(left, 0, panel.width - width));
    const t = Math.round(clamp(top, 0, panel.height - height));
    const w = Math.round(width);
    const h = Math.round(height);
    const key = `${l}:${t}:${w}:${h}`;
    if (seen.has(key)) return;
    seen.add(key);
    rects.push({ left: l, top: t, width: w, height: h });
  };

  for (const heightScale of HEIGHT_SCALES) {
    const height = panel.height * heightScale;
    const width = height * referenceAspectRatio;
    const step = Math.max(10, Math.round(Math.min(width, height) * 0.22));
    for (let top = 0; top <= panel.height - height; top += step) {
      for (let left = 0; left <= panel.width - width; left += step) {
        addRect(left, top, width, height);
      }
    }
    addRect((panel.width - width) / 2, (panel.height - height) / 2, width, height);
  }

  for (const widthScale of WIDTH_SCALES) {
    const width = panel.width * widthScale;
    const height = width / Math.max(0.2, referenceAspectRatio);
    const step = Math.max(10, Math.round(Math.min(width, height) * 0.22));
    for (let top = 0; top <= panel.height - height; top += step) {
      for (let left = 0; left <= panel.width - width; left += step) {
        addRect(left, top, width, height);
      }
    }
    addRect((panel.width - width) / 2, (panel.height - height) / 2, width, height);
  }

  return rects;
}

async function makeReferenceViews(reference: CharacterVisualMatcherReference): Promise<ReferenceView[]> {
  const meta = await sharp(reference.imageData).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  const looksLikeSheet = width / height >= 1.55;
  const viewCount = looksLikeSheet ? 4 : 1;
  const labels = ['front', 'three_quarter', 'side', 'back'];
  const views: ReferenceView[] = [];

  for (let i = 0; i < viewCount; i++) {
    const segmentWidth = Math.floor(width / viewCount);
    const left = Math.min(Math.max(0, i * segmentWidth), Math.max(0, width - 1));
    const cropWidth = Math.max(
      1,
      Math.min(i === viewCount - 1 ? width - left : segmentWidth, width - left)
    );
    const labelBand = looksLikeSheet ? Math.min(Math.round(height * 0.17), 160) : 0;
    const cropHeight = Math.max(1, Math.min(height, height - labelBand));
    let viewBuffer: Buffer;
    try {
      const segmentBuffer = await sharp(reference.imageData)
        .extract({ left, top: 0, width: cropWidth, height: cropHeight })
        .png()
        .toBuffer();
      viewBuffer = await sharp(segmentBuffer)
        .trim({ background: '#ffffff', threshold: 22 })
        .png()
        .toBuffer();
    } catch {
      viewBuffer = await sharp(reference.imageData)
        .trim({ background: '#ffffff', threshold: 22 })
        .png()
        .toBuffer();
    }
    const trimmedMeta = await sharp(viewBuffer).metadata();
    if (!trimmedMeta.width || !trimmedMeta.height) {
      viewBuffer = await sharp(reference.imageData).png().toBuffer();
    }
    const viewMeta = await sharp(viewBuffer).metadata();
    const aspectRatio = (viewMeta.width || 1) / (viewMeta.height || 1);
    const buffer = await sharp(viewBuffer)
      .resize(192, 192, { fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();
    const raw = await loadRawRgb(buffer, 192);
    const rect = { left: 0, top: 0, width: raw.width, height: raw.height };
    views.push({
      characterName: reference.characterName,
      label: labels[i] || `view_${i + 1}`,
      viewIndex: i + 1,
      buffer,
      aspectRatio,
      full: computeFingerprint(raw, rect),
      head: computeFingerprint(raw, partRect(rect, 'head')),
      torso: computeFingerprint(raw, partRect(rect, 'torso')),
    });
  }

  return views;
}

function verdictForScore(score: number): CharacterVisualMatcherResult['verdict'] {
  if (score >= STRONG_MATCH_THRESHOLD) return 'strong_match';
  if (score < SUSPICIOUS_THRESHOLD) return 'suspicious';
  return 'uncertain';
}

function verdictForMatch(
  match: CandidateMatch,
  hasEmbedding: boolean
): CharacterVisualMatcherResult['verdict'] {
  if (!hasEmbedding || match.embeddingCosine == null) {
    return verdictForScore(match.score01 * 100);
  }
  if (match.embeddingCosine >= EMBEDDING_STRONG_COSINE_THRESHOLD) return 'strong_match';
  if (match.embeddingCosine < EMBEDDING_SUSPICIOUS_COSINE_THRESHOLD) return 'suspicious';
  return 'uncertain';
}

async function writeDebugCrop(
  panelBuffer: Buffer,
  rect: VisualMatcherRect,
  outputPath: string
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const meta = await sharp(panelBuffer).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  const extract = {
    left: Math.round(clamp(rect.left, 0, width - 1)),
    top: Math.round(clamp(rect.top, 0, height - 1)),
    width: Math.round(clamp(rect.width, 1, width - rect.left)),
    height: Math.round(clamp(rect.height, 1, height - rect.top)),
  };
  await sharp(panelBuffer).extract(extract).png().toFile(outputPath);
}

async function extractPanelCropBuffer(
  panelBuffer: Buffer,
  rect: VisualMatcherRect
): Promise<Buffer> {
  const meta = await sharp(panelBuffer).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;
  const left = Math.round(clamp(rect.left, 0, width - 1));
  const top = Math.round(clamp(rect.top, 0, height - 1));
  const extract = {
    left,
    top,
    width: Math.round(clamp(rect.width, 1, width - left)),
    height: Math.round(clamp(rect.height, 1, height - top)),
  };
  return sharp(panelBuffer).extract(extract).png().toBuffer();
}

async function rankMatchesWithEmbeddings(params: {
  panelImage: Buffer;
  panel: RawRgbImage;
  matchesByView: CandidateMatch[][];
  model: string;
  prefilterPerView: number;
}): Promise<CandidateMatch[]> {
  const runtime = await getEmbeddingRuntime(params.model);
  const candidates: CandidateMatch[] = [];
  const seen = new Set<string>();

  for (const viewMatches of params.matchesByView) {
    const sorted = [...viewMatches].sort((a, b) => b.heuristicScore01 - a.heuristicScore01);
    for (const match of sorted.slice(0, params.prefilterPerView)) {
      const key = [
        match.reference.characterName,
        match.reference.viewIndex,
        match.rect.left,
        match.rect.top,
        match.rect.width,
        match.rect.height,
      ].join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(match);
    }
  }

  const referenceViews = new Set(candidates.map((candidate) => candidate.reference));
  await Promise.all(
    [...referenceViews].map(async (reference) => {
      reference.embedding = await embedImageBuffer(reference.buffer, runtime);
    })
  );

  for (const candidate of candidates) {
    const crop = await extractPanelCropBuffer(
      params.panelImage,
      rectToOriginal(candidate.rect, params.panel)
    );
    const candidateEmbedding = await embedImageBuffer(crop, runtime);
    const cosineSimilarity = embeddingCosine(candidate.reference.embedding || [], candidateEmbedding);
    candidate.embeddingCosine = cosineSimilarity;
    candidate.score01 = embeddingScore01(cosineSimilarity);
  }

  candidates.sort((a, b) => b.score01 - a.score01);
  return candidates;
}

function safeFileName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'character';
}

export async function matchPanelCharactersVisually(params: {
  panelImage: Buffer;
  references: CharacterVisualMatcherReference[];
  expectedCharacterNames: string[];
  options?: CharacterVisualMatcherOptions;
}): Promise<CharacterVisualMatcherPanelResult> {
  const panel = await loadRawRgb(params.panelImage, PANEL_MAX_SIDE);
  const referencesByName = new Map<string, CharacterVisualMatcherReference>();
  for (const reference of params.references) {
    referencesByName.set(reference.characterName.trim().toLowerCase(), reference);
  }

  const characters: CharacterVisualMatcherResult[] = [];
  for (const name of params.expectedCharacterNames) {
    const reference =
      referencesByName.get(name.trim().toLowerCase()) ||
      [...referencesByName.entries()].find(([key]) => key.includes(name.trim().toLowerCase()))?.[1];
    if (!reference) continue;

    const views = await makeReferenceViews(reference);
    const topMatches: CandidateMatch[] = [];
    const matchesByView: CandidateMatch[][] = [];
    for (const view of views) {
      const viewMatches: CandidateMatch[] = [];
      const rects = generateCandidateRects(panel, view.aspectRatio);
      for (const rect of rects) {
        const match = compareCandidateToReference(panel, rect, view);
        topMatches.push(match);
        viewMatches.push(match);
      }
      matchesByView.push(viewMatches);
    }

    const prefilterPerView = Math.max(
      1,
      Math.round(params.options?.embeddingPrefilterPerView || EMBEDDING_PREFILTER_PER_VIEW)
    );
    const rankedMatches = params.options?.embeddingModel
      ? await rankMatchesWithEmbeddings({
          panelImage: params.panelImage,
          panel,
          matchesByView,
          model: params.options.embeddingModel,
          prefilterPerView,
        })
      : topMatches.sort((a, b) => b.score01 - a.score01);

    const highestScore = rankedMatches[0]?.score01 ?? 0;
    const best = rankedMatches
      .filter((match) => highestScore - match.score01 <= FULLER_CROP_TIE_SCORE_DELTA)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0];
    if (!best) continue;

    const originalRect = rectToOriginal(best.rect, panel);
    const hasEmbedding = !!params.options?.embeddingModel;
    const result: CharacterVisualMatcherResult = {
      characterName: name,
      verdict: verdictForMatch(best, hasEmbedding),
      score: Math.round(best.score01 * 1000) / 10,
      bestReferenceView: best.reference.viewIndex,
      bestReferenceLabel: best.reference.label,
      bestCrop: originalRect,
      bestCropRelative: rectToRelative(best.rect, panel),
      metrics: {
        full: roundMetrics(best.metrics.full),
        head: roundMetrics(best.metrics.head),
        torso: roundMetrics(best.metrics.torso),
        overallScore01: round3(best.score01),
        ...(params.options?.embeddingModel
          ? {
              embedding: {
                model: params.options.embeddingModel,
                cosine: round3(best.embeddingCosine ?? best.score01 * 2 - 1),
                score01: round3(best.score01),
                heuristicScore01: round3(best.heuristicScore01),
                prefilterPerView,
              },
            }
          : {}),
      },
      topCandidates: rankedMatches.slice(0, TOP_CANDIDATES).map((match) => ({
        score: Math.round(match.score01 * 1000) / 10,
        ...(params.options?.embeddingModel
          ? {
              heuristicScore: Math.round(match.heuristicScore01 * 1000) / 10,
              embeddingCosine: round3(match.embeddingCosine ?? match.score01 * 2 - 1),
            }
          : {}),
        referenceView: match.reference.viewIndex,
        referenceLabel: match.reference.label,
        cropRelative: rectToRelative(match.rect, panel),
      })),
    };
    characters.push(result);

    if (params.options?.dumpDir) {
      const out = path.join(
        params.options.dumpDir,
        `${safeFileName(name)}_${result.score}_${result.bestReferenceLabel}.png`
      );
      await writeDebugCrop(params.panelImage, originalRect, out);
    }
  }

  return {
    panelWidth: panel.originalWidth,
    panelHeight: panel.originalHeight,
    characters,
  };
}

function roundMetrics(metrics: VisualMatcherMetricBreakdown): VisualMatcherMetricBreakdown {
  return {
    score01: round3(metrics.score01),
    hueIntersection: round3(metrics.hueIntersection),
    rgbIntersection: round3(metrics.rgbIntersection),
    luminanceIntersection: round3(metrics.luminanceIntersection),
    spatialCosine: round3(metrics.spatialCosine),
    edgeCosine: round3(metrics.edgeCosine),
    hashSimilarity: round3(metrics.hashSimilarity),
  };
}
