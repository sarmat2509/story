import sharp from 'sharp';

/** Maximum payload sent to a reader for one full comic page. */
export const GRAPHIC_NOVEL_PAGE_DISPLAY_MAX_BYTES = Math.round(1.5 * 1024 * 1024);

const DISPLAY_QUALITIES = [90, 86, 82, 78, 74, 70] as const;
const DISPLAY_SCALES = [1, 0.9, 0.8, 0.7, 0.6] as const;

export type GraphicNovelPageDisplayImage = {
  data: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  quality: number;
  scale: number;
  fileSizeBytes: number;
};

/**
 * Produces the reader-facing copy of a comic page. The original page PNG is
 * intentionally kept separately for editing, validation, and recomposition.
 */
export async function optimizeGraphicNovelPageForDisplay(
  imageData: Buffer
): Promise<GraphicNovelPageDisplayImage> {
  const metadata = await sharp(imageData, { animated: false }).metadata();
  const sourceWidth = metadata.width ?? 1;
  const sourceHeight = metadata.height ?? 1;
  let smallestCandidate: GraphicNovelPageDisplayImage | null = null;

  for (const scale of DISPLAY_SCALES) {
    for (const quality of DISPLAY_QUALITIES) {
      const pipeline = sharp(imageData, { animated: false }).rotate();
      if (scale < 1) {
        pipeline.resize({
          width: Math.max(1, Math.round(sourceWidth * scale)),
          height: Math.max(1, Math.round(sourceHeight * scale)),
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      const encoded = await pipeline
        .webp({ quality, effort: 6, alphaQuality: 100 })
        .toBuffer({ resolveWithObject: true });
      const candidate: GraphicNovelPageDisplayImage = {
        data: encoded.data,
        mimeType: 'image/webp',
        width: encoded.info.width,
        height: encoded.info.height,
        quality,
        scale,
        fileSizeBytes: encoded.data.length,
      };
      smallestCandidate = candidate;

      if (candidate.fileSizeBytes <= GRAPHIC_NOVEL_PAGE_DISPLAY_MAX_BYTES) {
        return candidate;
      }
    }
  }

  // The final candidate is deliberately small enough for practical use even
  // for unusually noisy generated art. Keep serving it rather than failing a
  // completed comic page solely because the display derivative is oversized.
  return smallestCandidate!;
}

type GraphicNovelPageImageSource = {
  imageUrl?: string | null;
  generationParams?: unknown;
};

/** Prefer the compact reader asset while preserving the original page URL. */
export function graphicNovelPageDisplayImageUrl(page: GraphicNovelPageImageSource): string | null {
  const params = page.generationParams;
  if (params && typeof params === 'object') {
    const source = params as Record<string, unknown>;
    if (typeof source.displayImageUrl === 'string' && source.displayImageUrl.trim()) {
      return source.displayImageUrl;
    }
    if (typeof source.displayImageStoragePath === 'string' && source.displayImageStoragePath.trim()) {
      return source.displayImageStoragePath;
    }
  }
  return page.imageUrl ?? null;
}
