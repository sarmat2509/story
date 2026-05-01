/**
 * Attempt to fix LLM prosody `taggedText` so that strip+normalize matches `canonPlain`,
 * by substituting characters at UTF-16 offsets that map to normalized mismatches.
 *
 * Supported today: `bracket_only` catalogs with empty `wrappingTagNames` (e.g. Google Gemini TTS).
 * Returns the original string when repair is impossible or unsafe.
 */

import type { TtsSpeechTagCatalog } from '../providers/base/TtsSpeechTagCatalog';
import { getAllAudioTags } from '../constants/audioTags';
import { stripSsmlBreakTags } from './audioTags';
import {
  tagKey,
  normalizeCanonLikeAudioDomain,
  stripApprovedCatalogMarkup,
  validateTaggedAgainstCanon,
} from './ttsProsodyTaggedText';
import { logger } from './logger';

const ALLOWED_AUDIO_TAGS = new Set(getAllAudioTags().map((t) => t.toLowerCase()));

export type TaggedCanonRepairResult = {
  text: string;
  repaired: boolean;
  /** UTF-16 code-unit substitutions applied to `taggedSanitized` (each may be 1+ chars if we ever extend). */
  substitutionCount: number;
  /** When false, `text` equals input (repair skipped or failed re-validation). */
  revalidated: boolean;
};

export type ChSrc = { ch: string; src: number };

function joinUnits(u: ChSrc[]): { s: string; o: number[] } {
  return { s: u.map((x) => x.ch).join(''), o: u.map((x) => x.src) };
}

function collapseWhitespaceRuns(s: string, o: number[]): ChSrc[] {
  const out: ChSrc[] = [];
  for (let k = 0; k < s.length; ) {
    if (/\s/.test(s[k]!)) {
      const src0 = o[k]!;
      let k2 = k;
      while (k2 < s.length && /\s/.test(s[k2]!)) k2++;
      out.push({ ch: ' ', src: src0 });
      k = k2;
    } else {
      out.push({ ch: s[k]!, src: o[k]! });
      k++;
    }
  }
  return out;
}

/**
 * Mirrors `stripApprovedCatalogMarkup` for `wrappingTagNames.length === 0` only,
 * recording UTF-16 source index in `tagged` for each surviving character.
 */
function stripApprovedBracketOnlyUnits(
  tagged: string,
  catalog: TtsSpeechTagCatalog
): ChSrc[] | null {
  if (catalog.wrappingTagNames.length > 0) return null;
  const inlineWhitelist = new Set(catalog.inlineBracketTags.map((t) => tagKey(t)));
  const out: ChSrc[] = [];
  let i = 0;
  while (i < tagged.length) {
    if (tagged[i] === '[') {
      const close = tagged.indexOf(']', i);
      if (close < 0) {
        out.push({ ch: tagged[i]!, src: i });
        i++;
        continue;
      }
      const inner = tagged.slice(i + 1, close);
      if (inlineWhitelist.has(tagKey(inner))) {
        i = close + 1;
        continue;
      }
      for (let k = i; k <= close; k++) {
        out.push({ ch: tagged[k]!, src: k });
      }
      i = close + 1;
      continue;
    }
    out.push({ ch: tagged[i]!, src: i });
    i++;
  }
  const { s, o } = joinUnits(out);
  let start = 0;
  let end = s.length;
  while (start < end && /\s/.test(s[start]!)) start++;
  while (end > start && /\s/.test(s[end - 1]!)) end--;
  return collapseWhitespaceRuns(s.slice(start, end), o.slice(start, end));
}

/**
 * Same effect as `stripForAudio` on lexical text (no catalog prosody tags left), with provenance.
 * If `stripSsmlBreakTags` changes string length, repair is skipped (returns null).
 */
function stripForAudioLexicalUnits(units: ChSrc[]): ChSrc[] | null {
  const joined = joinUnits(units);
  let s = joined.s;
  const o = joined.o;
  const afterSsml = stripSsmlBreakTags(s);
  if (afterSsml.length !== s.length) {
    return null;
  }
  s = afterSsml;

  const afterBracket: ChSrc[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '[') {
      const close = s.indexOf(']', i);
      if (close < 0) {
        afterBracket.push({ ch: s[i]!, src: o[i]! });
        i++;
        continue;
      }
      const content = s.slice(i + 1, close);
      const tag = content
        .trim()
        .toLowerCase()
        .replace(/\s{2,}/g, ' ');
      if (ALLOWED_AUDIO_TAGS.has(tag)) {
        for (let k = i; k <= close; k++) {
          afterBracket.push({ ch: s[k]!, src: o[k]! });
        }
      }
      i = close + 1;
      continue;
    }
    afterBracket.push({ ch: s[i]!, src: o[i]! });
    i++;
  }

  const afterCurly: ChSrc[] = [];
  const { s: sb, o: ob } = joinUnits(afterBracket);
  i = 0;
  while (i < sb.length) {
    if (sb[i] === '{') {
      const close = sb.indexOf('}', i);
      if (close < 0) {
        afterCurly.push({ ch: sb[i]!, src: ob[i]! });
        i++;
        continue;
      }
      const inner = sb.slice(i + 1, close).trim();
      if (inner.length === 0) {
        i = close + 1;
        continue;
      }
      for (const ch of inner) {
        afterCurly.push({ ch, src: ob[i]! });
      }
      i = close + 1;
      continue;
    }
    afterCurly.push({ ch: sb[i]!, src: ob[i]! });
    i++;
  }

  const { s: s3, o: o3 } = joinUnits(afterCurly);
  const collapsed = collapseWhitespaceRuns(s3, o3);
  let start = 0;
  let end = collapsed.length;
  while (start < end && /\s/.test(collapsed[start]!.ch)) start++;
  while (end > start && /\s/.test(collapsed[end - 1]!.ch)) end--;
  return collapsed.slice(start, end);
}

/** Tail of `normalizeCanonLikeAudioDomain` after `stripForAudio` (typography + NFC). */
function typographyNormalizeUnits(units: ChSrc[], language: string): ChSrc[] | null {
  let { s, o } = joinUnits(units);
  let start = 0;
  let end = s.length;
  while (start < end && /\s/.test(s[start]!)) start++;
  while (end > start && /\s/.test(s[end - 1]!)) end--;
  s = s.slice(start, end);
  o = o.slice(start, end);

  const nbspPass: ChSrc[] = [];
  for (let k = 0; k < s.length; k++) {
    const c = s[k]!;
    if (c === '\u00A0' || c === '\u202F') nbspPass.push({ ch: ' ', src: o[k]! });
    else nbspPass.push({ ch: c, src: o[k]! });
  }

  const noShy: ChSrc[] = [];
  for (const u of nbspPass) {
    if (u.ch === '\u00AD') continue;
    noShy.push(u);
  }

  const noZw: ChSrc[] = [];
  for (const u of noShy) {
    if (/[\u200B-\u200D\uFEFF]/.test(u.ch)) continue;
    noZw.push(u);
  }

  const jNoZw = joinUnits(noZw);
  const collapsed = collapseWhitespaceRuns(jNoZw.s, jNoZw.o);

  const { s: q, o: qo } = joinUnits(collapsed);
  const quotePass: ChSrc[] = [];
  for (let k = 0; k < q.length; k++) {
    const origCh = q[k]!;
    if (origCh === '\u2026') {
      for (const dot of ['.', '.', '.'] as const) {
        quotePass.push({ ch: dot, src: qo[k]! });
      }
      continue;
    }
    let ch = origCh;
    if (ch === '\u2019') ch = "'";
    else if (ch === '\u201c' || ch === '\u201d') ch = '"';
    quotePass.push({ ch, src: qo[k]! });
  }

  if (language === 'uk') {
    for (const u of quotePass) {
      if (u.ch === 'ʼ') u.ch = "'";
    }
  }

  const { s: preNfc, o: preNfcO } = joinUnits(quotePass);
  let nfcS: string;
  try {
    nfcS = preNfc.normalize('NFC');
  } catch {
    return null;
  }
  if (nfcS.length !== preNfc.length) return null;
  return preNfc.split('').map((_, idx) => ({ ch: nfcS[idx]!, src: preNfcO[idx]! }));
}

function provenanceThroughNormalize(
  tagged: string,
  catalog: TtsSpeechTagCatalog,
  language: string
): ChSrc[] | null {
  const u0 = stripApprovedBracketOnlyUnits(tagged, catalog);
  if (!u0) return null;
  const u1 = stripForAudioLexicalUnits(u0);
  if (!u1) return null;
  const ref = normalizeCanonLikeAudioDomain(stripApprovedCatalogMarkup(tagged, catalog), language);
  const viaPipe = joinUnits(typographyNormalizeUnits(u1, language) ?? []).s;
  if (viaPipe !== ref) {
    logger.debug(
      { previewTagged: tagged.slice(0, 80), lenPipe: viaPipe.length, lenRef: ref.length },
      'Canon repair: internal normalize pipeline diverged from normalizeCanonLikeAudioDomain; skipping repair'
    );
    return null;
  }
  return typographyNormalizeUnits(u1, language);
}

/** Same pipeline as `normalizeCanonLikeAudioDomain(canonPlain)` with per-char index into `canonPlain`. */
export function provenanceCanonPlain(canonPlain: string, language: string): ChSrc[] | null {
  const units = canonPlain.split('').map((ch, i) => ({ ch, src: i }));
  const u1 = stripForAudioLexicalUnits(units);
  if (!u1) return null;
  return typographyNormalizeUnits(u1, language);
}

/**
 * When validation fails on lexical typos (same normalized length), patch `taggedSanitized`
 * at UTF-16 offsets mapped from normalized comparison.
 */
export function attemptRepairTaggedTextToMatchCanon(
  taggedSanitized: string,
  canonPlain: string,
  catalog: TtsSpeechTagCatalog,
  language: string
): TaggedCanonRepairResult {
  if (validateTaggedAgainstCanon(taggedSanitized, canonPlain, catalog, language)) {
    return { text: taggedSanitized, repaired: false, substitutionCount: 0, revalidated: true };
  }

  if (catalog.wrappingTagNames.length > 0) {
    return { text: taggedSanitized, repaired: false, substitutionCount: 0, revalidated: false };
  }

  const a = provenanceThroughNormalize(taggedSanitized, catalog, language);
  const b = provenanceCanonPlain(canonPlain, language);
  if (!a || !b || a.length !== b.length) {
    return { text: taggedSanitized, repaired: false, substitutionCount: 0, revalidated: false };
  }

  const edits: Array<{ offset: number; replacement: string }> = [];
  for (let k = 0; k < a.length; k++) {
    if (a[k]!.ch !== b[k]!.ch) {
      edits.push({ offset: a[k]!.src, replacement: b[k]!.ch });
    }
  }
  if (edits.length === 0) {
    return { text: taggedSanitized, repaired: false, substitutionCount: 0, revalidated: false };
  }

  const byOffset = new Map<number, string>();
  for (const e of edits) {
    if (byOffset.has(e.offset)) {
      logger.warn(
        { offset: e.offset },
        'Canon repair: ambiguous edits at same UTF-16 offset; skipping'
      );
      return { text: taggedSanitized, repaired: false, substitutionCount: 0, revalidated: false };
    }
    byOffset.set(e.offset, e.replacement);
  }

  const sortedOffsets = [...byOffset.keys()].sort((x, y) => y - x);
  let out = taggedSanitized;
  for (const off of sortedOffsets) {
    const replacement = byOffset.get(off)!;
    const del = 1;
    if (off < 0 || off + del > out.length) {
      return { text: taggedSanitized, repaired: false, substitutionCount: 0, revalidated: false };
    }
    out = out.slice(0, off) + replacement + out.slice(off + del);
  }

  const ok = validateTaggedAgainstCanon(out, canonPlain, catalog, language);
  if (!ok) {
    logger.warn(
      { substitutionCount: edits.length },
      'Canon repair: substitutions applied but validation still failed; discarding repair'
    );
    return { text: taggedSanitized, repaired: false, substitutionCount: 0, revalidated: false };
  }

  logger.info(
    { substitutionCount: edits.length },
    'Canon repair: patched LLM lexical typos to match canon (normalized)'
  );
  return { text: out, repaired: true, substitutionCount: edits.length, revalidated: true };
}
