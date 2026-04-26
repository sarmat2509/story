/**
 * Git-style **lexical** diff for deferred prosody validation.
 *
 * Policy (matches production `validateTaggedAgainstCanon`):
 * - Differences that consist only of **catalog-approved** `[tag]` / wrapping markup are ignored:
 *   we compare `stripApprovedCatalogMarkup(tagged)` to `canonPlain`, both passed through
 *   `normalizeCanonLikeAudioDomain`.
 * - Any remaining difference is **lexical** (wrong letters/words/punctuation) → reject.
 *
 * This module does not change acceptance rules; it explains them and builds a unified diff
 * of the two **normalized lexical** strings for logs and tooling.
 */

import { createTwoFilesPatch } from 'diff';
import type { TtsSpeechTagCatalog } from '../providers/base/TtsSpeechTagCatalog';
import {
  normalizeCanonLikeAudioDomain,
  stripApprovedCatalogMarkup,
  tagKey,
} from './ttsProsodyTaggedText';

const MAX_UNIFIED_DIFF_CHARS = 32_000;

export type ProsodyLexicalDiffPolicyResult = {
  /** Same as `validateTaggedAgainstCanon` */
  accept: boolean;
  canonNormalized: string;
  llmLexicalNormalized: string;
  /**
   * Unified diff (git-like). Old file = canon (normalized), new file = LLM text after
   * approved markup strip + normalize. Empty when `accept` is true.
   */
  unifiedDiffLexicalNormalized: string;
  /** Count of `[inner]` spans in `taggedSanitized` whose key is on the catalog whitelist */
  approvedBracketTagCount: number;
  policySummary: string;
};

function countApprovedBracketSpans(taggedSanitized: string, catalog: TtsSpeechTagCatalog): number {
  const whitelist = new Set(catalog.inlineBracketTags.map((t) => tagKey(t)));
  let count = 0;
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(taggedSanitized)) !== null) {
    if (whitelist.has(tagKey(m[1] ?? ''))) count++;
  }
  return count;
}

/**
 * Build normalized strings and a unified diff between them.
 * `accept` mirrors `validateTaggedAgainstCanon` (repair is **not** applied here — pass already-repaired text if needed).
 */
export function evaluateProsodyLexicalDiffPolicy(
  taggedSanitized: string,
  canonPlain: string,
  catalog: TtsSpeechTagCatalog,
  language: string
): ProsodyLexicalDiffPolicyResult {
  const stripped = stripApprovedCatalogMarkup(taggedSanitized, catalog);
  const llmLexicalNormalized = normalizeCanonLikeAudioDomain(stripped, language);
  const canonNormalized = normalizeCanonLikeAudioDomain(canonPlain, language);
  const accept = llmLexicalNormalized === canonNormalized;

  const policySummary =
    'Lexical policy: catalog-approved bracket/wrap markup is stripped before compare; ' +
    'normalized lexical text must equal canon. Tag-only decoration is accepted only insofar as it does not change stripped prose.';

  let unifiedDiffLexicalNormalized = '';
  if (!accept) {
    let patch = createTwoFilesPatch(
      'canon(normalized).txt',
      'llm-lexical-stripped(normalized).txt',
      canonNormalized,
      llmLexicalNormalized,
      '',
      '',
      { context: 3 }
    );
    if (patch.length > MAX_UNIFIED_DIFF_CHARS) {
      patch =
        patch.slice(0, MAX_UNIFIED_DIFF_CHARS) +
        `\n... [unified diff truncated to ${MAX_UNIFIED_DIFF_CHARS} characters]\n`;
    }
    unifiedDiffLexicalNormalized = patch;
  }

  return {
    accept,
    canonNormalized,
    llmLexicalNormalized,
    unifiedDiffLexicalNormalized,
    approvedBracketTagCount: countApprovedBracketSpans(taggedSanitized, catalog),
    policySummary,
  };
}
