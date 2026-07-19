/**
 * Prompt Helper Functions
 * Reusable utilities for building prompts
 *
 * These are pure functions that format story parameters, child profiles,
 * safety policies, etc. They are used by all prompt builders.
 */

import type { StorySpec, PolicyProfile } from '../ai/types';
import type { JsonSchema } from '../providers/base/JsonSchema';
import { getLanguageFullDisplay, stripCharacterIdFromName, type Locale } from '@wondertales/shared';
import { getTextStyleGuidance } from './image/styles';
import { getContentPolicy } from './contentPolicy';
import {
  MAX_SCENE_IMAGE_CHARACTERS,
  TARGET_SCENE_IMAGE_CHARACTERS,
} from '../domain/story/sceneCharacterLimits';

/**
 * Get full language display name from code
 * @param code - Language code (uk, ru, en, es, de, fr, pl)
 * @returns Full language name (e.g., "Ukrainian (Українська)")
 */
export function getLanguageName(code: Locale): string {
  return getLanguageFullDisplay(code);
}

export function formatWriterCharacterName(name: string): string {
  return stripCharacterIdFromName(name).trim() || name;
}

export function formatStoryTitleRules(options: { isContinuation?: boolean } = {}): string {
  return [
    '- Reflect the essence of this specific story: the main event, conflict, choice, transformation, unusual object, or memorable place.',
    '- Be creative and imaginative; avoid generic adventure-title templates.',
    '- Keep the title short, natural, and story-specific; usually 2-7 words.',
    '- Spark curiosity through one concrete story detail rather than an abstract label.',
    options.isContinuation
      ? '- For continuations: do not use episode labels; give this episode its own unique title.'
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatStoryTitleSection(options: { isContinuation?: boolean } = {}): string {
  return `TITLE:\n${formatStoryTitleRules(options)}`;
}

export interface ContinuationCharacter {
  name: string;
  type: string;
  description?: string;
  role?: string;
}

export interface ContinuationPromptContext {
  previousOutlines?: Array<{
    title: string;
    moral?: string;
    scenes: Array<{ setting: string; goal: string }>;
  }>;
  requiredCharacters?: ContinuationCharacter[];
  optionalCharacters?: ContinuationCharacter[];
  usedPlots?: string[];
  previousEnvironments?: Array<{
    id: string;
    name: string;
    description: string;
    characterOutfits?: string;
  }>;
  previousOutfits?: Array<{ id: string; characterName: string; description: string }>;
}

export function formatPreviousEpisodesSummary(
  previousOutlines?: ContinuationPromptContext['previousOutlines']
): string {
  const validOutlines = (previousOutlines || []).filter((outline) => outline?.title);
  if (validOutlines.length === 0) return '';

  const text = validOutlines
    .map((outline, i) => {
      const validScenes = (outline.scenes || [])
        .map((s) => s.goal)
        .filter((goal) => goal && goal.trim().length > 0);
      let episodeText = `Episode ${i + 1}: "${outline.title}"`;
      if (validScenes.length > 0) episodeText += `\n- Key Scenes: ${validScenes.join('; ')}`;
      return episodeText;
    })
    .join('\n\n');

  return `PREVIOUS EPISODES SUMMARY:\n${text}`;
}

export function formatContinuationStoryContext(params: {
  context?: ContinuationPromptContext;
  mode: 'plain_text' | 'graphic_novel' | 'mixed_story';
}): string {
  const context = params.context;
  const previousOutlines = context?.previousOutlines || [];
  if (previousOutlines.length === 0) return '';

  const partNumber = previousOutlines.length + 1;
  const requiredCount = context?.requiredCharacters?.length || 0;
  const optionalCount = context?.optionalCharacters?.length || 0;
  const usedPlots = (context?.usedPlots || []).filter((plot) => plot && plot.trim().length > 0);
  const formatLabel =
    params.mode === 'graphic_novel'
      ? 'graphic novel script'
      : params.mode === 'mixed_story'
        ? 'mixed prose/comic script'
        : 'plain text story';

  const lines = [
    formatPreviousEpisodesSummary(previousOutlines),
    '',
    'STORY CONTINUATION:',
    `- This is Part ${partNumber} of the series in ${formatLabel} format.`,
    `- Connect to Part ${partNumber - 1} through concrete events, character choices, or outcomes already shown.`,
    '- Use the current STORY INPUT Theme / goal as the only moral guidance for this episode; previous episode morals are not carried forward.',
    requiredCount > 0 ? '- Feature all REQUIRED characters listed in CHARACTERS.' : null,
    optionalCount > 0
      ? '- OPTIONAL characters may appear only when they naturally fit this episode.'
      : null,
    '- Create fresh events and challenges while keeping the episode understandable on its own.',
    usedPlots.length > 0
      ? `- Choose plot beats that differ from already-used plot elements: ${usedPlots.join(', ')}`
      : null,
    '- Maintain the same tone and age-appropriateness.',
    '- Resolve this episode warmly and clearly.',
  ].filter(Boolean);

  return lines.join('\n');
}

export function formatContinuationLocationMemory(
  previousEnvironments?: ContinuationPromptContext['previousEnvironments']
): string {
  const valid = (previousEnvironments || []).filter((env) => env?.name && env?.description);
  if (valid.length === 0) return '';

  return [
    'LOCATION CONTINUITY:',
    '- When this episode returns to the same place as an earlier part, reuse the same location name and recurring cues.',
    '- For genuinely new places, establish a distinct name and setting.',
    ...valid.map(
      (env) =>
        `- ${env.name}: ${env.description.slice(0, 120)}${env.description.length > 120 ? '...' : ''}`
    ),
  ].join('\n');
}

export function formatContinuationOutfitMemory(
  previousOutfits?: ContinuationPromptContext['previousOutfits']
): string {
  const valid = (previousOutfits || []).filter(
    (outfit) => outfit?.characterName && outfit?.description
  );
  if (valid.length === 0) return '';

  return [
    'WARDROBE CONTINUITY:',
    '- Use these prior wardrobe facts only when continuity, weather, disguise, pajamas, costume, or safety gear matters naturally.',
    ...valid.map(
      (outfit) =>
        `- ${formatWriterCharacterName(outfit.characterName)}: ${outfit.description.slice(0, 100)}${outfit.description.length > 100 ? '...' : ''}`
    ),
  ].join('\n');
}

export function formatContentPolicySection(spec: StorySpec): string {
  return `CONTENT POLICY:
${
  getContentPolicy({
    policyProfile: spec.policyProfile,
    scenarioCardId: spec.scenarioCard?.id,
  }).textPromptSection
}`;
}

export function formatStructuredStoryInputSection(
  spec: StorySpec,
  options: { includeIllustrationStyle?: boolean } = {}
): string {
  const themeGuidance = spec.scenarioCard?.promptGuidance?.trim();
  const creativeSeed = spec.scenarioGuidance?.trim();
  const hasDistinctThemeGuidance =
    !!themeGuidance && (!creativeSeed || themeGuidance !== creativeSeed);
  const lines = [
    'STORY INPUT:',
    `- Language: ${spec.language}`,
    `- Age group: ${spec.ageGroup}`,
    `- Reading complexity group: ${spec.storyComplexityAgeGroup ?? spec.ageGroup} (use for vocabulary, syntax, and text density only; content maturity and safety stay at age group ${spec.ageGroup})`,
    `- Theme / goal: ${spec.goalName || spec.goal || 'open-ended'}`,
    `- Scenario: ${spec.scenarioCard?.name || spec.scenarioCard?.id || 'none'}`,
    `- Theme guidance (binding): ${hasDistinctThemeGuidance ? themeGuidance : 'none'}`,
    `- Creative seed (loose direction, not an outline): ${creativeSeed || 'none'}`,
    `- World rule: ${spec.worldRule ? `${spec.worldRule.name}: ${spec.worldRule.description}` : 'none'}`,
    `- User notes: ${(spec as any).userNotes || 'none'}`,
  ];

  if (creativeSeed) {
    lines.push(
      "- Creative latitude: keep the seed's core thematic direction, but freely invent the conflict, story events, supporting cast, surprises, and resolution. Do not treat the seed as a required scene sequence."
    );
  }

  if (options.includeIllustrationStyle) {
    lines.push(`- Illustration style: ${(spec as any).imageStyle || 'soft_watercolor'}`);
  }

  return lines.join('\n');
}

export function formatStructuredOutfitRules(
  options: { includeChangeRules?: boolean } = {}
): string {
  const rules = [
    'OUTFITS:',
    '- Return a top-level outfits[] array. Each row has id, characterName, description.',
    '- Detailed wardrobe descriptions are ONLY for child/person/human characters. These rows drive outfit plate matching and dressed turnaround generation.',
    '- For child/person/human characters, outfits[].description is WARDROBE ONLY IN ENGLISH: garments, shoes, worn hats/helmets/hoods, bags, jewelry, glasses, swimwear, rain/snow gear, costumes.',
    '- Animal, imaginary, creature, object, vehicle, or environmental characters must use description exactly "natural appearance"; do not invent garment text for them.',
    '- Do not put face, hair, body, age, species, expression, personality, pose, or identity details in outfits[].description.',
    '- Every visual.sceneVisual.cameraComposition.characters[] row MUST include outfitId referencing one outfits[].id.',
    '- Include one outfit row for every outfitId used by a physically present character. Non-human rows are technical natural-appearance bindings only, not outfit-plate requests.',
  ];

  if (options.includeChangeRules) {
    rules.push(
      '- Reuse the same outfitId while the character keeps the same clothes; do not create per-panel outfitIds for pose, emotion, camera, or location changes.',
      '- Create a new outfitId only when the story explicitly changes clothes, adds a disguise/uniform/protective gear, or the scene clearly requires special wardrobe for safety/weather.',
      '- If the default/reference clothes still fit, use an outfit row with description exactly "natural appearance" instead of inventing wardrobe details.'
    );
  }

  return rules.join('\n');
}

export function structuredOutfitsJsonSchema(): JsonSchema {
  return {
    type: 'array',
    minItems: 1,
    items: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Short unique outfit id referenced by visual character rows.',
        },
        characterName: {
          type: 'string',
          description: 'Exact story character name that uses this outfit id.',
        },
        description: {
          type: 'string',
          description:
            'Wardrobe-only English for child/person/human characters. Use exactly "natural appearance" for animal, imaginary, creature, object, vehicle, or environmental characters.',
        },
      },
      required: ['id', 'characterName', 'description'],
    },
  };
}

export function structuredCameraCharacterOutfitIdJsonSchema(): JsonSchema {
  return {
    type: 'string',
    description:
      'Exact outfits[].id for this character in this shot. Detailed outfit rows are used only for child/person/human characters; non-human characters use a natural-appearance binding.',
  };
}

export function formatStructuredSpeakerNameRules(
  options: { includeAudioContext?: boolean; helperKind?: 'helper' | 'creature_or_helper' } = {}
): string {
  const helperLabel = options.helperKind === 'creature_or_helper' ? 'creature or helper' : 'helper';
  const rules = [
    'SPEAKER NAME RULES:',
    '- dialogue[].speaker and thoughts[].speaker must use exact character names from CHARACTERS when that character speaks.',
    `- If the story introduces a new ${helperLabel}, choose one name once and reuse the exact same spelling in every speaker field.`,
    '- Do not mix alphabets inside a speaker name. For Ukrainian/Russian names, keep all letters Cyrillic; never write Latin lookalikes inside a Cyrillic name.',
  ];

  if (options.includeAudioContext) {
    rules.push(
      '- Speaker names are used for audio, quiz, indexing, and bubble tails, so a one-letter spelling drift is a data bug.'
    );
  }

  return rules.join('\n');
}

export function formatReferenceGroundedCharacterRules(
  options: { includeGraphicDetails?: boolean } = {}
): string {
  const rules = [
    'REFERENCE-GROUNDED CHARACTER RULES:',
    '- Characters marked "visual reference: yes" have image references downstream. Their visual identity comes from the reference image, not from this JSON.',
    '- For reference-grounded characters, visual.sceneVisual.cameraComposition.characters[].description must be reference-safe: placement, pose, action, emotion, gaze direction, gesture, and interaction only.',
    '- Do NOT describe stable identity details for reference-grounded characters: appearance, outfit, permanent markings, species design, default clothes, or exact colors.',
  ];

  if (options.includeGraphicDetails) {
    rules.splice(
      2,
      0,
      '- position is semantic staging only; it must never describe or replace character identity.'
    );
    rules.push(
      '- If a reference-grounded character\'s normal look/clothes are needed, write "default reference appearance" or "natural appearance" instead of inventing details.',
      '- Scene-authorized temporary states are allowed when visual and important: wet, glowing, transparent, dusty, worried expression, raised hand, pointing finger, looking left/right.',
      '- Good reference-safe staging: "walking slowly, looking toward the helper, one hand lifted in warning".',
      '- Good reference-safe staging: "hovering beside Emilia, tilted with a curious expression".'
    );
  }

  return rules.join('\n');
}

export function formatStructuredEnvironmentRules(
  options: { target: 'pages' | 'readingBlocks'; includePanelDeltaRule?: boolean } = {
    target: 'pages',
  }
): string {
  const rules = [
    'ENVIRONMENTS:',
    `- Return 1-3 environments in environments[] before ${options.target}.`,
    '- Each environment description must be in English and describe reusable static layout.',
    options.target === 'pages'
      ? '- Panels reference environmentId. Do not repeat the whole environment in panel visual.sceneVisual.setting.'
      : '- Comic panels reference environmentId. Prose blocks do not need visual fields.',
  ];

  if (options.includePanelDeltaRule) {
    rules.push('- visual.sceneVisual.setting describes only what is new or changed in that panel.');
  }

  return rules.join('\n');
}

/**
 * Format child profile section for prompts
 * @param spec - Story specification
 * @returns Formatted child profile text
 */
export function formatChildProfile(spec: StorySpec): string {
  // Check if child is selected as a character (in spec.characters array)
  const childIsCharacter = spec.characters?.some(
    (c) => c.type === 'child' && c.name === spec.childName
  );

  // If no child profile, return empty
  if (!spec.childProfile) {
    return '';
  }

  // If child is NOT selected as character, show only preferences/context
  if (!childIsCharacter && spec.childName !== spec.childProfile.name) {
    const parts = ['TARGET AUDIENCE PROFILE:', `Age group: ${spec.ageGroup}`];

    // Add interests if available
    if (spec.childProfile?.interests && spec.childProfile.interests.length > 0) {
      parts.push(
        `Child's interests (use for inspiration): ${spec.childProfile.interests.join(', ')}`
      );
    }

    // Add fears/sensitivities if available
    if (spec.childProfile?.fears && spec.childProfile.fears.length > 0) {
      parts.push(`Avoid these topics (child's fears): ${spec.childProfile.fears.join(', ')}`);
    }

    // Add user notes if available
    if (spec.userNotes) {
      parts.push(`Parent notes: ${spec.userNotes}`);
    }

    parts.push('');
    parts.push(
      'Note: Create appropriate protagonist(s) for the story. The child profile above is for context only.'
    );

    return parts.join('\n');
  }

  // If child IS selected as character, show profile focusing on personality, interests, fears
  const parts = [`Main Character: ${spec.childName}`, `Age group: ${spec.ageGroup}`];

  // Add interests if available
  if (spec.childProfile?.interests && spec.childProfile.interests.length > 0) {
    parts.push(`Interests: ${spec.childProfile.interests.join(', ')}`);
  }

  // Add fears/sensitivities if available
  if (spec.childProfile?.fears && spec.childProfile.fears.length > 0) {
    parts.push(`Fears: ${spec.childProfile.fears.join(', ')}`);
  }

  // Add personality if available
  if (spec.childProfile?.personality) {
    parts.push(`Personality: ${spec.childProfile.personality}`);
  }

  // Add user notes if available
  if (spec.userNotes) {
    parts.push(`Parent notes: ${spec.userNotes}`);
  }

  return parts.join('\n');
}

/**
 * Format supporting characters section for prompts
 * @param spec - Story specification
 * @returns Formatted characters list with instruction to include them, or guidance for free choice
 */
export function formatSupportingCharacters(spec: StorySpec): string {
  if (!spec.characters || spec.characters.length === 0) {
    return `CHARACTERS:
You have creative freedom to invent supporting characters that fit the story's theme and plot.
Create diverse, interesting characters appropriate for the age group and scenario.
Characters should enhance the story and support the narrative goals.`;
  }

  const parts = [
    'SUPPORTING CHARACTERS:',
    'IMPORTANT: Include ALL these characters in the story. They should participate in scenes, interact with the main character, and be part of the plot.',
    'Use the exact story names listed here. Do not translate, rename, or append bracket metadata to character names.',
    '',
  ];

  spec.characters.forEach((char, index) => {
    const charParts = [`${index + 1}. ${formatWriterCharacterName(char.name)}`];

    // Add type
    if (char.type) {
      charParts.push(`(${char.type})`);
    }

    // Add character description — prefer English translation for better LLM visual output
    if ((char as any).descriptionEn) {
      charParts.push(`- Description: ${(char as any).descriptionEn}`);
    } else if ((char as any).aiGeneratedDescription) {
      charParts.push(`- Description: ${(char as any).aiGeneratedDescription}`);
    } else if (char.description) {
      charParts.push(`- Description: ${char.description}`);
    }

    // Add appearance traits if available
    if (char.appearanceTraits) {
      const traits = char.appearanceTraits;
      const traitsParts: string[] = [];

      if (traits.hairColor) traitsParts.push(`hair: ${traits.hairColor}`);
      if (traits.hairStyle) traitsParts.push(`style: ${traits.hairStyle}`);
      if (traits.eyeColor) traitsParts.push(`eyes: ${traits.eyeColor}`);
      if (traits.skinTone) traitsParts.push(`skin: ${traits.skinTone}`);

      if (traitsParts.length > 0) {
        charParts.push(`- Appearance: ${traitsParts.join(', ')}`);
      }
    }

    // Add role if specified
    if (char.role) {
      charParts.push(`- Role: ${char.role}`);
    }

    parts.push(charParts.join(' '));
  });

  parts.push('');
  parts.push('Make sure each character has meaningful interactions and contributes to the story.');
  parts.push(
    'You may add additional characters if needed for the plot, but these MUST be included.'
  );

  return parts.join('\n');
}

/**
 * Format characters for continuation prompt (required + optional split)
 * When optionalCharacters is empty, all characters are treated as required
 */
export function formatSupportingCharactersContinuation(
  requiredCharacters: ContinuationCharacter[],
  optionalCharacters?: ContinuationCharacter[]
): string {
  const validRequired = requiredCharacters.filter(
    (c) => c.description && c.description !== 'undefined' && c.description.trim().length > 0
  );
  const validOptional = (optionalCharacters || []).filter(
    (c) => c.description && c.description !== 'undefined' && c.description.trim().length > 0
  );

  if (validRequired.length === 0 && validOptional.length === 0) {
    return `CHARACTERS:
You have creative freedom to invent supporting characters that fit the story's theme and plot.
Create diverse, interesting characters appropriate for the age group and scenario.`;
  }

  const parts: string[] = [];

  if (validRequired.length > 0) {
    parts.push(
      'REQUIRED CHARACTERS (MUST USE):',
      'These characters MUST appear in the story:',
      ...validRequired.map(
        (c) =>
          `- ${formatWriterCharacterName(c.name)} (${c.type}): ${c.description}\n  Role: ${c.role || 'character'}`
      ),
      ''
    );
  }

  if (validOptional.length > 0) {
    parts.push(
      'OPTIONAL CHARACTERS (MAY USE):',
      'You MAY feature these if relevant to the plot, but it is NOT required:',
      ...validOptional.map(
        (c) =>
          `- ${formatWriterCharacterName(c.name)} (${c.type}): ${c.description}\n  Role: ${c.role || 'character'}`
      ),
      ''
    );
  }

  parts.push(
    'Make sure required characters have meaningful interactions. You may add additional characters if needed.'
  );

  return parts.join('\n');
}

/**
 * Format user characters with IDs for Director prompt (same format as main flow)
 * Used so Director can output "Name [ID: uuid]" for reliable matching.
 */
export function formatUserCharactersWithIds(
  characters: Array<{ id?: string; name: string }>
): string {
  if (!characters?.length) return '';
  return characters.map((c) => (c.id ? `${c.name} [ID: ${c.id}]` : c.name)).join(', ');
}

/**
 * Format story requirements section for prompts
 * @param params - Story parameters
 * @returns Formatted requirements text
 */
export function formatStoryRequirements(params: {
  spec: StorySpec;
  sceneCount?: number;
  targetWordCount?: [number, number];
  /**
   * When `prose_only`, word-count line omits square-bracket audio-tag examples (defer-TTS writer flow).
   * @default 'audio_tags_in_manuscript'
   */
  targetWordCountScope?: 'audio_tags_in_manuscript' | 'prose_only';
}): string {
  const parts = [];

  // Add scenario/theme with detailed guidance
  if (params.spec.scenarioCard) {
    const themeGuidance = params.spec.scenarioCard.promptGuidance?.trim();
    const creativeSeed = params.spec.scenarioGuidance?.trim();
    const hasDistinctThemeGuidance =
      !!themeGuidance && (!creativeSeed || themeGuidance !== creativeSeed);

    parts.push(
      `- Theme/Scenario: ${params.spec.scenarioCard.name} - ${params.spec.scenarioCard.description}`
    );
    if (hasDistinctThemeGuidance) {
      parts.push(`  Theme guidance (binding): ${themeGuidance}`);
    }
    if (creativeSeed) {
      parts.push(`  Creative seed (loose direction, not an outline): ${creativeSeed}`);
      parts.push(
        "  Creative latitude: keep the seed's core thematic direction, but freely invent the conflict, story events, supporting cast, surprises, and resolution. Do not treat the seed as a required scene sequence."
      );
    }
  }

  // Add goal/moral with detailed guidance (omit entirely when no goal — avoids empty filler)
  if (params.spec.goal) {
    const goalDisplay = params.spec.goalName || params.spec.goal; // Use translated name or fallback to slug
    parts.push(`- Goal/Moral: ${goalDisplay}`);
    if (params.spec.goalGuidance) {
      parts.push(`  Guidance: ${params.spec.goalGuidance}`);
    }
    const goalSafetyText = [params.spec.goal, params.spec.goalName, params.spec.goalGuidance]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (
      /(stranger|незнайом|незнаком|чуж|desconoc|extrañ|fremd|inconnu|nieznaj)/i.test(goalSafetyText)
    ) {
      parts.push(
        '  Stranger-safety handling: show the child making a safe choice: short refusal, create distance, move toward a trusted adult or safe group, and tell the adult clearly. Do not have the child chase, trap, restrain, fight, punish, or negotiate with the stranger; adults handle the situation after the child alerts them. For ages under 6, keep the stranger at a distance or mostly offscreen, with no grabbing, pursuit, threats, candy/gift/treasure bribes, or detailed luring.'
      );
      parts.push(
        '  Forbidden stranger-safety wording/moves: do not write "remembered the safety rule", "the main rule", "safety rules", "learned the lesson", "did the right thing", "good/correct behavior", or equivalents in the story language. Avoid Ukrainian/Russian-style phrases such as "добре вчинила", "правильно зробила", "вчинила правильно", "згадала правило". Do not give the stranger a tempting box, candy, treasure, toy, prize, or secret reward. If the stranger speaks, keep it brief and neutral, then shift focus to the child moving away and telling a trusted adult.'
      );
    }
  }

  if (params.sceneCount) {
    parts.push(`- Number of scenes: ${params.sceneCount}`);
  }

  const wordCountScope =
    params.targetWordCountScope === 'prose_only'
      ? ' (spoken story prose only)'
      : ' (spoken story prose only; do not count words that appear only inside square-bracket audio tags like [happy] or [whisper])';

  if (params.targetWordCount) {
    parts.push(
      `- Target word count: ${params.targetWordCount[0]}-${params.targetWordCount[1]} words${wordCountScope}`
    );
  } else if (params.spec.policyProfile?.readability?.targetWordsRange) {
    const range = params.spec.policyProfile.readability.targetWordsRange;
    parts.push(`- Target word count: ${range[0]}-${range[1]} words${wordCountScope}`);
  }

  return parts.join('\n');
}

/** Infants through toddlers (~under 3 in product buckets): plot formulas and rhythm/repetition rules use this set. */
const YOUNG_AGE_GROUPS = ['0-1', '1y', '2-3'];

/**
 * Format age-appropriate requirements for prompts
 * @param ageGroup - Age group (0-1, 1y, 2-3, 4-5, 6-8, 9-12)
 * @returns Formatted age requirements text with research-based complexity standards
 */
export function formatAgeRequirements(ageGroup: string): string {
  const requirements: Record<string, string[]> = {
    '0-1': [
      'TEXT COMPLEXITY (Lexile: Below 0L):',
      '- Sentence length: 2-5 words maximum per sentence',
      '- Vocabulary: 100-300 unique words, use same words 5-10 times for repetition',
      '- Word complexity: 1-2 syllable words only (mama, baby, dog, ball)',
      '- Structure: Simple subject-verb patterns, present tense only',
      '- Use rhyme, rhythm, and sound words (woof-woof, meow, splash)',
      '- No conflicts or problems - only joyful exploration',
      '- Focus on basic emotions: happy, excited, surprised',
    ],
    '1y': [
      'TEXT COMPLEXITY (Lexile: 0L-100L):',
      '- Sentence length: 3-6 words maximum per sentence',
      '- Vocabulary: 200-400 unique words, high repetition of key words',
      '- Word complexity: 1-2 syllable words (truck, kitty, apple, water)',
      '- Structure: Simple subject-verb-object, present and simple past tense',
      '- Use predictable patterns and repeated phrases',
      '- Onomatopoeia and sound effects for engagement',
      '- Very simple cause-effect (push button, toy beeps)',
      '- Bright, cheerful atmosphere throughout',
    ],
    '2-3': [
      'TEXT COMPLEXITY (Lexile: 100L-200L):',
      '- Sentence length: 4-8 words per sentence average',
      '- Vocabulary: 400-600 unique words, moderate repetition',
      '- Word complexity: 1-3 syllable words, familiar everyday concepts',
      '- Structure: Simple sentences with "and" connections, past/present/future tense',
      '- Dialogue: 30% of text should be character speech',
      '- Use predictable story patterns (problem -> simple solution)',
      '- Small challenges that resolve within same scene',
      '- Focus on family, friendship, daily routines',
    ],
    '4-5': [
      'TEXT COMPLEXITY (Lexile: 200L-500L):',
      '- Sentence length: 6-12 words per sentence average',
      '- Vocabulary: 600-1,200 unique words, introduce new words with context',
      '- Word complexity: 1-3 syllable words, some descriptive adjectives',
      '- Structure: Mix simple and compound sentences (and, but, so)',
      '- Dialogue: 35-40% dialogue for character development',
      '- Vary sentence beginnings (Once, Then, Suddenly, After)',
      '- Mild suspense that resolves in same or next scene',
      '- Use basic comparisons (as big as, like a)',
      '- Themes: helping others, being brave, solving problems together',
    ],
    '6-8': [
      'TEXT COMPLEXITY (Lexile: 500L-700L):',
      '- Sentence length: 10-16 words per sentence average, vary between 5-20 words',
      '- Vocabulary: 2,000-3,500 unique words, introduce 5-8 challenging words per story',
      '- Word complexity: 1-4 syllable words, some domain-specific vocabulary with context clues',
      '- Structure: Mix of simple, compound, and complex sentences with dependent clauses',
      '- Dialogue: 40-50% dialogue with character-specific speech patterns',
      '- Use varied sentence structures: questions, exclamations, short impactful sentences',
      '- Literary devices: Similes, basic metaphors, sensory details, foreshadowing',
      '- Expected reading speed: 90-115 words per minute',
      '- Themes: Courage, responsibility, empathy, facing fears, problem-solving',
    ],
    '9-12': [
      'TEXT COMPLEXITY (Lexile: 700L-1000L):',
      '- Sentence length: 15-22 words per sentence average, range 8-30 words',
      '- Vocabulary: 4,000-6,500 unique words, introduce abstract concepts and specialized terms',
      '- Word complexity: Multi-syllable words (3-5 syllables), nuanced vocabulary, figurative language',
      '- Structure: Complex sentences with multiple clauses, varied syntax, sentence fragments for effect',
      '- Dialogue: 30-40% dialogue (more narrative depth and description)',
      '- Use sophisticated transitions, varied paragraph lengths, intentional pacing',
      '- Literary devices: Metaphors, symbolism, irony, multiple perspectives, flashbacks',
      '- Expected reading speed: 115-140 words per minute',
      '- Themes: Identity, moral complexity, justice, personal growth, relationships, consequences',
    ],
  };

  // Map age groups to requirements
  const ageReqs = requirements[ageGroup] || requirements['6-8']; // default to 6-8

  return ageReqs.join('\n');
}

/**
 * Language-proficiency overrides affect vocabulary and syntax, not content maturity.
 * Keep only reading/writing mechanics from the age requirements when the adjusted
 * level differs from the child's chronological age group.
 */
export function formatTextComplexityRequirements(ageGroup: string): string {
  const textRulePrefixes = [
    'TEXT COMPLEXITY',
    '- Sentence length:',
    '- Vocabulary:',
    '- Word complexity:',
    '- Structure:',
    '- Dialogue:',
    '- Use rhyme,',
    '- Use predictable',
    '- Onomatopoeia',
    '- Very simple cause-effect',
    '- Vary sentence beginnings',
    '- Use basic comparisons',
    '- Literary devices:',
    '- Expected reading speed:',
    '- Use sophisticated transitions',
  ];

  return formatAgeRequirements(ageGroup)
    .split('\n')
    .filter((line) => textRulePrefixes.some((prefix) => line.startsWith(prefix)))
    .join('\n');
}

/**
 * Format writing style guidelines for text generation
 * @param spec - Story specification (gates rhythm/repetition for youngest buckets only)
 * @param _vocabLevel - Vocabulary level from domain (lexical detail lives in formatAgeRequirements TEXT COMPLEXITY)
 * @returns Formatted writing style text
 */
export function formatWritingStyle(spec: StorySpec, _vocabLevel: string): string {
  const sections: string[] = ['WRITING STYLE:'];
  const complexityAgeGroup = spec.storyComplexityAgeGroup ?? spec.ageGroup;

  if (YOUNG_AGE_GROUPS.includes(complexityAgeGroup)) {
    sections.push(
      '- MUST use rhythm and repetition: repeat phrases, gentle refrains, and predictable patterns so very young listeners can anticipate and join in.'
    );
  }

  sections.push(
    '- Include sensory details (sounds, colors, feelings)',
    "- Show don't tell emotions",
    '- Include dialog for character connection',
    '- Build to satisfying, safe conclusion'
  );

  return sections.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Story Rules — PLOT structure, PACING, HOOKS, VOCAB.
// Used by DirectTextPrompt. Scene-level only for RegenerationPrompt.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format core story rules (PLOT, PACING, HOOKS, VOCAB) for full story generation.
 * Formulas: MissionScene = min(2, ceil(N*0.25)), RulePressureScene = ceil(N*0.45),
 * ClimaxScene = ceil(N*0.85), ResolutionScene = N.
 */
export function formatCoreStoryRules(params: {
  sceneCount: number;
  ageGroup: string;
  hasWorldRule?: boolean;
  worldRuleText?: string;
  closingArtifact?: StorySpec['closingArtifact'];
}): string {
  const { sceneCount, ageGroup, hasWorldRule = false, worldRuleText, closingArtifact } = params;
  const isYoung = YOUNG_AGE_GROUPS.includes(ageGroup);
  const sections: string[] = [];

  // PLOT structure (formulas) — skip for young ages
  if (!isYoung && sceneCount > 0) {
    const N = sceneCount;
    const missionScene = Math.min(2, Math.ceil(N * 0.25));
    const rulePressureScene = Math.ceil(N * 0.45);
    const climaxScene = Math.ceil(N * 0.85);
    const resolutionScene = N;

    const keepsakeRule = closingArtifact
      ? `- Required keepsake marker (Scene ${resolutionScene}, exactly once in the whole story): the small tangible token MUST be this catalog artifact: "${closingArtifact.title}". Artifact identity: ${closingArtifact.description}
- Introduce "${closingArtifact.title}" naturally as a found, earned, gifted, or kept object that fits the plot. Do not replace it with a different token.
- Treat the artifact identity as canonical: do not add material, color, shape, size, symbol, or function details that conflict with it. You may add only compatible sensory details.
- When the hero receives or keeps it, put one natural story-language phrase for this artifact inside one pair of curly braces exactly once. The phrase may inflect or translate the artifact title to fit the sentence grammar, and may include 1-2 compatible qualities from the artifact identity (for example: {small glowing feather clasp}). Do NOT force nominative case or the exact catalog title if it sounds unnatural. Keep surrounding spaces and punctuation correct so the text does not concatenate words around the marker. No nested braces, and do not use curly braces anywhere else.`
      : `- Keepsake marker (Scene ${resolutionScene}, exactly once in the whole story): when the hero receives or keeps that small tangible token, put its natural story-language name inside a single pair of curly braces in the scene prose — e.g. ...treasured {small silver pebble} from... Use 2–8 words that fit the sentence grammar, with correct spaces around the marker and no nested braces. Exactly one {...} in the entire manuscript for this keepsake only; do not use curly braces for anything else.`;

    const plotText = `PLOT STRUCTURE:
- By end of Scene ${missionScene}: state 1-sentence mission.
- Scenes ${missionScene + 1}-${climaxScene - 1}: 2-3 escalating obstacles.
- Scene ${climaxScene}: decisive brave action solves main problem.
- Scene ${resolutionScene}: happy return + small tangible token + warm sequel hint. Unless the scenario is explicitly a scary story, the final hint must invite curiosity about a NEW safe adventure (a plan, place, invitation, funny discovery, or cheerful question), not imply that the solved danger has returned.
${keepsakeRule}`;

    sections.push(plotText);

    if (hasWorldRule && worldRuleText) {
      sections.push(`WORLD RULE DRAMATURGY (author-only constraint):
- Hidden law to obey: ${worldRuleText}
- Treat this as the world's cause-and-effect, not as a lesson or exposition paragraph.
- Do NOT name it as a "rule", "world rule", "main rule", "the rule says", "the hero knew", "the hero remembered", or equivalent phrasing in the story language.
- Do NOT shortcut the hidden law with narrator phrases like "the hero understood/realized/remembered/knew" or "use the power wisely/save energy." Show it through body sensations, changed results, hesitation, visible traces, and choices.
- Do NOT let any character explain, diagnose, or summarize the hidden law ("your power is running out", "the magic is used up", "it needs rest"). A character may notice only one concrete sensory fact, like a dim glow or tingling fingers.
- Forbidden world-rule wording: do not write "she understood/realized/remembered", "her power was exhausted", "the magic stopped working", "only one use remained", "save your energy", or equivalents in the story language. Also avoid Ukrainian/Russian-style phrases such as "вона зрозуміла", "згадала правило", "сила вичерпалася", "магія не спрацювала", "руки стали звичайними", "не витрачати сили", "берегти сили".
- Do not make the rule instantly solve the problem. Around Scene ${rulePressureScene}, let the law first create friction, a failed attempt, a surprising consequence, or a clue the child can infer.
- Let characters discover the pattern through action, sensory changes, and natural dialogue. A character may react to what happened, but should not explain the full rule to the reader.
- Pay it off in Scene ${climaxScene}: the hero's brave choice works because they have learned how the world behaves.
- If deleting a sentence that explains the rule would make the scene more magical and still understandable, delete that sentence.`);
    }

    sections.push(`STORY ARCHITECTURE:
- The selected plot example is a seed, not a checklist. Change surface details when needed so the story feels fresh.
- Each important new helper, object, clue, path, or location must either cause a later choice, complicate the mission, or pay off before the ending.
- If the opening establishes a child-scale project, game, performance, build, race, recipe, map, collection, or shared plan, return to it after the main problem is resolved. Show one concrete completed or happily adapted result in the final scene so the starting goal feels honored, not abandoned.
- The protagonist must make at least one meaningful choice before the climax; do not let adults, helpers, or magic solve everything for them.
- Show the moral through the protagonist's choice and consequences. Avoid a final adult lecture, a sentence that directly names the lesson, or dialogue praising the child for "knowing the rules."
- The title and SEO description should sell the adventure, not announce the moral lesson.`);
  }

  // PACING — simplified for young ages
  if (isYoung) {
    sections.push(`PACING:
- Keep paragraphs short (2-3 sentences).
- Include dialogue for character connection.`);
  } else {
    sections.push(`PACING:
- Max 2 consecutive description sentences.
- Every scene must include: 1 action beat, >=2 dialogue lines, 1 short punchy sentence (3–7 words).
- Keep paragraphs 2–4 sentences.`);
  }

  // HOOKS — simplified for young ages
  if (isYoung) {
    sections.push(`HOOKS:
- End scenes with a small surprise or question when possible.`);
  } else {
    sections.push(`HOOKS:
- End every scene before the resolution with a micro-hook (question / new clue / small twist). No scene ends flat.
- The final scene may end with a sequel hint, but it must preserve comfort and closure. For non-scary scenarios, do not end on a rustle, shadow, strange noise, unknown watcher, reopened danger, or anything that suggests the child is still unsafe.`);
  }

  // VOCAB — for 4-5 and above
  if (!isYoung) {
    sections.push(`VOCAB:
- Richer vocabulary: make harder words clear through what happens in the scene and how characters react and speak—meaning should land without stopping the story. Do NOT define words in parentheses, appositives like "word (meaning)", "which means…", or other mid-line glosses.
- Prefer plain strong wording when a rare or archaic term does not earn its place; if you use one, the surrounding prose alone must make the sense obvious—no narrator aside to explain it.`);
  }

  return 'CORE STORY RULES:\n' + sections.join('\n\n');
}

/**
 * Narrative continuity for full-story generation (plain text and JSON paths).
 * Genre-agnostic: objects, clues, carried items, scene boundaries.
 */
export function formatNarrativeContinuityRules(): string {
  return [
    'NARRATIVE CONTINUITY:',
    '- Significant objects before use: If a character uses, opens, reads, holds, shows, or gives an object that matters to the plot, establish first how they have it (found, received, brought from home, packed, given by someone, etc.) in the same scene or an earlier scene. Do not start a scene with the character already interacting with an object that has never appeared in the story.',
    '- Framed clues and hints: If the narration calls something a clue, hint, trail, sign, or "another hint," either show within the next one or two scenes why it mattered to the story, or resolve it (returned, stored, explained to a friend), or avoid clue/hint wording so readers are not promised a payoff that never comes.',
    '- Persistent possessions: When the plot implies that a character keeps carrying the same items across multiple scenes or locations, treat those items consistently: establish them when they first matter, and if something new appears on the character late, give a clear in-story reason (gift, found, packed before leaving). Applies to any setting (bag, toolkit, toy, instrument, uniform piece — not only travel).',
    '- Literal spatial logic: Before inventing a claim about where something is, check whether the object/location can physically or magically contain it in the established scene. Do not put treasures, rooms, doors, creatures, or secrets "inside" a bridge, wall, beam, path, cloud, signal, shadow, or other non-container unless the story has first established a hollow space, opening, portal, or compartment. Prefer "near", "under", "behind", "on", or "beside" when that is the literal relationship.',
    '- Cause-and-effect sanity: If a new invented detail would change the problem, create a new location, or imply a hidden object, it must either be established before use or be immediately visible and plausible from the current scene. Avoid poetic but illogical shortcuts that sound pretty while contradicting the scene.',
    '- Scene boundaries: If moving to a new scene could hide an important change (new key object, new companion, major prop), either show that change in the text or add a brief explicit bridge so nothing important appears without introduction.',
  ].join('\n');
}

/**
 * Director-only: costume continuity and turnaround vs story outfit.
 */
export function formatDirectorCostumeContinuityRules(): string {
  return [
    'COSTUME AND APPEARANCE CONTINUITY:',
    "- Use the full story text up to and including the anchor scene moment (all prior blocks + context scenes in the current block) to determine each character's current wardrobe, hair, face visibility, and any disguise.",
    '- First decide whether the character\'s default/reference clothes already fit this scene. If yes, reuse that look and set outfits[].description to exactly "natural appearance". Only define a new explicit wardrobe description when the scene truly needs different clothes (weather, uniform, sleepwear, costume, disguise, celebration wear, protective gear, etc.).',
    '- If the text explicitly describes a change (change of clothes, new day and dressing, return to a previous outfit, removing a disguise), add or reuse an entry in the "outfits" array (wardrobe-only descriptions) and set each illustration\'s sceneVisual.cameraComposition.characters[].outfitId to the correct outfits[].id per character; align character lines (pose, hair, face).',
    '- outfits[].description: WARDROBE ONLY — garments, footwear, and worn accessories (hats, scarves, belts, bags carried/worn, helmets, glasses as worn items). Do NOT put face, eyes, skin, age, body shape, hair, hairstyle, beard, makeup, or expression in outfit descriptions.',
    '- In sceneVisual.cameraComposition.characters[].description, describe pose, facial expression, gaze direction, head turn, and temporary visibility/occlusion only. For reference-grounded characters, do NOT restate stable identity traits there: no hairstyle, hair color, eye color, freckles, face shape, skin tone, or other enduring appearance details unless the story explicitly changes or hides them in this exact moment.',
    '- Wardrobe must match stated weather, season, and indoor/outdoor context of the anchor scene and its environment (rain, snow, heat, cold — appropriate layers, footwear, outerwear).',
    'TURNAROUND / USER-SELECTED REFERENCE CHARACTERS:',
    '- The reference image establishes identity, not a permanent costume. Preserve recognizability: face, age, body proportions, silhouette, skin tone, distinctive marks (freckles, glasses if the story keeps them), and hairstyle unless the story explicitly changes hair.',
    "- Clothing and accessories must follow the story for that scene. If the text describes a new outfit, disguise, uniform, or sleepwear, define it in outfits[] and set each character row's outfitId in cameraComposition.characters; describe pose, gaze, expression, and temporary visibility in that row's description. Do not restate stable identity traits from the reference sheet there. Do not keep the reference sheet's default clothes when the story has moved on. The illustration must read as the same person, different clothes.",
  ].join('\n');
}

/**
 * Director-only: physical state, visual priority, and readability before sceneVisual JSON.
 * Placed after story blocks so the model resolves anchor moments before per-block instructions.
 */
export function formatDirectorPhysicalReadabilityRules(): string {
  return [
    'CRITICAL - PHYSICAL READABILITY, SCENE LOGIC, AND VISUAL PRIORITY:',
    'Before generating sceneVisual for an illustration, first resolve the anchor scene into one clear physical state. Interpret the depicted moment in the most literal, physically readable, and narratively accurate way.',
    '',
    'Possible physical states include indoor, outdoor, shoreline, shallow water, surface water, full underwater, cave entrance, cave interior, rain exposure, snow exposure, wind-heavy conditions, vehicle interior, flight, falling, and fantasy non-realistic conditions only when clearly supported by the text.',
    '',
    'VISUAL DECISION PRIORITY:',
    'When cues conflict, always follow this order:',
    '1) the exact action and meaning of the anchor scene',
    '2) physical plausibility of the depicted moment',
    '3) environment structure and scene-specific state',
    '4) character identity consistency',
    '5) wardrobe continuity',
    '6) cinematic mood, atmosphere, or visual drama',
    '',
    'Do not let mood cues, genre cues, or dramatic composition change the actual event being depicted.',
    '',
    'DO NOT ESCALATE THE SCENE:',
    'Do not visually transform a mild, tentative, near-edge, or early-stage moment into a more extreme version of itself. The illustration must preserve the actual intensity, location, and progression of the anchor scene.',
    '',
    'WARDROBE COMPATIBILITY RULE:',
    'Wardrobe continuity applies only when it remains physically plausible for the anchor scene.',
    'If a previously established outfit, accessory, or carried item conflicts with the current environment, weather, activity, safety logic, or body movement, adapt it to the closest plausible equivalent for that exact moment while preserving character identity and story continuity.',
    'Do not preserve scene-inappropriate clothing just for continuity.',
    '',
    'REFERENCE AND TURNAROUND RULE:',
    'Reference sheets establish character identity, not a permanent costume for all scenes.',
    'Preserve recognizability through face, proportions, silhouette, stable hairstyle, skin tone, species traits, and distinctive features.',
    'Do not automatically carry over scene-specific clothing, gear, outerwear, disguise pieces, or accessories from previous scenes or reference images when they do not fit the current anchor scene.',
    '',
    'PROP AND GEAR FUNCTIONALITY RULE:',
    'Props, tools, worn accessories, and special gear must appear only in a physically usable, visually readable, and context-appropriate way for the depicted moment.',
    'Do not force items into the illustration when they become misleading, unusable, or contradictory in the current scene state or framing.',
    '',
    'COMPOSITION READABILITY RULE:',
    'Choose framing, camera angle, crop, and character placement so the anchor scene reads correctly at first glance.',
    'Do not use dramatic, atmospheric, or cinematic composition if it makes the illustration look like a different event than the one described in the text.',
    '',
    'CONTACT GEOMETRY RULE:',
    formatContactGeometryWriterRule(),
    'Prefer concrete staging phrases such as "standing directly in front of the door, hand on the handle" or "leaning beside the porthole, face close to the glass".',
    '',
    'BODY AND MATERIAL BEHAVIOR RULE:',
    'Character posture, fabric behavior, hair behavior, held objects, and environmental interaction must match the physical state of the scene.',
    'Body language and materials should react believably to movement, weather, water, gravity, terrain, and spatial context unless the text explicitly establishes a stylized exception.',
    '',
    'ANCHOR SCENE FIDELITY:',
    'The illustration must depict the exact moment of the anchor scene, not a later, earlier, intensified, or more visually dramatic adjacent moment.',
    'Do not import later details, costume features, props, or emotional escalation unless they are clearly already true in the anchor scene itself.',
    '',
    'FINAL SELF-CHECK:',
    'Before outputting each illustration, verify:',
    '- the image depicts the exact anchor-scene moment',
    '- the physical state is singular and clear',
    '- clothing, props, and posture are plausible for that state',
    '- composition preserves the intended narrative meaning',
    '- continuity supports the scene without overriding it',
    '- the scene is immediately understandable without contradictory visual cues',
  ].join('\n');
}

export function formatContactGeometryWriterRule(): string {
  return [
    'Object-contact actions require explicit physical staging in sceneVisual.cameraComposition.characters[].description: body position beside or in front of the fixed object, exact hand/arm/shoulder/face/body contact point, and the named handle, surface, window, door, panel, control, or affected object.',
    'Character body placement stays close enough for natural contact, with the contact point visibly connected to the intended fixed object.',
  ].join('\n');
}

/**
 * Director-only: pointing, gaze, and deictic actions must read clearly in illustrations.
 */
export function formatDirectorDeicticActionsRules(): string {
  return [
    'CRITICAL - POINTING, GAZE, AND TARGET READABILITY:',
    'When the anchor scene includes pointing, showing, indicating, reaching toward, or visually drawing attention to something, the illustration must make the target unmistakably readable at first glance.',
    '',
    'If a character points at, looks at, presents, notices, or calls attention to an object, creature, place, direction, or detail:',
    '- the target must be visible in the frame unless the text clearly requires it to remain off-screen',
    '- the pointing gesture, gaze direction, and target placement must align clearly',
    '- the composition must preserve an obvious visual relationship between the character and the target',
    '- avoid ambiguous staging where the gesture could appear to indicate a general area instead of the specific intended target',
    '- if necessary, adjust character angle, arm direction, head turn, eye line, or target placement so the intended reference reads immediately',
    '',
    'For sceneVisual.cameraComposition.characters[].description:',
    '- explicitly describe where the character is pointing or looking',
    '- describe head direction and gaze direction when they matter for story clarity',
    '',
    'For composition:',
    '- prefer framing that keeps both the indicating character and the indicated target readable in the same shot when possible',
    '- do not place the target in a position that breaks the visual line of pointing or gaze',
    '- do not let atmosphere, background beauty, or loose composition weaken the clarity of the indicated target',
    '',
    'FINAL CHECK FOR DEICTIC ACTIONS:',
    'If someone is pointing, looking toward, or calling attention to something, a viewer should immediately understand exactly what the target is.',
  ].join('\n');
}

/**
 * Director-only: when characters use instruments or devices, sceneVisual must encode functional geometry, not mood alone.
 */
export function formatDirectorFunctionalDeviceCompositionRules(): string {
  return [
    'CRITICAL - FUNCTIONAL DEVICE COMPOSITION:',
    'When a character is actively using an instrument or device, sceneVisual must describe the functional geometry of the interaction, not only the general action.',
    '',
    'Specify all of the following when relevant:',
    '- which end or side of the object the character is using',
    "- where the character's eye, hands, or body are placed relative to the object",
    '- what direction the object is aimed toward',
    '- what fixed environmental element the object is aligned with, if any',
    '',
    'For optical instruments, the viewing end and viewing direction must both be readable in the composition.',
    'If the instrument is used to observe the sky, distance, or exterior space from indoors, the instrument must be clearly oriented toward a window, opening, or visible line of sight.',
    'Avoid close framing that hides the operational logic of the object.',
    '',
    'When describing instrument use, do not describe only the emotion or intention; describe the exact usage posture and directional alignment.',
    '',
    'Template for sceneVisual.cameraComposition.characters[].description when applicable:',
    '[character position], standing at the [operational side] of the [instrument], [eye/hand/body contact point], [realistic usage posture], using it toward [target direction / fixed environmental target].',
  ].join('\n');
}

/**
 * Director-only: keep scene descriptions image-friendly and consistent with a
 * simple "character DNA + frozen moment" prompt structure.
 */
export function formatDirectorImagePromptRules(): string {
  return [
    'CRITICAL - IMAGE-PROMPT WRITING RULES:',
    'Write for an image generation system, not for a chat conversation. Be concise, visual, concrete, and structured.',
    '',
    'CHARACTER DNA:',
    "- In characters[].description, establish each character's stable visual identity first: who they are, 2-3 memorable visible traits, and recognizable clothing or accessories when supported by the story.",
    '- Prioritize visible identity over inner world. Do NOT replace appearance with personality, backstory, or abstract traits.',
    '- Keep designs simple and memorable. Prefer 2-3 strong distinguishing features over long overloaded lists of minor details.',
    '',
    'SCENE FORMULA:',
    '- For each illustration, build sceneVisual as a clear visual combination of: subject + key visual traits + outfit + emotion + action + setting.',
    `- ${formatSceneVisualStagingDeltaRule('sceneVisual.setting')}`,
    '- Put emotion and action where they are visible: expression, posture, gesture, gaze, and interaction with props or other characters.',
    '',
    'FROZEN MOMENT ONLY:',
    '- Depict exactly one concrete frozen moment, as if a photographer stopped time.',
    '- Never describe a sequence of events, multiple beats, or "before/after/then" story progression inside one sceneVisual.',
    '- Before outputting, ask: "What is the single frame the viewer can see right now?"',
    '- If the story beat involves several simultaneous actions, choose the single clearest instant that makes the plot readable in one frame. Do not try to make every tiny action equally prominent.',
    '',
    'VISUAL FOCUS HIERARCHY:',
    '- For each illustration, internally choose ONE primary read: the single action, relationship, or reveal the viewer should understand first at a glance.',
    '- Optionally choose ONE secondary supporting read. Everything else must stay background support, not a competing focal task.',
    '- In the JSON response, state that intended focus only in illustrations[].primaryRead. This is the ONLY field where you explicitly name the main read in words.',
    '- Do not repeat or redefine focus in sceneVisual.setting, cameraComposition.shot, cameraComposition.characters[].description, or lighting with phrases like "the focal point is", "the focus is", "clear problem setup", or another competing read statement.',
    '- Do not make the viewer decode several equally important details at once. If three things all seem important, pick the one that tells the story best and simplify the rest.',
    '- Characters, props, and background details should be arranged to support the primary read, not compete with it.',
    '- If the primary read depends on a small object or precise gesture, reduce background complexity and avoid giving multiple other characters equally demanding micro-actions.',
    '- Once primaryRead is chosen, non-primary characters should usually get simple supporting behavior: watching, leaning, holding still, or one small witness gesture. Do not give them equally energetic, comic, or attention-grabbing actions unless they are part of the primary read.',
    '- Do not place the primary read in the far background while also expecting strong facial likeness and readable reactions from several foreground characters in the same wide shot.',
    '- If the scene contains both a large location reveal (bridge, ravine, tower, gate, courtyard, cliff, long path) and a small decisive action (handoff, clue, object exchange, page reading, key insertion), choose which one is primary. Do not demand both as equally readable in one medium-wide frame.',
    '- If the primary read is an exchange or handoff, the giver, receiver, and object must sit in one clear readable cluster. Do not separate them across large depth gaps or barrier geography.',
    '- When an environment image will exist downstream, treat environment layout as a fixed support layer. Put stable layout and static-object geography in environments[].description, then keep sceneVisual lean and focused on the characters, the moment, and any visible state change.',
    '',
    'VISIBLE LANGUAGE ONLY:',
    '- Describe what is actually visible in the frame: pose, expression, action, held objects, clothing, placement, environment, and lighting.',
    '- Avoid abstract summaries such as "hacking the system", "feeling adventurous", or "a magical moment" unless the visual evidence is also stated concretely.',
    '- Avoid inferred intent wording such as "as if ready to...", "as if searching for...", or "to help the others...". State only the visible action, posture, gaze, and result in the frame.',
    '- For reference-grounded characters, sceneVisual.cameraComposition.characters[].description must stay reference-safe: it may direct pose, expression, gaze, head turn, action, placement, hand use, and temporary occlusion only. It must NOT restate or paraphrase stable identity traits from the sheet, including hair details, eye color, freckles, face shape, skin tone, body build, age markers, or signature facial features.',
    '- Bad for reference-grounded characters: "adjusting her high ponytail", "freckles visible", "orange eyes look toward the tunnel", "wide eyes scan the wall". Good: "hand lifted near the head", "excited expression", "gaze directed toward the tunnel", "gaze directed toward the wall".',
    '- Do not write pseudo-labels or colon-tagged object lines such as "stone gargoyle:" or "magic gate:". Describe non-character objects in normal prose, not as labeled entries.',
    '- Use canonical character names consistently inside sceneVisual. Do not switch scripts or transliterations for the same character within one output.',
    '- For reference-grounded animals or creature companions, prefer morphology-safe wording: pose, gaze, placement, wings spread, standing beside, hovering above. Do not invent extra anatomy detail or comedy styling.',
    '',
    'RENDERABILITY AND SHOT SELECTION:',
    '- Prefer a composition that makes the key story action immediately readable over a composition that looks cinematic or symmetrical.',
    '- sceneVisual must visually realize primaryRead, not fight it. If sceneVisual reads like a different focal event than primaryRead, rewrite sceneVisual until they match.',
    '- If important information depends on small hand-object contact, object-slot alignment, a clue on a page, a tiny facial reaction, or another fine detail, choose a close enough shot for that detail to read clearly. Do NOT hide tiny critical actions inside a wide or medium-wide tableau.',
    '- If a barrier or depth transition (ravine, river, bridge span, doorway threshold, cliff edge, balcony gap) separates camera from the key action, do not keep the camera on the wrong side just to show the whole geography. Move closer to the action or demote the small action to supporting state.',
    '- Avoid overloading one frame with multiple separate micro-interactions that all require precise reading at once. If the scene contains a puzzle, mechanism, or several coordinated activations, choose the single most readable decisive instant and let the other relevant effects be visible as supporting state, not as three equally tiny simultaneous actions.',
    '- Do not add secondary composition goals such as "triangle composition", "perfect symmetry", or decorative staging when they compete with readability of the plot-critical action.',
    '- Do not rely on weakly visible wording such as "slightly ajar", "tiny gap", "barely visible", "subtle creak implied", or other near-invisible cues for something story-important. If it matters, make it clearly visible and plainly described.',
    '- For mechanisms, clues, or directional relationships, explicitly decide what must be large and readable in frame, and remove nonessential fine details that compete with that read.',
    '- For handoffs, gifts, exchanges, or receiving moments: one supporting character may witness or present, but do not assign several equally expressive gestures that pull focus away from the object transfer itself.',
    '- If one character is performing the primary action, keep secondary characters visually quieter. Avoid extra flourishes like mid-hop comedy beats, tongue-out poses, big wing flourishes, or dramatic hover loops unless that secondary action is itself the primary read.',
    '- For non-human sidekicks or creature companions that are reference-grounded but not the primary read, prefer calm, readable poses over comic distortion: standing close, upright beside, perched, or steady hovering usually work better than mid-hop, tongue-out, exaggerated bounce, or looping motion.',
    '- If a non-human companion must stay highly recognizable, keep its silhouette, head shape, ear/wing shape, facial marking pattern, and overall body proportions stable by not assigning a pose that would distort those features.',
    '- Avoid bracketed stage-direction tags or meta markers such as "[excited]", "[whisper]", "[shouting]". Convert them into plain visual language.',
    '',
    'POSITIVE PHRASING:',
    '- Use positive visual phrasing. State what is present, not what is absent.',
    '- Prefer "clear blue sky", "bare head", or "short brown hair" over "no clouds", "no hat", or "without long hair".',
    '',
    'KEEP IT LEAN:',
    '- Do not overload the prompt with unnecessary details that do not help recognizability or scene clarity.',
    '- If extra detail does not change what the illustrator should draw, leave it out.',
  ].join('\n');
}

export function formatDynamicForeshorteningRules(params: {
  unit: 'illustration' | 'panel';
}): string {
  const unitLabel = params.unit === 'panel' ? 'panel' : 'illustration';

  return [
    'RARE DYNAMIC FORESHORTENING OPTION:',
    `- Use this perspective in at most ONE ${unitLabel} across the entire story. It is an optional accent, not the default camera style.`,
    '- Use it only when the depicted moment naturally contains strong movement toward or away from the viewer: a safe jump, flight, dive, swing, controlled descent, rapid reach, or a large safe story object moving along the camera axis.',
    '- In cameraComposition.shot, explicitly write "extreme dynamic foreshortening" and place the camera directly on the action axis. Let the nearest safe hand, foot, or story object dominate the foreground at exaggerated apparent scale while the body recedes sharply into depth with strong converging perspective lines.',
    '- Keep the character face visible, readable, and recognizable. Preserve believable anatomy, stable identity, and one clear frozen moment despite the perspective distortion.',
    '- Use only scene-supported motion accents such as flying leaves, snow, water spray, dust, fabric, or harmless fragments. They must reinforce the existing action rather than invent a new event.',
    '- Do not use this perspective for calm dialogue, reading, precise hand-object contact, small clues, crowded compositions, or any scene where distortion would weaken primaryRead.',
    '- Do not point weapons, dangerous tools, sharp tips, or threatening objects at the viewer. Use child-safe action and props.',
    '- Preserve the requested imageStyle. Do not add anime genga, construction-pencil lines, storyboard marks, or another art medium unless that style was independently requested.',
  ].join('\n');
}

/**
 * Director-only: create one compact story-level map-tile brief.
 */
export function formatDirectorMapTileRules(): string {
  return [
    'CRITICAL - MAP TILE BRIEF:',
    'Create exactly ONE top-level mapTile for the whole story, not one per illustration.',
    'mapTile is separate from illustrations[].sceneVisual. sceneVisual stages book illustrations with characters; mapTile stages the single modular board-game reward tile for the finished story.',
    'The tile must summarize the important visible locations and landmarks from ALL planned illustrations, not only the first or last illustration.',
    'If the illustrations show a river in one scene, a bridge over that river in another scene, and a gate/door/portal in another scene, the single mapTile should include river + bridge + portal when they can coexist on one map tile.',
    'Do not add implied feature tokens. A bridge does not imply river; a portal does not imply cave; pond does not imply river. Waterfall must be paired with river. requiredFeatures is an exact mask contract.',
    'requiredFeatures describes physical mask geometry on the tile surface, not decorative or background objects seen through windows, portholes, screens, paintings, dreams, memories, or the sky.',
    'Every tile has a road/path as its main connector. requiredFeatures must include path; if the Director omits it, backend normalization will add path automatically.',
    'The Director does NOT choose geometry, orientation, side directions, connector directions, mask ids, or exact placement. The mask selector will choose geometry only from exact requiredFeatures matches.',
    '',
    'mapTile.description:',
    '- Return one compact English paragraph with drawable visual information only.',
    '- Write it like a dry art-director inventory for image generation, not like story prose.',
    '- Start with ONE primary visible anchor: the largest readable place, landmark, environment, or surface system on the tile.',
    '- Then add 2-4 secondary visible landmarks or environmental features. Use concrete nouns, visible materials, shapes, colors, scale, and clear physical state.',
    '- Then add only a few minor visible details. Minor details must stay small, sparse, and non-repeating; do not turn a small prop, symbol, tool, doorway, glow, smoke, or decoration into the visual theme unless the whole story is mainly about it.',
    '- End with continuous visible filler: broad physical surfaces and background objects that fill remaining non-route areas.',
    '- Keep the priority order, but write normal prose. Omit meta labels such as primary anchor, main anchor, secondary landmarks, minor details, filler surfaces, or broad filler from the returned paragraph.',
    '- Each visual idea should appear at only one priority level. If a key, symbol, gate, portal, object, or texture is minor, mention it once as minor; do not repeat it in the primary anchor, secondary landmarks, and filler.',
    '- Use only things an image model can draw directly. Replace abstract or literary words with visible effects: say "white cloth napkin strip across black ink" instead of "enchanted napkin"; say "gold specks on wood" instead of "magic dust makes the ink fade".',
    '- Use static visible states instead of personality labels: say "closed worn book with gray puffs above the cover" instead of "\\"sleepy\\" book"; say "small gnawed hole in a web" instead of "secret opening".',
    '- Name environments as physical places and surfaces: say "old bookshop aisle with wooden shelf floor" instead of "secret book-world"; say "round metal hatch" instead of "mysterious portal".',
    '- Omit story titles, sensory cues, feelings, emotions, comfort, danger, importance, narrative purpose, implied story meaning, and quoted nickname/adjective labels.',
    '- Avoid wording like secret, hidden, world, universe, cozy, warm scent, enchanted, magical, mysterious, suggests, seems, feels, atmosphere, dominates, scent, sleepy, trembling, or "story-book soft" unless the sentence names an actual visible shape, material, color, light, texture, or object state.',
    '- Route geometry is controlled later by a mask, not by this description. You may name the route surface material or crossing material when it matters, but do not describe where a path, trail, road, bridge approach, corridor, route, or walkway goes, continues, threads, leads, winds, branches, or connects.',
    '- Do not make the route line itself the primary anchor or a secondary landmark. An environment may be an interior corridor, room, clearing, deck, shore, or passage setting; the connector layout belongs only to the mask.',
    '- Write landmarks as top-down map contents, not landscape-camera scenery. Avoid horizon, sky, clouds overhead, skyline, foreground/background, towering walls, slopes rising, or side-view phrases. Convert these into flat surface marks: gray cloud shadows on ground, contour bands, ridge patches, dark portal marks, mist patches, rock texture regions.',
    '- Decorative/background story elements such as a bridge seen through a porthole, window, screen, memory, dream, or sky may stay in description with that viewing context. They are scenery, not requiredFeatures.',
    '- If the story has guiding flowers, lights, stones, dust, cables, papers, or similar directional motifs, describe them as sparse accents around landmarks or across the environment, not as a continuous path line.',
    '- Describe contents and materials, not directions. Do not say north/south/east/west/top/bottom/left/right, do not specify edge positions, do not specify where connectors enter.',
    '- Do not make characters the main subject. Tiny scale markers are acceptable only when they do not compete with landmarks.',
    '- Avoid empty space by naming broad filler categories from the story world, but keep filler visually quieter than the primary anchor and secondary landmarks.',
    '',
    'mapTile.requiredFeatures:',
    '- Return short normalized feature hints for deterministic mask selection.',
    '- Use only these exact lowercase tokens: path, river, waterfall, pond, sea, bridge, portal.',
    '- Always include path. It means the required road/corridor/trail connector that makes every tile placeable.',
    '- Do not include biome/style words such as forest, interior, spaceship. Put those in mapTile.description instead.',
    '- Use river for flowing water: river, stream, creek, brook.',
    '- Use waterfall when falling water, a cascade, or a water curtain is a visible tile-surface landmark on a river route. Include river with waterfall.',
    '- Use pond for contained still water or contained liquid: pond, small lake, lagoon, ink pool, large puddle.',
    '- Use sea for large edge water: sea, ocean, coast, beach, bay, shoreline.',
    '- Use portal for any meaningful entrance connector: doorway, arch, gate, hatch, airlock, cave, tunnel, cavern, grotto, crystal cave, magical entrance.',
    '- Include bridge ONLY for a route-level traversable crossing on the tile surface: bridge, pier, plank, cloth walkway, napkin strip, raised crossing, or a path crossing over a visible obstacle.',
    '- Do NOT include bridge for a distant, decorative, symbolic, broken, inaccessible, or background bridge seen through a window, porthole, screen, painting, sky, memory, or dream. Put that object in mapTile.description with clear wording such as "visible through the porthole" if it matters.',
    '- Do not add river/pond/sea unless that water or liquid is explicitly story-supported.',
  ].join('\n');
}

/**
 * Director-only: mandatory wardrobe JSON — mirrors the strictness of environment rules.
 * Missing outfitId on a character row in the shot breaks downstream image generation.
 */
export function formatDirectorWardrobeContract(params: { imagesPerStory: number }): string {
  const n = params.imagesPerStory;
  const multi = n > 1;
  return [
    'CRITICAL - Wardrobe JSON (same priority as environmentId — each character row cites outfits[].id, but detailed wardrobe is human-only):',
    `- Your response includes "outfits" (array) and exactly ${n} illustration object(s). Each illustration's sceneVisual.cameraComposition.characters MUST be a non-empty array; EVERY row includes required fields name, description, and outfitId (non-empty string referencing outfits[].id).`,
    '- INVALID: any character row without outfitId, or an empty characters array. Same strictness as environmentId.',
    '- WORK ORDER (for EACH illustration):',
    '  1) List who is in the shot in sceneVisual.cameraComposition.characters (name + description for pose/action).',
    '  2) Ensure outfits[] has a row { id, characterName, description } for every outfitId you will cite.',
    "  3) On EACH character row, set outfitId = EXACT outfits[].id for this anchor moment (same spelling as in outfits[].characterName for that row's name).",
    '- Child/person/human characters: if default/reference clothes still fit the scene, outfits[].description may be exactly "natural appearance". Otherwise use detailed wardrobe-only English.',
    '- Animals, imaginary creatures, objects, vehicles, and environmental beings: outfits[].description must be exactly "natural appearance" — still set outfitId on every character row as a technical binding, but do not write garment text for them.',
    '- outfits[].description is GARMENTS ONLY. Never mention mannequins, dolls, wooden bodies, articulated limbs, hinge joints, peg joints, seam segmentation, blank heads, or display-figure anatomy.',
    '- Reuse the same outfitId across illustrations when the story keeps the same look; new id when clothes change.',
    '- SELF-CHECK: every character in the shot has outfitId set. Do not omit a co-star (e.g. second parent in the same boat).',
    multi
      ? '- Repeat for EVERY illustration independently — do not copy incomplete character rows from another block.'
      : '- For one summary illustration, every character in cameraComposition.characters must have outfitId.',
    '- environments[] = place only. Garment prose only in outfits[].description.',
  ].join('\n');
}

/**
 * Format scene-level rules (PACING, HOOKS, VOCAB) for single-scene regeneration.
 * No PLOT structure — used when regenerating one scene.
 */
export function formatSceneLevelRules(params: { ageGroup: string }): string {
  const { ageGroup } = params;
  const isYoung = YOUNG_AGE_GROUPS.includes(ageGroup);

  if (isYoung) {
    return `SCENE RULES:
- Keep paragraphs short (2-3 sentences).
- Include dialogue. End with a small surprise or question when possible.`;
  }

  return `SCENE RULES:
- Max 2 consecutive description sentences.
- Include: 1 action beat, >=2 dialogue lines, 1 short punchy sentence (3–7 words).
- Paragraphs 2–4 sentences.
- End scene with micro-hook (question / new clue / small twist). No flat endings.
- Vocabulary: if you use a harder word, keep it clear through the beat and dialogue alone—no parentheses, appositives, or "which means" glosses. Avoid rare or archaic words unless the scene already makes the sense unmistakable.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared visual story rules — used by TextPrompt, DirectTextPrompt,
// and RegenerationPrompt.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mandatory outfits[] + per-scene references — short, prominent.
 * Call this inside formatVisualStoryRules before environment rules.
 */
export function formatCharacterOutfitsMandatory(): string {
  return [
    'OUTFITS — MANDATORY (canonical wardrobe):',
    '- Use a top-level "outfits" array. Each entry: unique "id" (short string within the story), "characterName" (EXACT name as in characters[]), "description" (WARDROBE ONLY IN ENGLISH).',
    '- Every scene\'s sceneVisual.cameraComposition.characters MUST be a non-empty array. EACH character row MUST include "outfitId" (non-empty string, must exist in outfits[]) alongside "name" and "description" — same strictness as environmentId.',
    '- Include one row per character physically present in the scene (humans in clothes; animals/creatures: outfits[].description "natural appearance" and still set outfitId on the row).',
    '- For humans, first decide whether the default/reference clothes already fit the scene. If yes, set outfits[].description to exactly "natural appearance". If no, write an explicit wardrobe description for the changed outfit.',
    'WARDROBE FIELD ONLY — NOT identity or head:',
    '  - INCLUDE: garments, shoes, boots, worn hats/helmets/hoods (as clothing), scarves, belts, mittens, jewelry worn on the body, glasses worn, clearly worn bags/backpacks, uniform pieces, disguise costume pieces.',
    '  - DO NOT INCLUDE: face, eyes, nose, mouth, skin, age, body build, height, hair, hairstyle, beard, fur pattern (for creatures — use "natural appearance"), expression, emotions, personality. Those belong in characters[].description and sceneVisual.cameraComposition.characters[].description.',
    '  - DO NOT INCLUDE: mannequin traits or display-form anatomy such as wooden limbs, articulated elbows/knees, peg joints, segmented arms/legs, blank mannequin head, dress form, or doll mechanics. Describe only the garments themselves.',
    'Outfit descriptions must be DETAILED and aligned with WEATHER, SEASON, and indoor/outdoor context (snow → coat/boots; rain → jacket; heat → light fabrics; beach → swimwear). Match the environment and scene text.',
    'Reuse the same outfit id when the character keeps the same look across scenes; create a new id when the story changes clothes.',
    'Animals/creatures: description "natural appearance" in outfits[].',
  ].join('\n');
}

/**
 * Environment definition rules with good/bad examples.
 */
export function formatEnvironmentRules(): string {
  return [
    'CRITICAL - Environments (Base Descriptions):',
    '- Define environments AFTER scenes and outfits. One entry per unique environmentId used in scenes.',
    '- Each environment has THREE fields (all required): id, name, description. Do NOT put wardrobe in environments — use the outfits array and per-character outfitId on sceneVisual.cameraComposition.characters only.',
    '  - "id": Short identifier (e.g. "bedroom", "forest_clearing")',
    '  - "name": Human-readable name',
    '  - "description": BASE visual description IN ENGLISH of the fixed, permanent elements:',
    '    * Room structure: layout, shape, dimensions',
    '    * Permanent furniture: beds, tables, shelves, cabinets',
    '    * Fixed features: walls, floor, ceiling, windows, doors',
    '    * Key permanent objects: decorations, fixtures, large items',
    '    * Materials and colors of permanent elements',
    '    * Weather and time-of-day when they affect the place (snow on ground, rain, night sky) — as part of the location, not character wardrobe',
    '    * SPATIAL LAYOUT: describe where key objects are (left/center/right, foreground/background) AND their positions relative to each other (path beside the tree, house behind the bushes, bushes to the left of the path). This layout is reused for ALL scenes in this environment.',
    '    * Include ALL static objects that appear in the story: flower, tree, rock, bench — everything that has a fixed place. If the story mentions a flower, it must be in environment.description with its position. No static object may appear "new" in sceneVisual — it must already be in the environment. Scene delta can only describe state changes (flower bloomed, tree lit up), not new objects.',
    '- Base description should work for ALL scenes in this location',
    '- STORY-CRITICAL STATIC OBJECTS (tree, building, monument, rock, path, bushes, flower, bench) MUST be in environment.description with fixed position. For each: position in frame (left/center/right, foreground/background) AND position relative to other objects ("tree to the left of path", "path leads from foreground to tree", "bushes along left side of path", "house behind trees").',
    '- NO NEW STATIC OBJECTS IN SCENE: If an object appears in the story (flower, tree, rock), it is ALWAYS in environment. In scene delta — only state changes (flower bloomed, tree lit up, leaves rustling), never new objects or new positions. The object must be on the environment image.',
    '- DO NOT include temporary/transient elements (those go in sceneVisual.setting)',
    '- Example description (indoor): "A cozy circular living room with panoramic windows on north wall showing space. Plush beige armchairs around low round coffee table. Warm beige walls, polished dark grey floor with light rug, ambient ceiling lights."',
    '- Example description (outdoor with spatial layout): "Winter park. A path leads from foreground center toward a distinctive green-leaved tree in the center-right. Bushes along the left side of the path. Bare trees along the left and right edges. Snow on the ground. Open sky above."',
    '- When to REUSE environmentId: Same physical location, minor variations. Examples:',
    '  * Same bedroom: scene 1 (morning, bed made) and scene 4 (evening, pajamas on) → same "bedroom"',
    '  * Same beach: scene 2 (building sandcastle) and scene 6 (swimming) → same "beach"',
    '  * Same kitchen: scene 3 (breakfast) and scene 7 (dinner) → same "kitchen"',
    '  * Same forest path: scene 2 (walking) and scene 4 (resting on log) → same "forest_path"',
    '- When to CREATE NEW environmentId: Scene describes a distinctly different physical place. Examples:',
    '  * Forest path vs forest glade/clearing — different (path: trees around, canopy; glade: open space, sky visible, grass, different composition)',
    '  * Different rooms (bedroom vs kitchen vs living room)',
    '  * Cave entrance vs cave interior',
    '  * Beach vs pier or beach vs underwater',
    '  * Any sub-location with different visual structure (layout, sky visibility, key landmarks) — use separate environment.',
    '- Good example: scene 3 "forest path" → environmentId "forest_path"; scene 5 "spacious glade with Silver Tree" → environmentId "silver_tree_glade" (NOT same as forest_path).',
  ].join('\n');
}

/** Universal rule: avoid ambiguous "at" when standing near furniture (image models may read as "on"). */
const SPATIAL_POSITION_RULE =
  'Position near furniture: use beside, next to, behind, in front of — avoid "at" when standing (read as "on").';

export function formatSceneVisualStagingDeltaRule(fieldName = 'sceneVisual.setting'): string {
  return `${fieldName} must be a visual staging delta, not a plot summary: write 1-2 compact English sentences with concrete visible details beyond the environment plate: visible object state, material/color/light, hand/paw contact, body posture, gaze/expression, and foreground/background placement. If a fixed artifact reference is visible, include its REF_OBJ_* label plus 2-4 visible traits from the artifact description; avoid vague wording like "the object is now resting".`;
}

/**
 * Scene visual description rules (setting + cameraComposition + lighting).
 * Full version includes synchronization rules and good/bad examples.
 * Compact version (for RegenerationPrompt) has only field descriptions.
 */
export function formatSceneVisualRules(opts?: {
  compact?: boolean;
  imageStyle?: string | null;
}): string {
  const styleGuidance = getTextStyleGuidance(opts?.imageStyle);

  // Helper to add style hint to field description
  const withStyleHint = (baseDesc: string, styleDesc?: string) => {
    if (!styleDesc) return baseDesc;
    return `${baseDesc} [STYLE: ${styleDesc}]`;
  };

  if (opts?.compact) {
    return [
      'CRITICAL - sceneVisual:',
      withStyleHint(
        '- "setting": DELTA ONLY - Scene-specific additions IN ENGLISH. Describe ONLY what is NEW, CHANGED, or TRANSIENT in this scene compared to the base environment description: temporary objects (mugs on table, books open, toys on floor), scene-specific state (door open/closed, curtains drawn/open), items being actively used, lighting changes (candles lit, lamps on/off), weather effects (rain outside, fog). DO NOT repeat base structure (walls, permanent furniture, fixed layout) - that comes from environment.description. Write as standalone additions. STANDALONE: never use "the same X", "as before"; if location unchanged, repeat key visual elements. Write IN ENGLISH.',
        styleGuidance?.setting
      ),
      withStyleHint(
        '- "cameraComposition": An OBJECT with two fields:',
        styleGuidance?.composition
      ),
      '  - "shot": Camera angle and shot type IN ENGLISH (e.g. "Medium-wide shot at child eye-level").',
      `  - "characters": Array of objects, one per character. Each has "name", "description" (position, posture, action, expression IN ENGLISH), and "outfitId" (EXACT outfits[].id). ${SPATIAL_POSITION_RULE} Maximum 3 characters.`,
      '  - When a character points, looks, or gestures toward something story-significant, include the target in that character\'s description and make the direction explicit (name the target when the text supports it — avoid vague "toward the sea" if a specific object, creature, or landmark is meant).',
      withStyleHint(
        '- "lighting": Light source, direction, intensity, shadows, color temperature, atmosphere. Write IN ENGLISH.',
        styleGuidance?.lighting
      ),
      '- ALL sceneVisual fields MUST be written in ENGLISH regardless of story language.',
      '- NO NEW STATIC OBJECTS: Scene delta only STATE changes (flower bloomed, tree lit up). Static objects must be in environment.',
    ].join('\n');
  }

  return [
    'CRITICAL - sceneVisual (structured visual description for image generation):',
    '- "sceneVisual" is an object with three fields, ALL IN ENGLISH:',
    withStyleHint(
      '  - "setting": DELTA ONLY - Scene-specific additions IN ENGLISH. Describe ONLY what is NEW, CHANGED, or TRANSIENT in this scene compared to the base environment description: temporary objects (mugs on table, books open, toys on floor), scene-specific state (door open/closed, curtains drawn/open), items being actively used, lighting changes (candles lit, lamps on/off), weather effects (rain outside, fog). DO NOT repeat base structure (walls, permanent furniture, fixed layout) - that comes from environment.description. Write as standalone additions. If minimal changes, describe time-of-day atmosphere or one concrete visible change. Write IN ENGLISH.',
      styleGuidance?.setting
    ),
    '    - STANDALONE: NEVER use "the same X", "as before", "continuing from previous scene". If the location is unchanged, REPEAT the key visual elements (describe the nook, foliage, objects) — do not reference other scenes.',
    withStyleHint(
      '  - "cameraComposition": An OBJECT with two fields:',
      styleGuidance?.composition
    ),
    '    - "shot": Camera angle (wide/medium/close-up), eye level, and framing. IN ENGLISH.',
    '    - "characters": Array of objects — one entry per character physically present in the scene. Maximum 3 characters. Each entry has:',
    '      - "name": EXACT character name from the story character list',
    `      - "description": Position in frame (foreground/background, left/right/center), body posture, visible action, facial expression, gaze direction. Use positions relative to static objects from environment (e.g. "beside the tree", "on the path"). ${SPATIAL_POSITION_RULE} IN ENGLISH.`,
    '      - For reference-grounded characters, do NOT restate stable identity traits here (no hairstyle, hair color, eye color, freckles, face shape, skin tone, or other enduring appearance details). Keep this field about the frozen moment only.',
    '      - Avoid inferred intent phrasing such as "as if ready to enter", "as if searching for clues", or "to help the others see". Describe only what is visibly happening in the frame.',
    '      - When a character points, looks, or gestures toward something story-significant, include the target in that character\'s description and make the direction explicit (e.g. not only "standing center, pointing toward the sea" but "center-right on wet sand, arm outstretched, pointing directly at the dolphin circling near the rocky reef, eyes fixed on it" when the text supports that level of specificity).',
    '      - "outfitId": EXACT id from top-level outfits[] for this character in this scene (wardrobe reference; creatures/animals use a row with description "natural appearance").',
    withStyleHint(
      '  - "lighting": Light source, direction, intensity, shadow style, color temperature, atmosphere.',
      styleGuidance?.lighting
    ),
    '- Each field MUST be in English for image generation',
    '- cameraComposition.characters is the SINGLE SOURCE OF TRUTH for which characters are drawn in the scene illustration',
    '- The base environment structure comes from environment.description - sceneVisual.setting should only add scene-specific deltas.',
    '- REFERENCE FIXED LAYOUT: sceneVisual.setting and cameraComposition must reference the fixed layout from environment (e.g. "children gathered around the tree" not "tree on the left"). Character positions relative to static objects from environment (e.g. "foreground center on the path, standing beside the tree", "left of the bushes").',
    '- NO NEW STATIC OBJECTS: sceneVisual.setting must NOT introduce new static objects (flower, tree, rock, bench). If an object appears in the story, it must be in environment.description. Scene delta can only describe STATE changes (flower bloomed, tree lit up, leaves rustling) — not new objects or new positions. The object is always in the same place and same appearance.',
    '- Use the SAME spatial references from environment.description (e.g. "beside the tree", "on the path", "in front of the house", "between the bushes"). Never invent new positions for key objects — they are fixed in the environment. Never add new static objects in scene — only state changes (bloomed, lit up) for objects already in environment.',
    '- Example good setting delta: "Two books and telescope on coffee table. Windows show morning stars. Dad holding glowing seed in open palm."',
    '- Example bad setting: "A cozy circular living room with panoramic windows..." (this duplicates base environment - only write what\'s new)',
    '- Example bad setting: "The same hidden nook. Branch lowered." (references previous scene — image model has no context). Good: "A hidden nook with lush glowing foliage. The magical bush branch is now lowered. A woven basket on the ground, partially filled with berries."',
    '- Example good cameraComposition: { "shot": "Medium-wide shot at child eye-level", "characters": [{ "name": "Emilia", "description": "foreground center beside workbench, sitting, examining a blueprint with magnifying glass, focused expression", "outfitId": "o_emilia_workshop_1" }, { "name": "Rabbit", "description": "right side perched on workbench edge, ears perked up, looking curiously at Emilia", "outfitId": "o_rabbit_natural" }] }',
    '- Example bad cameraComposition: "Characters in a workshop" (too vague, not structured, no per-character entries)',
    '',
    'EXAMPLE - Base+Delta Pattern:',
    'Environment (moon_farm_living_room):',
    '  description: "Circular living room with panoramic windows on north wall, plush beige armchairs around low coffee table, warm beige walls, dark grey floor with light rug, ceiling lights"',
    '',
    'Scene 1 setting (delta): "Two books and telescope on coffee table. Windows show morning stars. Dad holding glowing seed in open palm."',
    'Scene 9 setting (delta): "Two steaming mugs on coffee table. Evening starlight through windows. Cozy blanket draped over one armchair."',
    '',
    '→ Image prompt receives: base + delta combined',
  ].join('\n');
}

/**
 * Target and hard cap: 1-3 active characters per scene illustration.
 */
export function formatCharactersPerSceneRules(): string {
  return [
    `CRITICAL - Characters Per Scene (maximum ${MAX_SCENE_IMAGE_CHARACTERS} per illustration):`,
    `- Each scene should have AT MOST ${TARGET_SCENE_IMAGE_CHARACTERS} characters physically present and actively participating in the action.`,
    `- If the story has more than ${TARGET_SCENE_IMAGE_CHARACTERS} characters, rotate them: some characters go to another room, leave on an errand, stay behind, or arrive later. Write the plot so that each scene naturally focuses on 1-${TARGET_SCENE_IMAGE_CHARACTERS} characters.`,
    '- The protagonist (main child character) should be in almost every scene.',
    '- Other characters can be briefly MENTIONED (heard from another room, just left, remembered in dialogue) but should NOT be described as physically present and performing actions in the scene.',
    `- "cameraComposition.characters": list ONLY the characters who are physically present and actively participating in the scene (same characters who perform actions in the text). Maximum ${MAX_SCENE_IMAGE_CHARACTERS}. If more characters are present in the story beat, include the child/protagonist plus the two most important supporting characters for this illustration.`,
    '- Use EXACT character names as defined in the story',
    '- Structured JSON requires at least one cameraComposition.characters row with name, description, and outfitId. Design scenes so the illustrated moment includes at least one present character; pure scenery-only beats are not supported by the schema.',
  ].join('\n');
}

/**
 * Text-visual consistency rules — text and illustration must match.
 */
export function formatTextVisualConsistencyRules(): string {
  return [
    'CRITICAL - Text-Visual Consistency:',
    '- The scene "text" and "sceneVisual" MUST describe the SAME moment. The illustration is a snapshot of what happens in the text.',
    '- Every character in cameraComposition.characters MUST be performing a visible action described in the scene text. If the text says "Rabbit sat on the rug", the cameraComposition must show Rabbit sitting on the rug.',
    '- Do NOT include characters in cameraComposition.characters if they are only mentioned in passing, heard off-screen, or remembered in the text.',
    '- The setting in "sceneVisual.setting" must match the location described in the text.',
    '- sceneVisual.setting must be SELF-CONTAINED — never use "the same X" or reference other scenes.',
    '- INTERNAL CONSISTENCY: setting, cameraComposition.shot, cameraComposition.characters, and lighting must ALL describe the SAME location and moment. If shot says "inside the car", setting must describe the car interior — never mix locations. Before outputting, verify: could a single photograph capture everything described?',
    "- Story-significant props and held items in sceneVisual (objects a character holds, wears as a plot item, or that drive the beat) must be supported by that scene's text for that moment. Do not add major props or costume pieces in sceneVisual that the text does not establish for that scene (generic background and atmosphere are fine).",
    '- Think of it as: text = the full story of the scene, sceneVisual = a single illustration capturing the key moment of that text.',
    '- outfits[].description is WARDROBE ONLY. Hair, expression, pose, and how the face reads belong in sceneVisual.cameraComposition.characters[].description (and must match the same story moment as the text).',
  ].join('\n');
}

/**
 * Scene text boundary rules — sentences must not split across scenes.
 * @param context - structured: JSON scene "text" field; plain: prose blocks between --- delimiters
 */
export function formatSceneTextBoundaryRules(
  context: 'structured' | 'plain' = 'structured'
): string {
  const subject =
    context === 'plain'
      ? 'Each scene block (the narrative prose between --- delimiters)'
      : 'Each scene\'s "text"';
  return [
    'CRITICAL - Scene Text Boundaries:',
    `- ${subject} MUST end at a complete sentence boundary (period, exclamation mark, or question mark followed by any closing quotes)`,
    '- NEVER split a sentence across two scenes — every sentence must belong entirely to one scene',
    '- Do NOT start a new sentence at the end of a scene that continues in the next scene',
  ].join('\n');
}

/**
 * Writer-only rules for Director plain-text flow: TTS audio tags + scene prose boundaries.
 * Omits outfit/environment/sceneVisual composition rules (those belong to the Director pass).
 * When includeAudioTagsInWriter is false (deferred prosody at TTS — app default), audio tag rules are omitted — tags are added at TTS time.
 */
export function formatWriterPlainSceneRules(opts?: {
  scenarioCardId?: string;
  policyProfile?: PolicyProfile;
  /** Default true. Set false when audio tags are deferred to the TTS pipeline. */
  includeAudioTagsInWriter?: boolean;
}): string {
  const policyProfile = opts?.policyProfile ?? {
    ageGroup: '6-8',
    language: 'en',
    disallowedRules: [],
    allowedConflicts: [],
    constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
    readability: { maxSentenceLen: 18, targetWordsRange: [500, 800], dialogRatio: 0.5 },
    promptGuidelines: '',
  };
  const includeAudio = opts?.includeAudioTagsInWriter !== false;
  const audioTagsRules = includeAudio
    ? getContentPolicy({
        policyProfile,
        scenarioCardId: opts?.scenarioCardId,
      }).audioTagsRules
    : null;
  return [audioTagsRules, formatSceneTextBoundaryRules('plain')].filter(Boolean).join('\n\n');
}

/**
 * Art style visual guidance for text generation.
 * Tells the text model how to describe settings/characters for the chosen image style,
 * so sceneVisual is style-aware (e.g. "clay walls" for clay, not generic "painted walls").
 */
/**
 * Composite function: all shared visual story rules in one call.
 * Used by TextPrompt and DirectTextPrompt.
 * Uses getContentPolicy for audio tags when policyProfile provided.
 */
export function formatVisualStoryRules(opts?: {
  imageStyle?: string | null;
  scenarioCardId?: string;
  policyProfile?: PolicyProfile;
  includeAudioTagsRules?: boolean;
}): string {
  const policyProfile = opts?.policyProfile ?? {
    ageGroup: '6-8',
    language: 'en',
    disallowedRules: [],
    allowedConflicts: [],
    constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
    readability: { maxSentenceLen: 18, targetWordsRange: [500, 800], dialogRatio: 0.5 },
    promptGuidelines: '',
  };
  const audioTagsRules =
    opts?.includeAudioTagsRules === false
      ? null
      : getContentPolicy({
          policyProfile,
          scenarioCardId: opts?.scenarioCardId,
        }).audioTagsRules;

  const parts = [
    formatCharacterOutfitsMandatory(),
    formatEnvironmentRules(),
    formatSceneVisualRules({ imageStyle: opts?.imageStyle }),
    formatCharactersPerSceneRules(),
    formatTextVisualConsistencyRules(),
    audioTagsRules,
    formatSceneTextBoundaryRules(),
  ];
  return parts.filter(Boolean).join('\n\n');
}

/**
 * Template literal helper for clean multiline prompts
 * Removes leading/trailing whitespace and normalizes line breaks
 * @param strings - Template strings
 * @param values - Template values
 * @returns Clean prompt string
 */
export function cleanTemplate(strings: TemplateStringsArray, ...values: any[]): string {
  let result = '';

  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      result += values[i];
    }
  }

  // Trim leading/trailing whitespace from each line
  // Remove empty lines at start/end
  const lines = result.split('\n');
  const trimmedLines = lines.map((line) => line.trimEnd());

  // Remove leading empty lines
  while (trimmedLines.length > 0 && trimmedLines[0] === '') {
    trimmedLines.shift();
  }

  // Remove trailing empty lines
  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1] === '') {
    trimmedLines.pop();
  }

  let out = trimmedLines.join('\n');
  // Empty template interpolations stack extra newlines from the source template; cap at one blank line.
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}
