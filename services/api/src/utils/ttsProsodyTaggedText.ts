/**
 * Sanitization + canon validation for deferred TTS prosody markup (per-vendor catalog).
 */

import type { TtsSpeechTagCatalog } from '../providers/base/TtsSpeechTagCatalog';
import { stripForAudio, stripSsmlBreakTags } from './audioTags';
import { logger } from './logger';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function tagKey(inner: string): string {
  return inner.trim().toLowerCase().replace(/\s{2,}/g, ' ');
}

/**
 * Same normalization as `AudioDomainService.normalizeText` (stripForAudio + typography).
 * Use for canon strings passed into the prosody LLM and for equality checks after stripping tags.
 */
export function normalizeCanonLikeAudioDomain(text: string, language: string): string {
  let normalized = stripForAudio(text)
    .trim()
    // NBSP / narrow NBSP — not always matched by \s in all contexts; breaks strict LLM vs DB compare
    .replace(/\u00A0|\u202F/g, ' ')
    .replace(/\u00AD/g, '') // soft hyphen
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // ZWSP, ZWNJ, ZWJ, BOM
    .replace(/\s+/g, ' ')
    .replace(/\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, '...');

  if (language === 'uk') {
    normalized = normalized.replace(/ʼ/g, "'");
  }

  try {
    normalized = normalized.normalize('NFC');
  } catch {
    /* ignore */
  }

  return normalized;
}

/** For logs when `validateTaggedAgainstCanon` fails — find first code-point mismatch after strip+normalize. */
export function explainTaggedCanonMismatch(
  taggedSanitized: string,
  canonPlain: string,
  catalog: TtsSpeechTagCatalog,
  language: string,
): { index: number; windowA: string; windowB: string; lenA: number; lenB: number } {
  const stripped = stripApprovedCatalogMarkup(taggedSanitized, catalog);
  const a = normalizeCanonLikeAudioDomain(stripped, language);
  const b = normalizeCanonLikeAudioDomain(canonPlain, language);
  let i = 0;
  const n = Math.max(a.length, b.length);
  while (i < n && a[i] === b[i]) {
    i++;
  }
  return {
    index: i,
    lenA: a.length,
    lenB: b.length,
    windowA: a.slice(Math.max(0, i - 80), i + 120),
    windowB: b.slice(Math.max(0, i - 80), i + 120),
  };
}

/**
 * Lighter normalize (SSML strip + keepsake unwrap) — kept for non-TTS comparisons if needed.
 */
export function normalizeProsodyPlainForCompare(text: string, language: string): string {
  let normalized = stripSsmlBreakTags(text)
    .replace(/\{([^{}]+)\}/g, (_, inner: string) => inner.trim())
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, '...');

  if (language === 'uk') {
    normalized = normalized.replace(/ʼ/g, "'");
  }

  return normalized;
}

/**
 * Remove only catalog-approved `[...]` and `<name>...</name>` wrappers; keep inner text of wrappers.
 * Used for alignment / "spoken" transcript when tags are non-lexical controls.
 */
export function stripApprovedCatalogMarkup(text: string, catalog: TtsSpeechTagCatalog): string {
  let r = text;
  const inlineWhitelist = new Set(catalog.inlineBracketTags.map((t) => tagKey(t)));

  r = r.replace(/\[([^\]]+)\]/g, (full, inner: string) => {
    const key = tagKey(inner);
    return inlineWhitelist.has(key) ? '' : full;
  });

  let prev = '';
  while (prev !== r) {
    prev = r;
    for (const name of catalog.wrappingTagNames) {
      const re = new RegExp(`<\\s*${escapeRegExp(name)}\\s*>([\\s\\S]*?)<\\s*/\\s*${escapeRegExp(name)}\\s*>`, 'gi');
      r = r.replace(re, '$1');
    }
  }

  return r.replace(/\s{2,}/g, ' ').trim();
}

function buildWrappingPairRegex(names: readonly string[]): RegExp | null {
  if (names.length === 0) return null;
  const alt = names.map((n) => escapeRegExp(n)).join('|');
  return new RegExp(`<\\s*(${alt})\\s*>([\\s\\S]*?)<\\s*/\\s*\\1\\s*>`, 'gi');
}

/**
 * Strip invalid `[...]` (not on whitelist) and broken wrapping markup for whitelisted tag names only.
 * Valid `<name>...</name>` pairs are preserved.
 */
export function sanitizeVendorMarkup(
  raw: string,
  catalog: TtsSpeechTagCatalog
): { text: string; unknownTagStripped: boolean } {
  let unknownTagStripped = false;
  let s = stripSsmlBreakTags(raw);
  const inlineWhitelist = new Set(catalog.inlineBracketTags.map((t) => tagKey(t)));

  s = s.replace(/\[([^\]]+)\]/g, (full, inner: string) => {
    const key = tagKey(inner);
    if (inlineWhitelist.has(key)) return full;
    unknownTagStripped = true;
    return '';
  });

  if (catalog.wrappingTagNames.length > 0) {
    const pairRe = buildWrappingPairRegex(catalog.wrappingTagNames);
    const preserved: string[] = [];
    if (pairRe) {
      let guard = 0;
      while (guard++ < 10_000) {
        pairRe.lastIndex = 0;
        const m = pairRe.exec(s);
        if (!m) break;
        preserved.push(m[0]);
        const token = `\uE000WT_WRAP_${preserved.length - 1}\uE001`;
        s = s.slice(0, m.index) + token + s.slice(m.index + m[0].length);
      }
    }
    for (const name of catalog.wrappingTagNames) {
      const closeTag = new RegExp(`<\\s*/\\s*${escapeRegExp(name)}\\s*>`, 'gi');
      const openTag = new RegExp(`<\\s*${escapeRegExp(name)}\\s*>`, 'gi');
      const beforeClose = s;
      s = s.replace(closeTag, '');
      if (s !== beforeClose) unknownTagStripped = true;
      const beforeOpen = s;
      s = s.replace(openTag, '');
      if (s !== beforeOpen) unknownTagStripped = true;
    }
    for (let i = preserved.length - 1; i >= 0; i--) {
      const token = `\uE000WT_WRAP_${i}\uE001`;
      s = s.split(token).join(preserved[i]!);
    }
  }

  s = s.replace(/\s{2,}/g, ' ').trim();

  if (unknownTagStripped) {
    logger.warn({ markupModel: catalog.markupModel }, 'unknown_tag_stripped');
  }

  return { text: s, unknownTagStripped };
}

export function validateTaggedAgainstCanon(
  taggedSanitized: string,
  canonPlain: string,
  catalog: TtsSpeechTagCatalog,
  language: string
): boolean {
  const stripped = stripApprovedCatalogMarkup(taggedSanitized, catalog);
  const a = normalizeCanonLikeAudioDomain(stripped, language);
  const b = normalizeCanonLikeAudioDomain(canonPlain, language);
  return a === b;
}

/** Bracket depth `[` `]` only (for avoiding cuts inside `[tag name]`). */
function bracketDepthBefore(s: string, from: number, pos: number): number {
  let d = 0;
  for (let i = from; i < pos; i++) {
    if (s[i] === '[') d++;
    else if (s[i] === ']') d = Math.max(0, d - 1);
  }
  return d;
}

/**
 * Partition tagged narration into TTS-sized chunks. Prefer cuts immediately **before** `[`
 * (bracket markup applies to following speech). Falls back to sentence-like boundaries, then hard cut.
 */
export function splitTaggedTextForTtsChunks(taggedText: string, maxChars: number): string[] {
  const t = taggedText;
  if (!t || maxChars < 80) {
    return t ? [t] : [];
  }

  const chunks: string[] = [];
  let start = 0;
  const minChunk = Math.max(40, Math.min(Math.floor(maxChars * 0.28), maxChars - 1));

  while (start < t.length) {
    const rest = t.length - start;
    if (rest <= maxChars) {
      chunks.push(t.slice(start));
      break;
    }

    const hardEnd = Math.min(start + maxChars, t.length);
    const minEnd = start + minChunk;

    let bestCut = -1;
    for (let i = hardEnd; i > minEnd; i--) {
      if (t[i] === '[' && bracketDepthBefore(t, start, i) === 0) {
        bestCut = i;
        break;
      }
    }

    if (bestCut > start) {
      chunks.push(t.slice(start, bestCut));
      start = bestCut;
      continue;
    }

    let cut = -1;
    for (const sep of ['. ', '? ', '! ', '\n', ' — ', ' '] as const) {
      let idx = t.lastIndexOf(sep, hardEnd - 1);
      while (idx >= minEnd && bracketDepthBefore(t, start, idx + 1) > 0) {
        idx = t.lastIndexOf(sep, idx - 1);
      }
      if (idx >= minEnd) {
        const end = idx + sep.length;
        if (end > cut) cut = end;
      }
    }

    if (cut > start) {
      chunks.push(t.slice(start, cut));
      start = cut;
      continue;
    }

    let emergency = hardEnd;
    while (emergency > start + 1 && bracketDepthBefore(t, start, emergency) > 0) {
      emergency--;
    }
    if (emergency <= start) {
      emergency = Math.min(start + maxChars, t.length);
    }
    chunks.push(t.slice(start, emergency));
    start = emergency;
  }

  return chunks.filter((c) => c.length > 0);
}
