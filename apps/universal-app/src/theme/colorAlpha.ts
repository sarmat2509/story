/**
 * Convert #RRGGBB to `rgba(...)` for shadows, overlays, and web box-shadow.
 */
export function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) {
    return `rgba(0,0,0,${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(0,0,0,${alpha})`;
  }
  return `rgba(${r},${g},${b},${alpha})`;
}
