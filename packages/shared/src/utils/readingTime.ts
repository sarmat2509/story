/**
 * Reading time estimation for stories read aloud to children.
 * Uses CPM (characters per minute) - universal across languages (IReST study: ~863 CPM oral reading).
 * 800 CPM for slower, expressive reading to children.
 */
const CPM_READING_ALOUD = 800;

export function getReadingTimeMinutes(scenes: Array<{ text: string }>): number {
  const fullText = scenes
    .map((s) => (s.text || '').replace(/\[[\w\s]+\]/g, ''))
    .join('');
  const charCount = fullText.length;
  if (charCount === 0) return 0;
  return Math.max(1, Math.round(charCount / CPM_READING_ALOUD));
}
