/**
 * Apply LLM "index JSON" prosody insertions (UTF-16 offsets + bracket inner) onto canonical text.
 */

import type { TtsSpeechTagCatalog } from '../providers/base/TtsSpeechTagCatalog';
import { sanitizeVendorMarkup, tagKey } from './ttsProsodyTaggedText';

function resolveCatalogBracketInner(rawInner: string, catalog: TtsSpeechTagCatalog): string | null {
  const k = tagKey(rawInner);
  for (const allowed of catalog.inlineBracketTags) {
    if (tagKey(allowed) === k) return allowed;
  }
  return null;
}

/**
 * Insert catalog `[...]` tags at UTF-16 offsets into `canonText` (bracket-only catalogs).
 * Offsets refer to the **original** `canonText` (multiple insertions are applied high-to-low index).
 * Returns null when nothing valid to apply.
 */
export function applyDeferredProsodyIndexInsertions(
  canonText: string,
  rawInsertions: unknown,
  catalog: TtsSpeechTagCatalog
): string | null {
  if (catalog.wrappingTagNames.length > 0) return null;
  if (!Array.isArray(rawInsertions)) return null;

  type Row = { pos: number; literal: string };
  const rows: Row[] = [];

  for (const item of rawInsertions) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const pos = o.utf16OffsetBefore;
    const inner = o.tagInner;
    if (typeof pos !== 'number' || !Number.isInteger(pos)) continue;
    if (pos < 0 || pos > canonText.length) continue;
    if (typeof inner !== 'string') continue;
    const canonInner = resolveCatalogBracketInner(inner, catalog);
    if (!canonInner) continue;
    rows.push({ pos, literal: `[${canonInner}]` });
  }

  if (rows.length === 0) return null;

  const byPos = new Map<number, string[]>();
  for (const r of rows) {
    const arr = byPos.get(r.pos) ?? [];
    arr.push(r.literal);
    byPos.set(r.pos, arr);
  }

  let out = canonText;
  const positions = [...byPos.keys()].sort((a, b) => b - a);
  for (const p of positions) {
    const block = (byPos.get(p) ?? []).join('');
    out = out.slice(0, p) + block + out.slice(p);
  }
  const { text } = sanitizeVendorMarkup(out, catalog);
  return text;
}
