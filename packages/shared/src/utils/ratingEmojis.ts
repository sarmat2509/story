/** 5-point story rating emoji scale (1 = worst, 5 = best) */
export const RATING_EMOJIS = ['😢', '😕', '😐', '😊', '😍'] as const;

export function emojiForAvg(avg: number): string {
  const idx = Math.round(avg) - 1;
  return RATING_EMOJIS[Math.max(0, Math.min(idx, 4))];
}
