/**
 * Project catalog-approved prosody tags from an LLM-tagged variant onto canonical narration.
 *
 * Lexical text in the LLM reply may drift; we only trust tag literals and their *order*,
 * then map insertion points via edit alignment between normalized stripped LLM text and canon.
 */

import type { TtsSpeechTagCatalog } from '../providers/base/TtsSpeechTagCatalog';
import { logger } from './logger';
import type { ChSrc } from './ttsProsodyCanonRepair';
import { provenanceCanonPlain } from './ttsProsodyCanonRepair';
import {
  normalizeCanonLikeAudioDomain,
  sanitizeVendorMarkup,
  stripApprovedCatalogMarkup,
  tagKey,
  validateTaggedAgainstCanon,
} from './ttsProsodyTaggedText';

export type ProsodyTagProjectionResult = {
  text: string;
  ok: boolean;
  reason?:
    | 'already_valid'
    | 'no_tags'
    | 'wrap_catalog_unsupported'
    | 'provenance_failed'
    | 'align_budget'
    | 'post_validate_failed';
  /** Approved bracket tags found in the sanitized LLM string */
  tagCount?: number;
};

const MAX_ALIGN_CELLS = 22_000_000; // ~4.7k × 4.7k — guardrail for pathological chunks

type BdryMove = 'diag' | 'up' | 'left';

function utf16BeforeNormalizedIndex(
  canonPlain: string,
  prov: ChSrc[] | null,
  normIdx: number
): number {
  if (!prov || prov.length === 0) {
    return normIdx <= 0 ? 0 : canonPlain.length;
  }
  if (normIdx <= 0) return 0;
  if (normIdx >= prov.length) return canonPlain.length;
  return prov[normIdx]!.src;
}

/**
 * Levenshtein alignment: map each boundary in `llm` (0..llm.length) to a boundary index in `canon` (0..canon.length).
 * Tie-break: prefer match (diag), then delete-from-llm (up), then insert-into-canon (left).
 */
function alignmentBoundaryMap(llm: string, canon: string): Uint32Array | null {
  const n = llm.length;
  const m = canon.length;
  if ((n + 1) * (m + 1) > MAX_ALIGN_CELLS) return null;
  const row = m + 1;
  const cells = (n + 1) * row;
  const dp = new Uint32Array(cells);
  const back = new Uint8Array(cells); // 0 diag, 1 up, 2 left

  const I = (i: number, j: number) => i * row + j;

  for (let j = 0; j <= m; j++) {
    dp[I(0, j)] = j;
  }
  for (let i = 0; i <= n; i++) {
    dp[I(i, 0)] = i;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cSub = dp[I(i - 1, j - 1)] + (llm[i - 1] === canon[j - 1] ? 0 : 1);
      const cDel = dp[I(i - 1, j)] + 1;
      const cIns = dp[I(i, j - 1)] + 1;

      let choice: 0 | 1 | 2 = 0;
      let best = cSub;
      if (cDel < best) {
        best = cDel;
        choice = 1;
      }
      if (cIns < best) {
        best = cIns;
        choice = 2;
      }
      if (cSub === best) choice = 0;
      else if (cDel === best) choice = 1;
      else choice = 2;

      dp[I(i, j)] = best;
      back[I(i, j)] = choice;
    }
  }

  const moves: BdryMove[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i === 0) {
      moves.push('left');
      j--;
      continue;
    }
    if (j === 0) {
      moves.push('up');
      i--;
      continue;
    }
    const ch = back[I(i, j)]!;
    if (ch === 0) {
      moves.push('diag');
      i--;
      j--;
    } else if (ch === 1) {
      moves.push('up');
      i--;
    } else {
      moves.push('left');
      j--;
    }
  }
  moves.reverse();

  const bdry = new Uint32Array(n + 1);
  bdry[0] = 0;
  let pi = 0;
  let pj = 0;
  for (const mv of moves) {
    if (mv === 'diag') {
      bdry[pi + 1] = pj + 1;
      pi++;
      pj++;
    } else if (mv === 'up') {
      bdry[pi + 1] = pj;
      pi++;
    } else {
      pj++;
      bdry[pi] = pj;
    }
  }
  return bdry;
}

function countApprovedBracketTags(tagged: string, catalog: TtsSpeechTagCatalog): number {
  const whitelist = new Set(catalog.inlineBracketTags.map((t) => tagKey(t)));
  let n = 0;
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagged)) !== null) {
    if (whitelist.has(tagKey(m[1] ?? ''))) n++;
  }
  return n;
}

/**
 * Extract `(normOffsetBefore, literal)` for each approved `[...]` in document order.
 * `normOffsetBefore` is measured in `normalizeCanonLikeAudioDomain(stripApprovedCatalogMarkup(prefix), language)`.
 */
function collectBracketTagInsertPoints(
  taggedSanitized: string,
  catalog: TtsSpeechTagCatalog,
  language: string
): Array<{ normOffsetBefore: number; literal: string }> {
  const whitelist = new Set(catalog.inlineBracketTags.map((t) => tagKey(t)));
  const out: Array<{ normOffsetBefore: number; literal: string }> = [];
  let i = 0;
  while (i < taggedSanitized.length) {
    if (taggedSanitized[i] === '[') {
      const close = taggedSanitized.indexOf(']', i);
      if (close < 0) {
        i++;
        continue;
      }
      const inner = taggedSanitized.slice(i + 1, close);
      const literal = taggedSanitized.slice(i, close + 1);
      if (whitelist.has(tagKey(inner))) {
        const prefixTagged = taggedSanitized.slice(0, i);
        const strippedPrefix = stripApprovedCatalogMarkup(prefixTagged, catalog);
        const normOffsetBefore = normalizeCanonLikeAudioDomain(strippedPrefix, language).length;
        out.push({ normOffsetBefore, literal });
        i = close + 1;
        continue;
      }
      i++;
      continue;
    }
    i++;
  }
  return out;
}

/**
 * Insert only catalog `[...]` tags from `taggedSanitized` onto `canonPlain` using normalized edit alignment.
 * Wrapping-tag catalogs are not supported yet (`markupModel === 'bracket_and_angle_wrap'` → ok:false).
 */
export function projectApprovedBracketTagsOntoCanon(
  taggedSanitized: string,
  canonPlain: string,
  catalog: TtsSpeechTagCatalog,
  language: string
): ProsodyTagProjectionResult {
  if (catalog.wrappingTagNames.length > 0) {
    return { text: canonPlain, ok: false, reason: 'wrap_catalog_unsupported' };
  }

  if (validateTaggedAgainstCanon(taggedSanitized, canonPlain, catalog, language)) {
    return { text: taggedSanitized, ok: true, reason: 'already_valid' };
  }

  const tagCount = countApprovedBracketTags(taggedSanitized, catalog);
  if (tagCount === 0) {
    return { text: canonPlain, ok: false, reason: 'no_tags', tagCount: 0 };
  }

  const llmStripped = stripApprovedCatalogMarkup(taggedSanitized, catalog);
  const llmNorm = normalizeCanonLikeAudioDomain(llmStripped, language);
  const canonNorm = normalizeCanonLikeAudioDomain(canonPlain, language);

  const bdry = alignmentBoundaryMap(llmNorm, canonNorm);
  if (!bdry) {
    return { text: canonPlain, ok: false, reason: 'align_budget', tagCount };
  }

  const prov = provenanceCanonPlain(canonPlain, language);
  if (!prov || prov.length !== canonNorm.length) {
    logger.warn(
      { llmLen: llmNorm.length, canonLen: canonNorm.length, provLen: prov?.length },
      'Prosody tag projection: canon provenance length mismatch; skip'
    );
    return { text: canonPlain, ok: false, reason: 'provenance_failed', tagCount };
  }

  const inserts = collectBracketTagInsertPoints(taggedSanitized, catalog, language);

  const byUtf16 = new Map<number, string[]>();
  for (const { normOffsetBefore, literal } of inserts) {
    const o = Math.max(0, Math.min(normOffsetBefore, llmNorm.length));
    const canonNormIdx = bdry[o] ?? 0;
    const utf16 = utf16BeforeNormalizedIndex(canonPlain, prov, canonNormIdx);
    const arr = byUtf16.get(utf16) ?? [];
    arr.push(literal);
    byUtf16.set(utf16, arr);
  }

  const keys = [...byUtf16.keys()].sort((a, b) => b - a);
  let merged = canonPlain;
  for (const k of keys) {
    const block = (byUtf16.get(k) ?? []).join('');
    merged = merged.slice(0, k) + block + merged.slice(k);
  }

  const { text: sanitizedMerged } = sanitizeVendorMarkup(merged, catalog);
  if (!validateTaggedAgainstCanon(sanitizedMerged, canonPlain, catalog, language)) {
    return { text: canonPlain, ok: false, reason: 'post_validate_failed', tagCount };
  }

  return { text: sanitizedMerged, ok: true, tagCount };
}
