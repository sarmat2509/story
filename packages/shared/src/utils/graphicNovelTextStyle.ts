export interface GraphicNovelTextStyleInput {
  fontSizePx?: number | null;
  lineHeightPx?: number | null;
  paddingXPx?: number | null;
  paddingYPx?: number | null;
  targetPageWidthPx?: number | null;
  targetPageHeightPx?: number | null;
}

export interface GraphicNovelPageSizeInput {
  width?: number | null;
  height?: number | null;
}

export interface ResolvedGraphicNovelTextStyle {
  fontSizePx: number;
  lineHeightPx: number;
  paddingXPx: number;
  paddingYPx: number;
  targetPageWidthPx: number;
  targetPageHeightPx: number;
}

export interface ScaledGraphicNovelTextStyle {
  fontSizePx: number;
  lineHeightPx: number;
  paddingXPx: number;
  paddingYPx: number;
}

const positiveNumberOr = (value: number | null | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/**
 * Resolves the persisted comic overlay typography contract. Both the dynamic
 * app renderer and SSR must use these same defaults before scaling.
 */
export function resolveGraphicNovelTextStyle(
  textStyle?: GraphicNovelTextStyleInput | null,
  pageSize?: GraphicNovelPageSizeInput | null
): ResolvedGraphicNovelTextStyle {
  const pageWidth = positiveNumberOr(pageSize?.width, 1024);
  const pageHeight = positiveNumberOr(pageSize?.height, 1536);

  return {
    fontSizePx: positiveNumberOr(textStyle?.fontSizePx, 20),
    lineHeightPx: positiveNumberOr(textStyle?.lineHeightPx, 23),
    paddingXPx: positiveNumberOr(textStyle?.paddingXPx, 14),
    paddingYPx: positiveNumberOr(textStyle?.paddingYPx, 6),
    targetPageWidthPx: positiveNumberOr(textStyle?.targetPageWidthPx, pageWidth),
    targetPageHeightPx: positiveNumberOr(textStyle?.targetPageHeightPx, pageHeight),
  };
}

/** Matches the React Native renderer's `renderedWidth / targetPageWidthPx`. */
export function scaleGraphicNovelTextStyle(
  textStyle: ResolvedGraphicNovelTextStyle,
  renderedPageWidthPx: number
): ScaledGraphicNovelTextStyle {
  const scale = positiveNumberOr(renderedPageWidthPx, textStyle.targetPageWidthPx)
    / textStyle.targetPageWidthPx;

  return {
    fontSizePx: textStyle.fontSizePx * scale,
    lineHeightPx: textStyle.lineHeightPx * scale,
    paddingXPx: textStyle.paddingXPx * scale,
    paddingYPx: textStyle.paddingYPx * scale,
  };
}

/**
 * CSS container-query units are the SSR equivalent of the dynamic width
 * measurement: 100cqw is the rendered comic canvas width.
 */
export function graphicNovelTextStyleContainerUnit(
  valuePx: number,
  targetPageWidthPx: number
): string {
  const value = positiveNumberOr(valuePx, 1);
  const targetWidth = positiveNumberOr(targetPageWidthPx, 1024);
  return `${Number(((value / targetWidth) * 100).toFixed(6))}cqw`;
}
