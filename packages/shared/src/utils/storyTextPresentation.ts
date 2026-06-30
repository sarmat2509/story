export const STORY_TEXT_SIZE_MULTIPLIER_STEPS = [0.9, 0.95, 1, 1.05, 1.1] as const;

export const DEFAULT_STORY_TEXT_SIZE_MULTIPLIER = 1;
export const MIN_STORY_TEXT_SIZE_MULTIPLIER = STORY_TEXT_SIZE_MULTIPLIER_STEPS[0];
export const MAX_STORY_TEXT_SIZE_MULTIPLIER =
  STORY_TEXT_SIZE_MULTIPLIER_STEPS[STORY_TEXT_SIZE_MULTIPLIER_STEPS.length - 1];

export type StoryTextSizeMultiplier = (typeof STORY_TEXT_SIZE_MULTIPLIER_STEPS)[number];

export function isStoryTextSizeMultiplierStep(
  value: unknown
): value is StoryTextSizeMultiplier {
  return (
    typeof value === 'number' &&
    STORY_TEXT_SIZE_MULTIPLIER_STEPS.some((step) => Math.abs(step - value) < 0.001)
  );
}

export function normalizeStoryTextSizeMultiplier(value: unknown): StoryTextSizeMultiplier {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    return DEFAULT_STORY_TEXT_SIZE_MULTIPLIER;
  }

  return STORY_TEXT_SIZE_MULTIPLIER_STEPS.reduce((closest, step) =>
    Math.abs(step - numeric) < Math.abs(closest - numeric) ? step : closest
  );
}

export function getBaseStoryTextSizePxForAgeYears(ageYears: number | null | undefined): number {
  if (typeof ageYears !== 'number' || !Number.isFinite(ageYears)) return 18;
  if (ageYears >= 10) return 18;
  if (ageYears >= 8) return 20;
  if (ageYears >= 6) return 22;
  if (ageYears >= 5) return 24;
  return 26;
}

export function getBaseStoryTextSizePxForAgeGroup(ageGroup: string | null | undefined): number {
  switch (ageGroup) {
    case '1y':
    case '2-3':
    case '4-5':
      return 26;
    case '6-8':
      return 22;
    case '9-12':
      return 18;
    default:
      return 18;
  }
}

export function getStoryTextSizePx(
  baseTextSizePx: number,
  multiplier: unknown = DEFAULT_STORY_TEXT_SIZE_MULTIPLIER
): number {
  const normalizedMultiplier = normalizeStoryTextSizeMultiplier(multiplier);
  return Math.round(baseTextSizePx * normalizedMultiplier);
}
