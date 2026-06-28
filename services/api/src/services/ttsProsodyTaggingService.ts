/**
 * LLM pass: insert vendor-whitelisted TTS markup into canonical narration (defer-audio-tags flow).
 */

import type { JsonSchema } from '../providers/base/JsonSchema';
import {
  formatAllowedVendorMarkupListForLlm,
  formatVendorSpecificConstraintsForLlm,
  type TtsSpeechTagCatalog,
} from '../providers/base/TtsSpeechTagCatalog';
import type { UsageMetadata } from '../providers/base/UsageMetadata';
import { getTextProvider } from './aiService';
import { logger } from '../utils/logger';
import config from '../config';
import {
  explainTaggedCanonMismatch,
  moveApprovedBracketTagsToSentenceStarts,
  sanitizeVendorMarkup,
  validateTaggedAgainstCanon,
} from '../utils/ttsProsodyTaggedText';
import { attemptRepairTaggedTextToMatchCanon } from '../utils/ttsProsodyCanonRepair';
import { evaluateProsodyLexicalDiffPolicy } from '../utils/ttsProsodyCanonLexicalDiff';
import { projectApprovedBracketTagsOntoCanon } from '../utils/ttsProsodyTagProjection';
import {
  applyDeferredProsodyIndexInsertions,
} from '../utils/ttsProsodyIndexInsertions';
export { applyDeferredProsodyIndexInsertions };
import { USAGE_OP_TTS_PROSODY_TAGS } from './aiUsageService';

/** Max length for vendorStylePromptEn after LLM return (trim); aligned with schema description and post-parse trim. */
export const DEFER_STYLE_PROMPT_MAX_CHARS = 2000;

/** Low temperature: stricter adherence to verbatim canon (fewer paraphrases / reorderings). */
const DEFERRED_PROSODY_LLM_TEMPERATURE = 0.05;

const TAGGED_TEXT_ONLY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    taggedText: {
      type: 'string',
      description:
        'Full chunk text with only allowed inline/wrapping tags; prose must match input.',
    },
  },
  required: ['taggedText'],
  additionalProperties: false,
};

const TAG_INSERTIONS_ITEMS_SCHEMA: JsonSchema = {
  type: 'array',
  maxItems: 400,
  items: {
    type: 'object',
    properties: {
      utf16OffsetBefore: {
        type: 'integer',
        minimum: 0,
        maximum: 500000,
        description:
          'Insert this tag immediately BEFORE this UTF-16 code unit index in STORY_TEXT_TO_TAG (JavaScript string indexing: 0 = before first char; storyText.length = after last char).',
      },
      tagInner: {
        type: 'string',
        minLength: 1,
        maxLength: 96,
        description:
          'Inner text of one allowed bracket tag from the vendor list (e.g. short pause). Do not include square brackets.',
      },
    },
    required: ['utf16OffsetBefore', 'tagInner'],
    additionalProperties: false,
  },
};

const TAG_INDEX_ONLY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    tagInsertions: TAG_INSERTIONS_ITEMS_SCHEMA,
  },
  required: ['tagInsertions'],
  additionalProperties: false,
};

const TAG_INDEX_PLUS_VENDOR_STYLE_SCHEMA: JsonSchema = {
  type: 'object',
  description: `Single JSON object: tagInsertions array plus vendorStylePromptEn (max ${DEFER_STYLE_PROMPT_MAX_CHARS} chars).`,
  properties: {
    tagInsertions: TAG_INSERTIONS_ITEMS_SCHEMA,
    vendorStylePromptEn: {
      type: 'string',
      maxLength: DEFER_STYLE_PROMPT_MAX_CHARS,
      description: `Required. English only. One coherent paragraph. Same role as in full-text mode (e.g. Gemini-TTS prompt). Hard maximum ${DEFER_STYLE_PROMPT_MAX_CHARS} characters.`,
    },
  },
  required: ['tagInsertions', 'vendorStylePromptEn'],
  additionalProperties: false,
};

const TAGGED_TEXT_PLUS_VENDOR_STYLE_SCHEMA: JsonSchema = {
  type: 'object',
  description: `Single JSON object with exactly two required string fields and no other keys. vendorStylePromptEn must be one coherent paragraph and at most ${DEFER_STYLE_PROMPT_MAX_CHARS} characters.`,
  properties: {
    taggedText: {
      type: 'string',
      description:
        'Required. Full chunk text with only allowed inline/wrapping tags inserted; underlying prose, punctuation, and whitespace must match the input (no truncation, no paraphrase).',
    },
    vendorStylePromptEn: {
      type: 'string',
      maxLength: DEFER_STYLE_PROMPT_MAX_CHARS,
      description: `Required. English only. One coherent paragraph (not multiple alternatives); ideally about 400–900 characters unless the passage needs more. Vendor-facing synthesis style directions (narrator tone, pacing, arc, character contrast, including global voice arcs inline tags may not fully control; e.g. Gemini-TTS uses this as the text \`prompt\`). Not a plot summary; do not quote the story; mention performance arcs without retelling plot events in detail; no non-English text. Hard maximum ${DEFER_STYLE_PROMPT_MAX_CHARS} characters.`,
    },
  },
  required: ['taggedText', 'vendorStylePromptEn'],
  additionalProperties: false,
};

function responseSchemaForCatalog(
  catalog: TtsSpeechTagCatalog,
  includeVendorStylePromptEn: boolean
): JsonSchema {
  if (includeVendorStylePromptEn && catalog.deferredProsodyStylePromptLlm) {
    return TAGGED_TEXT_PLUS_VENDOR_STYLE_SCHEMA;
  }
  return TAGGED_TEXT_ONLY_SCHEMA;
}

function responseIndexSchemaForCatalog(
  catalog: TtsSpeechTagCatalog,
  includeVendorStylePromptEn: boolean
): JsonSchema {
  if (includeVendorStylePromptEn && catalog.deferredProsodyStylePromptLlm) {
    return TAG_INDEX_PLUS_VENDOR_STYLE_SCHEMA;
  }
  return TAG_INDEX_ONLY_SCHEMA;
}

export type DeferredProsodyLlmOutputMode = 'full_tagged_text' | 'tag_index_json';

function buildSystemPrompt(
  catalog: TtsSpeechTagCatalog,
  language: string,
  includeVendorStylePromptEn: boolean,
  outputMode: DeferredProsodyLlmOutputMode = 'full_tagged_text'
): string {
  const wantsStyleBlock =
    includeVendorStylePromptEn && catalog.deferredProsodyStylePromptLlm === true;
  const allowedMarkup = formatAllowedVendorMarkupListForLlm(catalog);
  const vendorConstraints = formatVendorSpecificConstraintsForLlm(catalog);

  const globalVsLocal = wantsStyleBlock
    ? [
        'GLOBAL VS LOCAL DIRECTION:',
        'Use the JSON field vendorStylePromptEn for overall performance direction: narrator tone, broad pacing, emotional arc, genre mood, and character voice contrast when clear from the passage.',
        'Use inline markup only for local moments that need precise delivery or pacing guidance.',
      ].join('\n')
    : [
        'GLOBAL VS LOCAL DIRECTION:',
        'This vendor/schema has no separate English style prompt — use allowed inline (and wrapping, if listed) markup sparingly for local guidance; rely on prose and punctuation for the rest.',
      ].join('\n');

  const tagDensity = wantsStyleBlock
    ? 'Use sparse markup. Sparse markup means avoiding unnecessary beats, not collapsing required performance layers into one tag. For a passage around 3000–3500 characters, typical output is about 10–18 non-pause performance tags and 12–18 pause/pacing tags total. Layered tags may increase the count slightly when direct speech clearly requires multiple performance layers. Scale naturally with passage length, dialogue density, genre, and pacing profile. These are soft upper guidance targets, not a requirement to add tags. Do not let density targets prevent necessary layered markup on important direct speech. A cleaner output with fewer tags is preferred when the prose and vendorStylePromptEn already carry the performance.'
    : 'Use sparse markup. Sparse markup means avoiding unnecessary beats, not collapsing required performance layers into one tag. For a passage around 3000–3500 characters, typical output is about 10–18 non-pause performance tags and 12–18 pause/pacing tags total. Layered tags may increase the count slightly when direct speech clearly requires multiple performance layers. Scale naturally with passage length, dialogue density, genre, and pacing profile. These are soft upper guidance targets, not a requirement to add tags. Do not let density targets prevent necessary layered markup on important direct speech. A cleaner output with fewer tags is preferred when the prose already carries the performance.';

  const narrationVsDialogue = wantsStyleBlock
    ? 'Delivery and emotion markup is mainly for direct speech when a line needs a local TTS cue. Neutral narration usually remains untagged. For narration, use markup only at strong tonal pivots, reveals, sudden sounds, emotional climaxes, or intentional pacing beats. Descriptive narration should usually rely on punctuation, prose, and vendorStylePromptEn rather than abstract emotion labels.'
    : 'Delivery and emotion markup is mainly for direct speech when a line needs a local TTS cue. Neutral narration usually remains untagged. For narration, use markup only at strong tonal pivots, reveals, sudden sounds, emotional climaxes, or intentional pacing beats. Descriptive narration should usually rely on punctuation and prose rather than abstract emotion labels.';

  const characterDelivery = wantsStyleBlock
    ? 'Use only character roles, relationships, and speaking patterns already clear from the text. Never invent speakers or character traits. Preserve a narrator-led audiobook feel. Character contrast should be guided mostly through vendorStylePromptEn, with inline markup used only for important local moments.'
    : 'Use only character roles, relationships, and speaking patterns already clear from the text. Never invent speakers or character traits. Preserve a narrator-led audiobook feel. Use inline markup only for important local moments.';

  const tagLayerManagement = [
    'TAG LAYER MANAGEMENT:',
    'Manage markup as separate performance layers, not as one general emotion label.',
    '',
    'Layers (add tags per layer the source text actually needs):',
    '1. Acoustic / delivery — volume, whisper, shout, speed, breath, tremble, vocal energy, pitch or intensity changes when the vendor supports it.',
    '2. Emotion / attitude — fear, joy, confidence, curiosity, warmth, surprise, determination, reassurance, sadness, irritation, wonder, nervousness, amusement, excitement.',
    '3. Non-verbal vocal events — laughs, sighs, gasps, inhales/exhales, cries — only when that sound should be heard, not as a stand-in for “feels amused/afraid”.',
    '4. Pacing — pauses, hesitation, suspense beats, scene turns.',
    '',
    'For direct speech, pick markup per layer. A quoted line may need both an acoustic cue and an emotion/attitude cue when the text clearly has both (e.g. joyful shouting: loud delivery plus joyful color when the vendor allows layered tags).',
    '',
    'Do not substitute one layer for another: emotion tags do not replace needed acoustic cues; acoustic tags do not drop emotional color when both matter. Attribution verbs (whispered, shouted, trembling voice, firm tone, etc.) often need matching local markup on the quoted words so TTS can hear them — that is not redundant.',
  ].join('\n');

  const emotionAttitude = [
    'EMOTION / ATTITUDE:',
    'Emotion and attitude markup colors the line but does not necessarily change volume, speed, or physical voice production.',
    '',
    'Use emotion/attitude markup for clear local feelings or intentions such as fear, joy, curiosity, confidence, surprise, warmth, reassurance, determination, sadness, irritation, wonder, nervousness, amusement, or excitement.',
    '',
    'When the source text contains both a concrete vocal action and emotional color, combine acoustic delivery markup with emotion/attitude markup when both matter and the vendor allows layered tags — do not drop the emotion layer only because an acoustic tag is present.',
  ].join('\n');

  const nonVerbalVocal = [
    'NON-VERBAL VOCAL EVENTS:',
    'Non-verbal vocal event markup represents actual audible sounds, such as laughter, giggles, sighs, gasps, inhales, exhales, crying, or chuckles.',
    '',
    'Use non-verbal vocal event markup only when an audible sound is desired, not merely because the character feels amused, relieved, afraid, surprised, or tired. If the prose already says the character laughed, sighed, gasped, or cried, add a non-verbal vocal event tag only when the actual sound should be heard as part of the performance.',
  ].join('\n');

  const tagChoice = [
    'TAG CHOICE:',
    'Choose tags by performance function, not by the closest mood word alone. When the text needs several layers (loud + joyful, quiet + scared, slow + serious), do not collapse them into one generic emotion tag — keep the acoustic or pacing cue the listener needs alongside emotion when the vendor allows it. Use generic mood labels conservatively; intense emotions stay brief and text-justified.',
  ].join('\n');

  const tagStacking = [
    'TAG STACKING:',
    'Do not stack two tags from the same layer (e.g. not two emotion tags or two acoustic tags on the same beat). You may combine one acoustic/delivery tag with one emotion/attitude tag before the same quoted speech when the text clearly needs both layers.',
    '',
    'Order when stacking: pacing (if any) → acoustic/delivery → emotion/attitude → quoted speech.',
    '',
    'Valid patterns: pacing + acoustic for a whispered reveal; acoustic + emotion for fearful whispering. Avoid decorative stacking — at most two non-pause tags before the same quote unless the vendor explicitly allows richer stacks. Do not stack pause tags without intervening text.',
  ].join('\n');

  const tagPlacement = [
    'TAG PLACEMENT:',
    'Place bracket delivery markup at the beginning of the complete sentence it should affect. Do not put bracket tags inside words, between syllables, or after the first character of a sentence.',
    'For quoted speech, place the sentence-level bracket tag before the sentence that contains the quote, or wrap the quoted speech when the vendor format supports wrappers. Do not place delivery markup only on the attribution phrase.',
  ].join('\n');

  const postSpeechAttribution = [
    'POST-SPEECH ATTRIBUTION:',
    'Do not place emotion or delivery tags between the closing quote and the speech attribution, for example: "…" — [tag] he whispered. When a quoted line needs a delivery cue, place the tag immediately before the opening quote or wrap the quoted speech, depending on the vendor format.',
  ].join('\n');

  const redundancyControl = [
    'REDUNDANCY CONTROL:',
    'Do not duplicate ordinary descriptive emotion with decorative markup. However, speech delivery written in prose may still need markup because TTS engines often do not perform attribution verbs automatically.',
    '',
    'For narration and descriptive beats, avoid vague duplicate tags where punctuation and wording already carry tone. For direct speech, markup that makes the quoted words audibly match the attribution is not redundant when the delivery matters.',
  ].join('\n');

  const pauseAndPacing = [
    'PAUSE AND PACING:',
    'Pauses are local pacing tools.',
    'Use short pauses for brief beats, small hesitations, or light sentence-level breathing.',
    'Use medium pauses for suspense beats, emotional pivots, meaningful sentence boundaries, or scene turns.',
    'Use long pauses only for rare major reveals or strong dramatic silence.',
    'Use pauses deliberately. Do not use medium pauses mechanically after every sentence unless the pacing profile explicitly calls for a very slow bedtime rhythm. Prefer punctuation for light beats.',
  ].join('\n');

  const finalCheckBeforeOutput = [
    'FINAL CHECK BEFORE OUTPUT:',
    'Quoted lines with clear vocal verbs need acoustic/pacing cues on the quoted words, not only emotion; layer when both delivery and emotion apply; keep quote-bound delivery tags before the quote (or vendor wrap), never between closing quote and attribution.',
  ].join('\n');

  const styleBlock =
    wantsStyleBlock && outputMode === 'full_tagged_text'
      ? [
          'STYLE PROMPT FIELD (vendorStylePromptEn):',
          'Required for this vendor on every call: you MUST return vendorStylePromptEn alongside taggedText.',
          '',
          'Use vendorStylePromptEn as the main place for overall performance direction: narrator tone, broad pacing, emotional arc, genre mood, and character voice contrast when clear from the passage. It must include any major global voice arc that inline tags may not fully control, such as a character becoming braver, a reveal becoming louder or brighter, or the ending becoming softer. Mention performance arcs without retelling plot events in detail. Keep loud or intense moments child-friendly and brief, not harsh or aggressive.',
          '',
          'vendorStylePromptEn must be one coherent paragraph, not multiple alternatives or drafts. It should be vendor-facing, not a plot summary. Do not quote the story. English only. Keep vendorStylePromptEn concise, ideally 400–900 characters, unless the passage truly needs more (hard maximum is enforced by the schema).',
        ].join('\n')
      : wantsStyleBlock && outputMode === 'tag_index_json'
        ? [
            'STYLE PROMPT FIELD (vendorStylePromptEn):',
            'Required for this vendor on every call: you MUST return vendorStylePromptEn alongside tagInsertions.',
            '',
            'Use vendorStylePromptEn as the main place for overall performance direction (same rules as full-text mode). English only; one coherent paragraph; hard maximum enforced by the schema.',
          ].join('\n')
        : '';

  const parts: string[] = [
    "You are a TTS markup assistant for children's audiobooks.",
    `Story language: ${language}.`,
    '',
    'Your task is to add vendor-supported TTS markup to the provided story text.',
    '',
    'MARKUP STYLE:',
    'The desired markup is sparse, editorial, and local. The transcript should remain mostly clean prose. Inline tags are selective local performance cues, not labels for every sentence. Use markup for direct speech delivery, major emotional turns, sudden sounds, reveals, and deliberate pacing beats.',
    '',
    "CHILDREN'S AUDIOBOOK DELIVERY:",
    "Keep the delivery appropriate for a children's audiobook: clear, warm, expressive, emotionally safe, and narrator-led. Match the existing genre and emotional arc of the passage without intensifying it. Adventure may feel energetic, mystery may feel gently suspenseful, comedy may feel light, and emotional moments may feel tender, but the markup should not turn the passage into melodrama, horror, or radio drama unless the source text itself strongly demands that style. Loud or intense moments should be brief, clear, and child-friendly rather than harsh.",
    '',
    globalVsLocal,
    '',
    'MINIMAL MARKUP POLICY:',
    'Use the fewest allowed markup tags needed to guide TTS. Do not tag every sentence. The prose is the primary performance guide; markup adds missing local guidance rather than restating what the text already says.',
    '',
    'TAG DENSITY:',
    tagDensity,
    '',
    'NARRATION VS DIALOGUE:',
    narrationVsDialogue,
    '',
    tagLayerManagement,
    '',
    emotionAttitude,
    '',
    nonVerbalVocal,
    '',
    tagChoice,
    '',
    tagStacking,
    '',
    tagPlacement,
    '',
    postSpeechAttribution,
    '',
    'CHARACTER AND NARRATOR DELIVERY:',
    characterDelivery,
    '',
    redundancyControl,
    '',
    pauseAndPacing,
  ];

  if (styleBlock) {
    parts.push('', styleBlock);
  }

  parts.push(
    '',
    finalCheckBeforeOutput,
    '',
    'HARD RULES:',
    '- Do NOT change, rephrase, shorten, expand, or reorder any words, punctuation, numbers, or scene breaks.',
    '- Do NOT fix typos, grammar, or style.',
    '- Do NOT add or remove blank lines except where they already exist in the input.',
    '- Do NOT move sentences or merge/split scenes.',
    '- ONLY insert markup from the allowed vendor markup list below (exact tokens and forms). Do not invent tags, wrappers, SSML, or instructions outside that list.',
    '- Do NOT invent new prose; markup tokens themselves are not new prose when used exactly as allowed.',
    '- Preserve all original prose characters exactly.',
    ...(outputMode === 'tag_index_json'
      ? [
          '- INDEX JSON MODE: every utf16OffsetBefore must refer to the unchanged STORY_TEXT_TO_TAG string using JavaScript UTF-16 code unit indices (String length / indexing). Do not echo the story text in JSON.',
        ]
      : [])
  );

  if (outputMode === 'full_tagged_text') {
    parts.push(
      '',
      'OUTPUT FORMAT:',
      'The API supplies a structured JSON schema for this call — match it exactly: required keys, types, and field descriptions. Return one JSON object only: no markdown code fences, no commentary before or after.',
      '',
      'VENDOR MARKUP:',
      'Use only the following allowed vendor markup tokens and forms. Do not invent or approximate markup.',
      '',
      allowedMarkup,
      '',
      'VENDOR-SPECIFIC CONSTRAINTS:',
      '',
      vendorConstraints
    );
  } else {
    parts.push(
      '',
      'OUTPUT FORMAT (INDEX JSON):',
      'Return one JSON object only (no markdown code fences, no commentary). Match the API schema exactly.',
      '',
      'Field tagInsertions (array): each element describes one allowed bracket tag to insert into STORY_TEXT_TO_TAG:',
      '- utf16OffsetBefore (integer, 0 .. storyText.length inclusive): insert the tag immediately BEFORE this UTF-16 index. Use storyText.length to append after the final character.',
      '- tagInner (string): inner text of exactly one allowed `[...]` tag from the vendor list (e.g. short pause). Do not include `[` or `]` in tagInner.',
      '- You may list insertions in any order; the server sorts them. Multiple tags at the same index are allowed (same-beat stacks) in the order you list them.',
      '- Do NOT include a full tagged transcript string; only tagInsertions (and vendorStylePromptEn when required).',
      '',
      'VENDOR MARKUP:',
      'Use only the following allowed vendor markup tokens and forms. Do not invent or approximate markup.',
      '',
      allowedMarkup,
      '',
      'VENDOR-SPECIFIC CONSTRAINTS:',
      '',
      vendorConstraints
    );
  }

  return parts.join('\n');
}

function buildUserPrompt(canonChunk: string): string {
  return ['STORY_TEXT_TO_TAG:', '', canonChunk].join('\n');
}

/**
 * Exact free-text prompt passed to the text LLM for deferred prosody (`operation: tts_prosody_tags`).
 * Useful for debugging / reproducing in Gemini UI.
 */
export function composeDeferredProsodyLlmPrompt(params: {
  canonText: string;
  catalog: TtsSpeechTagCatalog;
  language: string;
  includeVendorStylePromptEn?: boolean;
}): string {
  const requestLlmStylePrompt =
    params.includeVendorStylePromptEn === true &&
    params.catalog.deferredProsodyStylePromptLlm === true;
  const system = buildSystemPrompt(params.catalog, params.language, requestLlmStylePrompt, 'full_tagged_text');
  const user = buildUserPrompt(params.canonText);
  return `${system}\n\n---\n\n${user}`;
}

/** Same markup rules as `composeDeferredProsodyLlmPrompt`, but JSON output is `tagInsertions` (+ optional style), not full `taggedText`. */
export function composeDeferredProsodyIndexLlmPrompt(params: {
  canonText: string;
  catalog: TtsSpeechTagCatalog;
  language: string;
  includeVendorStylePromptEn?: boolean;
}): string {
  const requestLlmStylePrompt =
    params.includeVendorStylePromptEn === true &&
    params.catalog.deferredProsodyStylePromptLlm === true;
  const system = buildSystemPrompt(params.catalog, params.language, requestLlmStylePrompt, 'tag_index_json');
  const user = buildUserPrompt(params.canonText);
  return `${system}\n\n---\n\n${user}`;
}

export interface DeferredProsodyEnrichParams {
  canonText: string;
  catalog: TtsSpeechTagCatalog;
  language: string;
  storyId?: string;
  onUsage?: (u: UsageMetadata) => void;
  /**
   * When true and the catalog declares `deferredProsodyStylePromptLlm`, the LLM must also return
   * `vendorStylePromptEn` (English) for vendor synthesis style (e.g. Gemini-TTS text `prompt`). Omit/false
   * for catalogs that do not use a separate style prompt — the model then only returns `taggedText`.
   */
  includeVendorStylePromptEn?: boolean;
  /**
   * When true, `branchDiagnostics` is filled with per-branch LLM payloads and post-finalize outcomes
   * (for scripts / A/B comparison). Production callers should omit.
   */
  captureBranchDiagnostics?: boolean;
}

/** Populated when `captureBranchDiagnostics` was true on the request. */
export interface DeferredProsodyBranchDiagnostics {
  deferredProsodyParallelIndex: boolean;
  winner: 'index_json' | 'full_text' | 'none';
  fullText: {
    status: 'fulfilled' | 'rejected';
    errorMessage?: string;
    rawParsed?: Record<string, unknown>;
    finalizeOk: boolean;
    /** String after sanitize/repair/projection pipeline (may equal canon if finalize failed). */
    taggedAfterFinalize: string;
    style?: string;
  };
  indexJson: {
    status: 'fulfilled' | 'rejected' | 'skipped';
    errorMessage?: string;
    rawParsed?: Record<string, unknown>;
    /** Result of `applyDeferredProsodyIndexInsertions` before finalize; null if none applied. */
    appliedBeforeFinalize: string | null;
    finalizeOk: boolean;
    taggedAfterFinalize: string;
    style?: string;
  };
}

export interface DeferredProsodyEnrichResult {
  taggedText: string;
  /** Set when caller requested style prompt and catalog supports it; passed to synthesis as `synthesizeStylePromptEn` (e.g. Gemini-TTS `prompt`). */
  vendorStylePromptEn?: string;
  usedLlm: boolean;
  branchDiagnostics?: DeferredProsodyBranchDiagnostics;
}

function trimVendorStyleFromParsed(
  parsed: Record<string, unknown> | undefined,
  storyId?: string
): string | undefined {
  if (!parsed) return undefined;
  const rawStyle =
    (typeof parsed.vendorStylePromptEn === 'string' ? parsed.vendorStylePromptEn : '') ||
    (typeof parsed.geminiStylePromptEn === 'string' ? parsed.geminiStylePromptEn : '');
  let vendorStylePromptEn = rawStyle.trim();
  if (vendorStylePromptEn.length > DEFER_STYLE_PROMPT_MAX_CHARS) {
    const prevLen = vendorStylePromptEn.length;
    vendorStylePromptEn = vendorStylePromptEn.slice(0, DEFER_STYLE_PROMPT_MAX_CHARS).trim();
    logger.warn(
      { storyId, prevLen, newLen: vendorStylePromptEn.length },
      `Trimmed vendorStylePromptEn to ${DEFER_STYLE_PROMPT_MAX_CHARS} chars`
    );
  }
  return vendorStylePromptEn || undefined;
}

function finalizeTaggedProsodyOnCanon(params: {
  taggedIn: string;
  canonText: string;
  catalog: TtsSpeechTagCatalog;
  language: string;
  storyId?: string;
  sourceLabel: 'full_text' | 'index_json';
}): { ok: boolean; tagged: string } {
  const { taggedIn, canonText, catalog, language, storyId, sourceLabel } = params;
  let tagged = taggedIn.trim();
  if (!tagged) return { ok: false, tagged: canonText };
  const { text: sanitized } = sanitizeVendorMarkup(tagged, catalog);
  tagged = sanitized;

  if (!validateTaggedAgainstCanon(tagged, canonText, catalog, language)) {
    const repair = attemptRepairTaggedTextToMatchCanon(tagged, canonText, catalog, language);
    if (repair.repaired) {
      tagged = repair.text;
    }
    if (!validateTaggedAgainstCanon(tagged, canonText, catalog, language)) {
      const projected = projectApprovedBracketTagsOntoCanon(tagged, canonText, catalog, language);
      if (projected.ok) {
        tagged = projected.text;
        logger.info(
          {
            storyId,
            tagCount: projected.tagCount,
            reason: projected.reason,
            prosodySource: sourceLabel,
          },
          'Prosody: applied bracket tags from LLM output onto canon (alignment projection)'
        );
      }
    }
    if (!validateTaggedAgainstCanon(tagged, canonText, catalog, language)) {
      logger.debug(
        {
          storyId,
          prosodySource: sourceLabel,
          mismatchIndex: explainTaggedCanonMismatch(tagged, canonText, catalog, language).index,
        },
        'Prosody branch failed canon after repair/projection'
      );
      return { ok: false, tagged: canonText };
    }
  }
  const sentenceInitialTagged = moveApprovedBracketTagsToSentenceStarts(tagged, catalog);
  if (sentenceInitialTagged !== tagged) {
    if (validateTaggedAgainstCanon(sentenceInitialTagged, canonText, catalog, language)) {
      tagged = sentenceInitialTagged;
      logger.info(
        { storyId, prosodySource: sourceLabel },
        'Prosody: moved bracket tags to sentence starts'
      );
    } else {
      logger.warn(
        { storyId, prosodySource: sourceLabel },
        'Prosody: sentence-start tag normalization failed canon validation; keeping prior tagged text'
      );
    }
  }
  return { ok: true, tagged };
}

/**
 * Returns tagged text for one TTS chunk, or original canon on skip/failure.
 */
export async function enrichDeferredProsodyForTtsChunk(
  params: DeferredProsodyEnrichParams
): Promise<DeferredProsodyEnrichResult> {
  const {
    canonText,
    catalog,
    language,
    storyId,
    onUsage,
    includeVendorStylePromptEn,
    captureBranchDiagnostics: captureDiag,
  } = params;

  if (catalog.markupModel === 'none_use_instructions') {
    return { taggedText: canonText, usedLlm: false };
  }

  if (!canonText.trim()) {
    return { taggedText: canonText, usedLlm: false };
  }

  const requestLlmStylePrompt =
    includeVendorStylePromptEn === true && catalog.deferredProsodyStylePromptLlm === true;

  try {
    const textProvider = getTextProvider();
    const schemaFull = responseSchemaForCatalog(catalog, requestLlmStylePrompt);
    const schemaIndex = responseIndexSchemaForCatalog(catalog, requestLlmStylePrompt);
    const baseBudget = Math.min(65536, Math.max(32768, Math.ceil(canonText.length * 1.5) + 20000));
    /** 1.5× headroom vs truncation on long tagged JSON + Gemini “thinking” against output budget. */
    const maxTokens = Math.min(98304, Math.ceil(baseBudget * 1.5));
    const prosodyModel = config.ai.ttsProsodyTagsModel;

    const parallelIndex =
      catalog.wrappingTagNames.length === 0 && catalog.inlineBracketTags.length > 0;

    logger.info(
      {
        storyId,
        prosodyModel,
        canonChars: canonText.length,
        maxTokens,
        requestLlmStylePrompt,
        deferredProsodyParallelIndex: parallelIndex,
      },
      'Deferred prosody: calling structured LLM(s)'
    );

    const promptFull = composeDeferredProsodyLlmPrompt({
      canonText,
      catalog,
      language,
      includeVendorStylePromptEn,
    });
    const promptIndex = composeDeferredProsodyIndexLlmPrompt({
      canonText,
      catalog,
      language,
      includeVendorStylePromptEn,
    });

    const runFull = async (): Promise<{
      tagged: string;
      style?: string;
      raw?: Record<string, unknown>;
    } | null> => {
      const parsed = await textProvider.generateStructured<{
        taggedText: string;
        vendorStylePromptEn?: string;
      }>({
        prompt: promptFull,
        schema: schemaFull,
        model: prosodyModel,
        temperature: DEFERRED_PROSODY_LLM_TEMPERATURE,
        maxTokens,
        operation: USAGE_OP_TTS_PROSODY_TAGS,
        onUsage,
      });
      const raw = captureDiag ? ({ ...(parsed as object) } as Record<string, unknown>) : undefined;
      const tagged = (parsed?.taggedText ?? '').trim();
      if (!tagged) {
        return captureDiag && raw ? { tagged: '', style: undefined, raw } : null;
      }
      return {
        tagged,
        style: trimVendorStyleFromParsed(parsed as Record<string, unknown>, storyId),
        ...(raw ? { raw } : {}),
      };
    };

    const runIndex = async (): Promise<{
      tagged: string;
      style?: string;
      raw?: Record<string, unknown>;
      appliedBeforeFinalize: string | null;
    } | null> => {
      const parsed = await textProvider.generateStructured<{
        tagInsertions?: unknown;
        vendorStylePromptEn?: string;
      }>({
        prompt: promptIndex,
        schema: schemaIndex,
        model: prosodyModel,
        temperature: DEFERRED_PROSODY_LLM_TEMPERATURE,
        maxTokens,
        operation: USAGE_OP_TTS_PROSODY_TAGS,
        onUsage,
      });
      const raw = captureDiag ? ({ ...(parsed as object) } as Record<string, unknown>) : undefined;
      const applied = applyDeferredProsodyIndexInsertions(
        canonText,
        parsed?.tagInsertions,
        catalog
      );
      const appliedBeforeFinalize = applied?.trim() ? applied : null;
      if (!appliedBeforeFinalize) {
        return captureDiag && raw
          ? { tagged: '', style: undefined, raw, appliedBeforeFinalize: null }
          : null;
      }
      return {
        tagged: appliedBeforeFinalize,
        style: trimVendorStyleFromParsed(parsed as Record<string, unknown>, storyId),
        ...(raw ? { raw } : {}),
        appliedBeforeFinalize,
      };
    };

    const fullP = runFull();
    const indexP = parallelIndex ? runIndex() : Promise.resolve(null);
    const [fullSettled, indexSettled] = await Promise.allSettled([fullP, indexP]);

    const fullVal = fullSettled.status === 'fulfilled' ? fullSettled.value : null;
    const indexVal = indexSettled.status === 'fulfilled' ? indexSettled.value : null;

    const fullRaw = fullVal?.raw;
    const indexRaw = indexVal?.raw;

    if (fullSettled.status === 'rejected') {
      logger.warn({ err: fullSettled.reason, storyId }, 'Deferred prosody full-text LLM rejected');
    }
    if (parallelIndex && indexSettled.status === 'rejected') {
      logger.warn({ err: indexSettled.reason, storyId }, 'Deferred prosody index-json LLM rejected');
    }

    const fullFinal = fullVal
      ? finalizeTaggedProsodyOnCanon({
          taggedIn: fullVal.tagged,
          canonText,
          catalog,
          language,
          storyId,
          sourceLabel: 'full_text',
        })
      : { ok: false, tagged: canonText };
    const indexFinal = indexVal
      ? finalizeTaggedProsodyOnCanon({
          taggedIn: indexVal.tagged,
          canonText,
          catalog,
          language,
          storyId,
          sourceLabel: 'index_json',
        })
      : { ok: false, tagged: canonText };

    let winner: 'index_json' | 'full_text' | 'none' = 'none';
    let tagged = canonText;
    let vendorStylePromptEn: string | undefined;

    if (indexFinal.ok) {
      winner = 'index_json';
      tagged = indexFinal.tagged;
      vendorStylePromptEn = indexVal?.style;
    } else if (fullFinal.ok) {
      winner = 'full_text';
      tagged = fullFinal.tagged;
      vendorStylePromptEn = fullVal?.style;
    }

    if (requestLlmStylePrompt) {
      if (winner === 'index_json' && !vendorStylePromptEn?.trim() && fullVal?.style) {
        vendorStylePromptEn = fullVal.style;
      } else if (winner === 'full_text' && !vendorStylePromptEn?.trim() && indexVal?.style) {
        vendorStylePromptEn = indexVal.style;
      }
    }

    const branchDiagnostics: DeferredProsodyBranchDiagnostics | undefined = captureDiag
      ? {
          deferredProsodyParallelIndex: parallelIndex,
          winner,
          fullText: {
            status: fullSettled.status,
            errorMessage:
              fullSettled.status === 'rejected'
                ? String((fullSettled.reason as Error)?.message ?? fullSettled.reason)
                : undefined,
            rawParsed: fullRaw,
            finalizeOk: fullFinal.ok,
            taggedAfterFinalize: fullFinal.tagged,
            style: fullVal?.style,
          },
          indexJson: {
            status: parallelIndex ? indexSettled.status : 'skipped',
            errorMessage:
              parallelIndex && indexSettled.status === 'rejected'
                ? String((indexSettled.reason as Error)?.message ?? indexSettled.reason)
                : undefined,
            rawParsed: indexRaw,
            appliedBeforeFinalize: indexVal?.appliedBeforeFinalize ?? null,
            finalizeOk: indexFinal.ok,
            taggedAfterFinalize: indexFinal.tagged,
            style: indexVal?.style,
          },
        }
      : undefined;

    if (winner === 'none') {
      let failedTagged = '';
      if (fullVal?.tagged) {
        failedTagged = sanitizeVendorMarkup(fullVal.tagged, catalog).text;
      } else if (indexVal?.tagged) {
        failedTagged = indexVal.tagged;
      }
      if (failedTagged.trim()) {
        const detail = explainTaggedCanonMismatch(failedTagged, canonText, catalog, language);
        const lexicalDiff = evaluateProsodyLexicalDiffPolicy(failedTagged, canonText, catalog, language);
        const diffSnippet = lexicalDiff.unifiedDiffLexicalNormalized.slice(0, 12_000);
        logger.error(
          {
            storyId,
            markupModel: catalog.markupModel,
            previewCanon: canonText.slice(0, 120),
            mismatchIndex: detail.index,
            lenStrippedNormalized: detail.lenA,
            lenCanonNormalized: detail.lenB,
            windowStripped: detail.windowA,
            windowCanon: detail.windowB,
            prosodyLexicalPolicy: lexicalDiff.policySummary,
            approvedBracketTagCount: lexicalDiff.approvedBracketTagCount,
            unifiedDiffLexicalNormalized: diffSnippet,
            deferredProsodyParallelIndex: parallelIndex,
          },
          'Prosody LLM parallel outputs failed canon validation — falling back to untagged text'
        );
      } else {
        logger.error({ storyId, deferredProsodyParallelIndex: parallelIndex }, 'Prosody LLM returned empty output');
      }
      return {
        taggedText: canonText,
        usedLlm: false,
        ...(branchDiagnostics ? { branchDiagnostics } : {}),
      };
    }

    logger.info({ storyId, deferredProsodyWinner: winner, deferredProsodyParallelIndex: parallelIndex }, 'Deferred prosody: chose LLM branch');

    return {
      taggedText: tagged,
      vendorStylePromptEn,
      usedLlm: true,
      ...(branchDiagnostics ? { branchDiagnostics } : {}),
    };
  } catch (err) {
    logger.error(
      {
        err,
        storyId,
        prosodyModel: config.ai.ttsProsodyTagsModel,
        canonChars: canonText.length,
        hint: 'Often MAX_TOKENS on Gemini 3 + long tagged JSON; GEMINI_TTS_PROSODY_MODEL defaults to gemini-2.5-flash. Regenerate audio after deploy.',
      },
      'Prosody LLM tagging failed — falling back to untagged text'
    );
    return { taggedText: canonText, usedLlm: false };
  }
}

/**
 * Reads English vendor synthesis style from persisted `generation_params`.
 * Accepts legacy key `geminiStylePromptEn` when `vendorStylePromptEn` is absent.
 */
export function readVendorStylePromptEnFromGenerationParams(gp: unknown): string {
  if (!gp || typeof gp !== 'object') return '';
  const o = gp as Record<string, unknown>;
  const v = o.vendorStylePromptEn;
  if (typeof v === 'string' && v.trim()) return v.trim();
  const legacy = o.geminiStylePromptEn;
  if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();
  return '';
}
