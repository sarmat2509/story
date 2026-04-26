/**
 * Per-vendor TTS speech markup for LLM prosody pass + sanitization (defer-audio-tags flow).
 * Lists must match the provider the user selected for narration.
 */

export type TtsMarkupModel = 'bracket_only' | 'bracket_and_angle_wrap' | 'none_use_instructions';

export interface TtsSpeechTagCatalog {
  markupModel: TtsMarkupModel;
  /** Allowed `[name]` contents after lowercasing inner text (spaces preserved for multi-word tags). */
  inlineBracketTags: readonly string[];
  /** Allowed `<name>...</name>` wrapper tag names (lowercase). */
  wrappingTagNames: readonly string[];
  /** Hard rules for the LLM (e.g. forbid SSML break on Eleven v3). */
  promptConstraints: readonly string[];
  /** When/where/how many pauses; must reference only pause tags present in inlineBracketTags. */
  pauseInstructionsForLlm: string;
  /**
   * When true, this vendor's synthesis can accept an English style prompt (e.g. Google Gemini-TTS `input.prompt`).
   * The prosody LLM adds `vendorStylePromptEn` only if the caller passes `includeVendorStylePromptEn: true` to
   * `enrichDeferredProsodyForTtsChunk` — other TTS vendors omit that field entirely.
   */
  /** When true, deferred prosody LLM also returns English `vendorStylePromptEn` for vendor synthesis style (e.g. Gemini-TTS `prompt`). */
  deferredProsodyStylePromptLlm?: boolean;
}

/** Inline + wrapping whitelist and nesting rules (for `VENDOR MARKUP` section of the prosody LLM prompt). */
export function formatAllowedVendorMarkupListForLlm(catalog: TtsSpeechTagCatalog): string {
  const inline = catalog.inlineBracketTags.map((t) => `[${t}]`).join(', ');
  const wrap =
    catalog.wrappingTagNames.length > 0
      ? catalog.wrappingTagNames.map((t) => `<${t}>…</${t}>`).join(', ')
      : '(none — do not use angle-bracket wrappers)';
  const nestingHelp =
    catalog.wrappingTagNames.length > 0
      ? [
          '',
          'WRAPPER NESTING (allowed):',
          'You may nest allowed wrappers to combine styles (e.g. slower + softer delivery).',
          'Keep valid nesting order: close the inner tag before the outer — same idea as XML.',
          'Valid example: <slow><soft>Goodnight, sleep well.</soft></slow>',
          'Invalid (crossed): e.g. <soft>Start <slow>middle</soft></slow> — close inner `<slow>...</slow>` before `</soft>`.',
        ].join('\n')
      : '';
  return [
    'ALLOWED INLINE TAGS (use only these exact bracket forms, lowercase as listed):',
    inline || '(none)',
    '',
    'ALLOWED WRAPPING TAGS:',
    wrap,
    nestingHelp,
  ]
    .filter(Boolean)
    .join('\n')
    .trimEnd();
}

/** Vendor constraints + pause rules (for `VENDOR-SPECIFIC CONSTRAINTS` section). */
export function formatVendorSpecificConstraintsForLlm(catalog: TtsSpeechTagCatalog): string {
  const constraints = catalog.promptConstraints.map((c) => `- ${c}`).join('\n');
  return [
    constraints || '- (none)',
    '',
    'PAUSE AND PACING (this vendor):',
    catalog.pauseInstructionsForLlm,
  ].join('\n');
}

/** Full legacy block = allowed list + vendor constraints (debug / older callers). */
export function formatSpeechTagBlockForLlm(catalog: TtsSpeechTagCatalog): string {
  return [formatAllowedVendorMarkupListForLlm(catalog), '', formatVendorSpecificConstraintsForLlm(catalog)].join('\n');
}
