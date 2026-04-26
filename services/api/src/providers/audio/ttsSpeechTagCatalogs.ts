/**
 * Static TTS speech-tag catalogs for LLM prosody + sanitization (aligned with vendor docs).
 * Re-sync with official docs when vendors update tag lists.
 */

import type { TtsSpeechTagCatalog } from '../base/TtsSpeechTagCatalog';
import { getAllAudioTags } from '../../constants/audioTags';

/** ElevenLabs v3 — uses project constants (official v3 bracket tags). */
export function buildElevenLabsV3SpeechTagCatalog(): TtsSpeechTagCatalog {
  const inlineBracketTags = [...new Set(getAllAudioTags().map((t) => t.toLowerCase()))].sort();
  return {
    markupModel: 'bracket_only',
    inlineBracketTags,
    wrappingTagNames: [],
    promptConstraints: [
      'Do not use SSML such as <break time="..."/> for Eleven v3 — pauses use approved bracket tags or punctuation only.',
      'Do not use angle-bracket wrappers (<tag>...</tag>) for this vendor.',
    ],
    pauseInstructionsForLlm: [
      'Use ONLY these pause-related bracket tags when they appear in the allowed list: typically [short pause], [pause], [long pause] plus pacing tags like [rushed], [stammers], [drawn out], [slows down], [deliberate] if listed.',
      'Insert pauses at: major beat before a revelation; after a rhetorical question; before a quoted line for weight; comedic beat (sparingly).',
      'Cap: roughly 1–3 pause/pacing tags per scene unless the scene is very long — avoid stacking multiple pause tags back-to-back without words between.',
      'Prefer combining with punctuation (…, em dash) for light pauses; use explicit pause tags for stronger rhythm.',
    ].join('\n'),
  };
}

/** xAI Grok TTS — inline + wrapping per https://docs.x.ai/developers/model-capabilities/audio/text-to-speech#speech-tags */
export function buildGrokSpeechTagCatalog(): TtsSpeechTagCatalog {
  /** Inline `[...]` tags from xAI Grok speech-tag guide (names only, lowercase, hyphenated). */
  const inlineBracketTags = [
    'breath',
    'chuckle',
    'clears throat',
    'cough',
    'cry',
    'exhale',
    'gasp',
    'giggle',
    'hum-tune',
    'inhale',
    'laugh',
    'lip-smack',
    'long-pause',
    'pause',
    'sigh',
    'tongue-click',
    'tsk',
  ].sort();
  /** Wrapping pairs `<name>…</name>` from xAI speech-tag guide (lowercase names). */
  const wrappingTagNames = [
    'build-intensity',
    'decrease-intensity',
    'emphasis',
    'fast',
    'higher-pitch',
    'laugh-speak',
    'loud',
    'lower-pitch',
    'sing-song',
    'singing',
    'slow',
    'soft',
    'whisper',
  ].sort();
  return {
    markupModel: 'bracket_and_angle_wrap',
    inlineBracketTags,
    wrappingTagNames,
    promptConstraints: [
      'Wrapping tags: each `<name>…</name>` must use names from ALLOWED WRAPPING TAGS only, with matching open/close pairs. You MAY nest wrappers to combine styles (close inner before outer), e.g. <slow><soft>Goodnight, sleep well.</soft></slow>. Do not cross-mismatch tags.',
      'Place inline tags ([pause], [laugh], [breath], [hum-tune], etc.) where the expression naturally occurs; combine with punctuation.',
      'Avoid stacking the same inline tag twice in a row with no words between (e.g. [sigh][sigh]) unless the vendor example explicitly models it.',
      'Use wrappers around full phrases (several words), not single words — especially for whisper, soft, loud, build-intensity, singing.',
      'For irritable or grumbling delivery, prefer wrapping the line in <soft>…</soft> or <build-intensity>…</build-intensity> (phrase-level) plus [sigh] inline if it fits the whitelist.',
    ],
    pauseInstructionsForLlm: [
      'Use [pause] for a natural short beat; [long-pause] for dramatic timing before a key word or answer.',
      'Breathing and beats: [breath], [inhale], [exhale] for natural breaths; [sigh], [tsk], [lip-smack], [tongue-click] for subtle non-verbal cues — use sparingly for children\'s stories.',
      'Do not place two different inline tags flush against each other without at least a space or a word between unless it reads naturally.',
      'Limit heavy pause use so narration stays fluid for children.',
      'Follow the system prompt’s minimal-markup and density guidance: keep tagging sparse and age-appropriate.',
    ].join('\n'),
  };
}

/** Google Gemini / Gemini-TTS bracket tags (Cloud Markup + Gemini Audio; emotions align with Google "most commonly used" list). */
export function buildGoogleGeminiTtsSpeechTagCatalog(): TtsSpeechTagCatalog {
  /** Per Google Gemini TTS docs — frequent emotion / tone tags (English inside brackets). */
  const geminiCommonEmotionTags = [
    'determination',
    'enthusiasm',
    'adoration',
    'interest',
    'awe',
    'admiration',
    'nervousness',
    'frustration',
    'excitement',
    'curiosity',
    'hope',
    'annoyance',
    'amusement',
    'aggression',
    'tension',
    'agitation',
    'confusion',
    'anger',
    'positive',
    'neutral',
    'negative',
    'whispers',
    'laughs',
  ];
  /** Pauses, pacing, and extra tags from Gemini Audio / markup examples (keep for LLM + legacy text). */
  const geminiExtendedTags = [
    'sigh',
    'laughing',
    'uhm',
    'sarcasm',
    'robotic',
    'shouting',
    'whispering',
    'extremely fast',
    'scared',
    'curious',
    'bored',
    'short pause',
    'medium pause',
    'long pause',
    'gasp',
    'giggles',
    'excited',
    'sarcastic',
    'serious',
    'panicked',
    'trembling',
    'tired',
    'mischievously',
    'crying',
    'amazed',
    'very fast',
    'very slow',
    'sarcastically, one painfully slow word at a time',
    'reluctantly',
    'excitedly',
  ];
  const unique = [
    ...new Set([...geminiCommonEmotionTags, ...geminiExtendedTags].map((t) => t.toLowerCase())),
  ].sort();
  return {
    markupModel: 'bracket_only',
    deferredProsodyStylePromptLlm: true,
    inlineBracketTags: unique,
    wrappingTagNames: [],
    promptConstraints: [
      'No angle-bracket emotion wrappers in the transcript — use bracket tags and/or vendorStylePromptEn (English synthesis style) separately.',
      'For non-English transcript text, still use English words inside bracket tags per vendor guidance.',
      'Use only exact tags from the allowed list.',
      'Prefer tags that describe the required audible delivery over tags that only describe emotion.',
      'When the prose indicates a concrete vocal action, choose the closest allowed tag that can make that action audible.',
      'When a concrete vocal action and an emotional color are both present, do not choose between them. Use a delivery/acoustic tag for the vocal action and an emotion/attitude tag for the emotional color when the vendor allows layered tags.',
      'Some adjective-like tags may be vocalized or misinterpreted by the TTS engine; prefer concrete delivery and pause tags when they can achieve the same effect.',
      'Do not use [laughs], [laughing], or [giggles] merely to color a line as happy or amused. Use them only when an actual audible laugh should be inserted.',
      'Use [shouting] for shouted, yelled, cried out, loudly called, or raised-voice direct speech when the line should audibly become louder.',
      'Use [whispers] or [whispering] for whispered, quietly said, secretive, or hushed direct speech.',
      'Do not replace [shouting] with [excited], [excitedly], or [excitement] when the source text requires audible loudness; combine them when both loudness and excitement matter.',
      'Layered direct speech may use two non-pause tags before the quote when they represent different layers, such as [shouting] [excitedly] for joyful shouting or [whispers] [scared] for fearful whispering.',
      'Loud or intense moments should be brief, clear, and child-friendly rather than harsh.',
    ],
    pauseInstructionsForLlm: [
      'Pauses: [short pause] ~ brief beat, small hesitation, or light sentence-level breathing; [medium pause] ~ suspense beat, emotional pivot, meaningful sentence boundary, or scene turn; [long pause] ~ rare major reveal or strong dramatic silence.',
      'Place pauses only where they improve performance: emotional pivots, sudden sounds, cliffhanger questions, reveals, important quoted dialogue, or calm bedtime pacing.',
      'Do not stack pause tags without intervening text.',
      'Keep total pause tags within the system prompt’s soft density targets for the chunk length—prefer punctuation for light beats.',
    ].join('\n'),
  };
}

export function buildOpenAiTtsSpeechTagCatalog(): TtsSpeechTagCatalog {
  return {
    markupModel: 'none_use_instructions',
    inlineBracketTags: [],
    wrappingTagNames: [],
    promptConstraints: [
      'This TTS vendor is steered with API instructions, not inline transcript tags — return taggedText identical to input story text (no bracket or angle markup).',
    ],
    pauseInstructionsForLlm:
      'Do not add pause or emotion tags to the transcript. Pacing and tone belong in the separate instructions field handled outside this taggedText flow.',
  };
}
