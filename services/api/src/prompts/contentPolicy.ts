/**
 * Unified Content Policy — single source of truth for all content filters and instructions.
 * Consolidates: text (safety, DB rules, scenario overrides), images (negative, safety),
 * audio, validation.
 */

import type { PolicyProfile } from '../ai/types';

export const SCARY_STORIES_SCENARIO_ID = 'scary_stories';

export interface ContentPolicyOutput {
  /** Text: full section for prompts (safety + DB rules + scenario overrides) */
  textPromptSection: string;
  /** Images: negative prompt */
  imageNegativePrompt: string;
  /** Images: safety additions */
  imageSafetyAdditions: string;
  /** Images: modifier for night_calm (undefined = default) */
  imageStyleNightModifier?: string;
  /** Audio: full rules with guidance */
  audioTagsRules: string;
  /** Validation: rules for ValidationPrompt */
  validationRules: string;
}

/**
 * Get image-only content policy (for ImagePrompts when policyProfile not available).
 */
export function getImageContentPolicy(params: {
  ageGroup: string;
  scenarioCardId?: string;
}): Pick<ContentPolicyOutput, 'imageNegativePrompt' | 'imageSafetyAdditions' | 'imageStyleNightModifier'> {
  const isScaryStory = params.scenarioCardId === SCARY_STORIES_SCENARIO_ID;
  return {
    imageNegativePrompt: buildImageNegativePrompt(params.ageGroup, isScaryStory),
    imageSafetyAdditions: buildImageSafetyAdditions(params.ageGroup, isScaryStory),
    imageStyleNightModifier: buildImageStyleNightModifier(isScaryStory),
  };
}

/**
 * Get unified content policy output for all consumers.
 * No problem-solving, emotional validation, family support — those come from goal/goalGuidance when parent selects moral.
 */
export function getContentPolicy(params: {
  policyProfile: PolicyProfile;
  scenarioCardId?: string;
}): ContentPolicyOutput {
  const { policyProfile, scenarioCardId } = params;
  const ageGroup = policyProfile.ageGroup;
  const isScaryStory = scenarioCardId === SCARY_STORIES_SCENARIO_ID;

  return {
    textPromptSection: buildTextPromptSection(policyProfile, isScaryStory, ageGroup),
    imageNegativePrompt: buildImageNegativePrompt(ageGroup, isScaryStory),
    imageSafetyAdditions: buildImageSafetyAdditions(ageGroup, isScaryStory),
    imageStyleNightModifier: buildImageStyleNightModifier(isScaryStory),
    audioTagsRules: buildAudioTagsRules(isScaryStory),
    validationRules: buildValidationRules(policyProfile, isScaryStory, ageGroup),
  };
}

function buildTextPromptSection(
  policy: PolicyProfile,
  isScaryStory: boolean,
  ageGroup: string
): string {
  const sections: string[] = [];

  sections.push(
    'SAFETY GUIDELINES:',
    '- All content must be age-appropriate and safe',
  );

  // DB promptGuidelines (from content_policy_rules)
  if (policy.promptGuidelines && policy.promptGuidelines.trim()) {
    sections.push('', policy.promptGuidelines);
  }

  // Scenario overrides: scary_stories — relaxed fear rules + age-specific requirements
  if (isScaryStory) {
    sections.push('', getScaryStoryRequirements(ageGroup));
  }

  return sections.join('\n');
}

function getScaryStoryRequirements(ageGroup: string): string {
  const requirements: Record<string, string[]> = {
    '4-5': [
      'SCARY STORY REQUIREMENTS (Ages 4-5: Gentle Goosebumps):',
      '- Tone: Playfully spooky with light "goosebumps" moments',
      '- Elements: Dark corners, strange shadows, silly monsters with slight tension',
      '- Tension: Brief "uh-oh" moments, quickly resolved with humor or relief',
      '- Resolution: FAST positive ending within 1-2 scenes of any tension',
      '- Style: Hotel Transylvania, Room on the Broom — playful spooky, not frightening',
    ],
    '6-8': [
      'SCARY STORY REQUIREMENTS (Ages 6-8: Real Tension):',
      '- Tone: Genuine mystery with safe, positive outcomes',
      '- Elements: Creepy atmosphere, mysterious sounds, hidden secrets, brief scares',
      '- Tension: Real "goosebumps" allowed, moments of fear with quick relief',
      '- Resolution: Mystery solved, fears overcome, friendship or understanding formed',
      '- Style: Mild Goosebumps — spooky atmosphere YES, nightmares NO',
    ],
    '9-12': [
      'SCARY STORY REQUIREMENTS (Ages 9-12: Classic Kid Horror):',
      '- Tone: Sustained suspense, classic scary story feel',
      '- Elements: Creepy settings, mysterious creatures, unexplained phenomena',
      '- Tension: Can build across multiple scenes, real "shivers" allowed',
      '- Resolution: Mystery solved through cleverness, positive ending with accomplishment',
      '- FORBIDDEN: Graphic violence, gore, nightmares, traumatizing scenes',
      '- Style: Goosebumps series, Coraline — real suspense YES, trauma NO',
    ],
  };

  const ageReqs = requirements[ageGroup] || requirements['6-8'];
  return ageReqs.join('\n');
}

function buildImageNegativePrompt(ageGroup: string, isScaryStory: boolean): string {
  const baseNegative = [
    'violent', 'gore', 'blood',
    'sexual', 'nude', 'inappropriate',
    'text', 'letters', 'words', 'writing', 'typography', 'font',
    'watermark', 'logo', 'signature', 'label', 'sign', 'banner',
    'speech bubbles', 'dialogue bubbles', 'text bubbles', 'captions',
    'character captions', 'character name labels', 'name labels',
    'subtitles', 'written text', 'words on image', 'text on screen',
    'text on objects', 'text on clothing', 'text on buildings',
    'numbers', 'digits', 'symbols on image', 'written symbols',
    'alphabet', 'characters', 'glyphs', 'inscriptions',
    'photorealistic', 'photo', 'photograph', 'realistic photo',
    'real person', 'camera', 'photography', 'stock photo', 'selfie',
    'realistic photograph', 'photographic', 'real life photo',
    'deformed', 'ugly', 'blurry', 'low quality',
    'extra limbs', 'distorted face', 'bad anatomy',
  ];

  // For scary_stories 4-12: do NOT add scary, horror, darkness, monsters
  // For others: add scary, horror; for 0-3 also add darkness, shadows, monsters, scary faces
  if (!isScaryStory) {
    baseNegative.unshift('scary', 'horror');
    if (ageGroup === '0-1' || ageGroup === '1y' || ageGroup === '2-3') {
      baseNegative.push('darkness', 'shadows', 'monsters', 'scary faces');
    }
  }

  return baseNegative.join(', ');
}

function buildImageSafetyAdditions(ageGroup: string, isScaryStory: boolean): string {
  const baseSafety = 'safe for children, friendly, positive, age-appropriate';

  if (isScaryStory) {
    return `${baseSafety}, age-appropriate spooky atmosphere allowed, mysterious, eerie`;
  }

  if (ageGroup === '0-1' || ageGroup === '1y') {
    return `${baseSafety}, no scary elements, pure comfort and safety`;
  }
  if (ageGroup === '2-3') {
    return `${baseSafety}, no frightening imagery, gentle and reassuring`;
  }
  if (ageGroup === '4-5' || ageGroup === '6-8') {
    return `${baseSafety}, friendly atmosphere, no scary or threatening elements`;
  }

  return baseSafety;
}

function buildImageStyleNightModifier(isScaryStory: boolean): string | undefined {
  if (isScaryStory) {
    return 'mysterious, slightly eerie atmosphere allowed';
  }
  return 'but not scary';
}

function buildAudioTagsRules(isScaryStory: boolean): string {
  const baseRules = [
    'AUDIO TAGS USAGE:',
    'Integrate audio tags in square brackets [tag] to enhance emotional delivery for text-to-speech.',
    'Use EXACTLY the official ElevenLabs v3 formats below (case-sensitive, lowercase only).',
    '',
    'OFFICIAL SUPPORTED TAGS:',
    'Emotions: [happy], [sad], [excited], [angry], [thoughtful], [curious], [surprised], [annoyed]',
    'Delivery: [whisper], [shouting], [sarcastic], [mischievously]',
    'Non-verbal: [laughing], [chuckles], [sighs], [clears throat], [exhales sharply], [inhales deeply]',
    'Timing: [short pause], [long pause]',
    '',
    'CRITICAL - Tag Format Rules:',
    '- Use EXACT formats above (NOT [whispers], [giggles], [gasps] - these will be spoken literally!)',
    '- Lowercase only (NOT [WHISPER] or [Whisper])',
    '- Place tags before/after dialogue segments or at natural pauses',
    '',
    'PROSE DELIVERY → MUST TAG (TTS does not infer from attributions):',
    '- If attribution or narration says how a line is spoken (whispered, murmured, muttered, spoke softly, under her breath, shouted, yelled, cried out, called loudly, etc.), add the closest official Delivery tag for that quoted speech. Words like "whispered" alone do not change TTS delivery; [whisper] or [shouting] does.',
    '- Map to supported tags only: whisper / murmur / mutter / softly / quietly / under his breath → [whisper]; shout / yell / cry out / bellow / loudly → [shouting].',
    '- Put the tag on the same beat as the dialogue—typically immediately before the opening quote for that line.',
    '',
    'FORBIDDEN - Do NOT use screenplay/script markup:',
    '- No _narrator_, _character_Name_, _dialog_, or similar underscore tags',
    '- Write dialogue as normal quoted text within the narrative (e.g. "Hello!" said Emilia)',
    '- Use ONLY [tag] in square brackets for audio expression',
    '',
    'Examples:',
    "- '[excited] Look at that beautiful sunset!'",
    "- 'She opened the door slowly. [exhales sharply] The room was filled with treasure!'",
    "- '[laughing] This is so much fun! [excited] Let\\'s try again!'",
    '',
  ];

  const safetyGuidance = isScaryStory
    ? 'SAFETY: Use child-appropriate audio tags from approved list. For scary stories, suspenseful tags like [whisper], [exhales sharply], [inhales deeply] are encouraged for atmosphere. Avoid [gunshot], [explosion].'
    : 'SAFETY: Only use child-appropriate audio tags from approved list above. Avoid scary sounds ([gunshot], [explosion]), aggressive emotions. Prefer gentle, playful tags like [chuckles], [laughing], [excited], [whisper], [curious].';

  baseRules.push(
    safetyGuidance,
    '',
    'Use tags wherever they improve how the narration sounds—emotion, pacing, delivery, and reactions—still only from the approved list above.',
  );

  return baseRules.join('\n');
}

function buildValidationRules(policy: PolicyProfile, isScaryStory: boolean, ageGroup: string): string {
  const readingComplexityAgeGroup = policy.readingComplexityAgeGroup ?? ageGroup;
  const rules = [
    `1. Content must be safe and age-appropriate for ${ageGroup}`,
    `2. Themes, conflict, and emotional intensity must match age group ${ageGroup}`,
    `3. Vocabulary, syntax, and sentence complexity must match reading complexity group ${readingComplexityAgeGroup}`,
    '4. Be fair — only flag real safety issues, not minor style choices',
  ];

  if (policy.promptGuidelines && policy.promptGuidelines.trim()) {
    rules.push('', 'DB CONTENT POLICY TO ENFORCE:', policy.promptGuidelines);
  }

  if (isScaryStory) {
    rules.push('', getScaryStoryRequirements(ageGroup));
  }

  return rules.join('\n');
}
