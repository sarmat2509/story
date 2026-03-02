/**
 * Prompt Helper Functions
 * Reusable utilities for building prompts
 * 
 * These are pure functions that format story parameters, child profiles,
 * safety policies, etc. They are used by all prompt builders.
 */

import type { StorySpec, PolicyProfile } from '../ai/types';
import { getLanguageFullDisplay } from '@wondertales/shared';
import { getTextStyleGuidance } from './image/styles';

/**
 * Get full language display name from code
 * @param code - Language code (uk, ru, en, es, de, fr)
 * @returns Full language name (e.g., "Ukrainian (Українська)")
 */
export function getLanguageName(code: string): string {
  return getLanguageFullDisplay(code as any);
}

/**
 * Format child profile section for prompts
 * @param spec - Story specification
 * @returns Formatted child profile text
 */
export function formatChildProfile(spec: StorySpec): string {
  // Check if child is selected as a character (in spec.characters array)
  const childIsCharacter = spec.characters?.some(c => c.type === 'child' && c.name === spec.childName);
  
  // If no child profile, return empty
  if (!spec.childProfile) {
    return '';
  }
  
  // If child is NOT selected as character, show only preferences/context
  if (!childIsCharacter && spec.childName !== spec.childProfile.name) {
    const parts = [
      'TARGET AUDIENCE PROFILE:',
      `Age group: ${spec.ageGroup}`
    ];
    
    // Add interests if available
    if (spec.childProfile?.interests && spec.childProfile.interests.length > 0) {
      parts.push(`Child's interests (use for inspiration): ${spec.childProfile.interests.join(', ')}`);
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
    parts.push('Note: Create appropriate protagonist(s) for the story. The child profile above is for context only.');
    
    return parts.join('\n');
  }
  
  // If child IS selected as character, show profile focusing on personality, interests, fears
  const parts = [
    `Main Character: ${spec.childName}`,
    `Age group: ${spec.ageGroup}`
  ];
  
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
    'When referencing these characters in your response, include their ID in square brackets after the name (e.g., "Mokhovyk [ID: abc-123]").',
    ''
  ];

  spec.characters.forEach((char, index) => {
    // Include character ID for cross-language matching
    const nameWithId = char.id ? `${char.name} [ID: ${char.id}]` : char.name;
    const charParts = [`${index + 1}. ${nameWithId}`];
    
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
  parts.push('You may add additional characters if needed for the plot, but these MUST be included.');

  return parts.join('\n');
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
}): string {
  const parts = [];
  
  // Add scenario/theme with detailed guidance
  if (params.spec.scenarioCard) {
    parts.push(`- Theme/Scenario: ${params.spec.scenarioCard.name} - ${params.spec.scenarioCard.description}`);
    if (params.spec.scenarioGuidance) {
      parts.push(`  Setting & Premise: ${params.spec.scenarioGuidance}`);
    }
  }
  
  // Add goal/moral with detailed guidance
  if (params.spec.goal) {
    const goalDisplay = params.spec.goalName || params.spec.goal; // Use translated name or fallback to slug
    parts.push(`- Goal/Moral: ${goalDisplay}`);
    if (params.spec.goalGuidance) {
      parts.push(`  Guidance: ${params.spec.goalGuidance}`);
    }
  } else {
    parts.push(`- Goal/Moral: general positive message`);
  }
  
  parts.push(`- Tone: ${params.spec.tone || 'calm'}`);

  if (params.sceneCount) {
    parts.push(`- Number of scenes: ${params.sceneCount}`);
  }

  if (params.targetWordCount) {
    parts.push(`- Target word count: ${params.targetWordCount[0]}-${params.targetWordCount[1]} words`);
  } else if (params.spec.policyProfile?.readability?.targetWordsRange) {
    const range = params.spec.policyProfile.readability.targetWordsRange;
    parts.push(`- Target word count: ${range[0]}-${range[1]} words`);
  }

  return parts.join('\n');
}

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
      '- Focus on basic emotions: happy, excited, surprised'
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
      '- Bright, cheerful atmosphere throughout'
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
      '- Focus on family, friendship, daily routines'
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
      '- Themes: helping others, being brave, solving problems together'
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
      '- Themes: Courage, responsibility, empathy, facing fears, problem-solving'
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
      '- Themes: Identity, moral complexity, justice, personal growth, relationships, consequences'
    ]
  };

  // Map age groups to requirements
  const ageReqs = requirements[ageGroup] || requirements['6-8']; // default to 6-8

  return ageReqs.join('\n');
}

/**
 * Format scary story specific requirements based on age
 * Only call this if the scenario is 'scary_stories'
 * @param ageGroup - Age group (0-1, 1y, 2-3, 4-5, 6-8, 9-12)
 * @returns Formatted scary story requirements for specific age
 */
export function formatScaryStoryRequirements(ageGroup: string): string {
  const requirements: Record<string, string[]> = {
    '4-5': [
      'SCARY STORY REQUIREMENTS (Ages 4-5: Silly & Friendly Spooks):',
      '- Tone: Humorous and playful, NOT frightening',
      '- Characters: Friendly ghosts, goofy monsters, silly witches, clumsy vampires',
      '- Situations: Funny misunderstandings, silly problems (monster afraid of dark, ghost can\'t scare)',
      '- Tension: Minimal - brief "uh-oh" moments quickly resolved with humor',
      '- Resolution: FAST positive ending within 1-2 scenes of any tension',
      '- Emphasis: Friendship, laughter, monsters are friends not threats',
      '- Style examples: Hotel Transylvania, Room on the Broom, Vampirina',
      '- CRITICAL: More silly than scary - kids should laugh, not worry'
    ],
    '6-8': [
      'SCARY STORY REQUIREMENTS (Ages 6-8: Gentle Goosebumps):',
      '- Tone: Mild mystery with safe, positive outcomes',
      '- Elements: Strange noises, mysterious shadows, "haunted" places, hidden secrets',
      '- Characters: Misunderstood creatures, friendly ghosts needing help, mysterious but kind beings',
      '- Tension: Moderate buildup allowed, but always explained logically or resolved positively',
      '- Problem-solving: Child uses bravery and cleverness to solve the mystery',
      '- Resolution: Clear explanation (wasn\'t actually scary, just misunderstood), friendship formed',
      '- Lessons: Facing small fears with courage, things aren\'t always as scary as they seem',
      '- Style examples: Friendly monster stories, mystery-adventure hybrids, cozy spooky',
      '- IMPORTANT: Spooky atmosphere YES, genuine fear NO - always safe feeling'
    ],
    '9-12': [
      'SCARY STORY REQUIREMENTS (Ages 9-12: Classic Kid Horror):',
      '- Tone: Suspenseful with sustained tension, but age-appropriate',
      '- Elements: Creepy settings, mysterious creatures, unexplained phenomena, detective work',
      '- Plot: Mystery that needs solving, clues to piece together, building suspense',
      '- Tension: Can build across multiple scenes, keeps reader guessing',
      '- Scary elements: Strange occurrences, eerie atmospheres, unknown threats (but NOT graphic/gory)',
      '- Problem-solving: Main character uses intelligence, courage, and persistence',
      '- Resolution: Mystery solved through cleverness, threats overcome, positive ending with accomplishment',
      '- Character growth: Overcoming significant fears, becoming braver and more confident',
      '- Style examples: Goosebumps series, Coraline, Scary Stories to Tell in the Dark (age-adapted)',
      '- BALANCE: Real suspense and "shivers" YES, nightmares and trauma NO'
    ]
  };

  // Default to 6-8 for unlisted age groups (0-1, 1y, 2-3 shouldn't use scary stories theme)
  const ageReqs = requirements[ageGroup] || requirements['6-8'];
  
  return ageReqs.join('\n');
}

/**
 * Format content safety policy section for prompts
 * @param policy - Policy profile
 * @returns Formatted safety policy text
 */
export function formatSafetyPolicy(policy: PolicyProfile): string {
  const sections = [
    'POSITIVE REQUIREMENTS:',
    '- MUST have happy, safe ending',
    '- Show problem-solving through: communication, kindness, asking for help',
    '- Include emotional validation (feelings are real and OK)',
    '- Characters learn and grow from experiences',
    '- Family/friends provide support when needed',
    '',
    'SAFETY GUIDELINES:',
    '- All content must be age-appropriate and safe',
    '- Conflicts resolve peacefully through communication',
    '- Focus on friendship, family love, and kindness',
    '- Include adult support when characters face challenges'
  ];

  return sections.join('\n');
}

/**
 * Format writing style guidelines for text generation
 * @param spec - Story specification
 * @param vocabLevel - Vocabulary level (simple, basic, intermediate, advanced)
 * @returns Formatted writing style text
 */
export function formatWritingStyle(spec: StorySpec, vocabLevel: string): string {
  const sections = [
    'WRITING STYLE:',
    `- Use ${vocabLevel} vocabulary appropriate for age ${spec.ageGroup}`,
    '- Include sensory details (sounds, colors, feelings)',
    '- Show don\'t tell emotions',
    '- Use rhythm and repetition for younger ages',
    '- Include dialog for character connection',
    '- Build to satisfying, safe conclusion'
  ];

  return sections.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared visual story rules — used by TextPrompt, DirectTextPrompt,
// ContinuationPrompt (via composite), and RegenerationPrompt (individual).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Environment definition rules with good/bad examples.
 */
export function formatEnvironmentRules(): string {
  return [
    'CRITICAL - Environments (Base Descriptions):',
    '- Define ALL distinct physical locations in "environments" array',
    '- Each environment has THREE fields:',
    '  - "id": Short identifier (e.g. "bedroom", "forest_clearing")',
    '  - "name": Human-readable name',
    '  - "description": BASE visual description IN ENGLISH of the fixed, permanent elements:',
    '    * Room structure: layout, shape, dimensions',
    '    * Permanent furniture: beds, tables, shelves, cabinets',
    '    * Fixed features: walls, floor, ceiling, windows, doors',
    '    * Key permanent objects: decorations, fixtures, large items',
    '    * Materials and colors of permanent elements',
    '- Base description should work for ALL scenes in this location',
    '- DO NOT include temporary/transient elements (those go in sceneVisual.setting)',
    '- Example: "A cozy circular living room with panoramic windows on north wall showing space. Plush beige armchairs around low round coffee table. Warm beige walls, polished dark grey floor with light rug, ambient ceiling lights."',
    '- Multiple scenes share same environmentId when location is same',
  ].join('\n');
}

/**
 * Scene visual description rules (setting + cameraComposition + lighting).
 * Full version includes synchronization rules and good/bad examples.
 * Compact version (for RegenerationPrompt) has only field descriptions.
 */
export function formatSceneVisualRules(opts?: { compact?: boolean; imageStyle?: string | null }): string {
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
        '- "setting": DELTA ONLY - Scene-specific additions IN ENGLISH. Describe ONLY what is NEW, CHANGED, or TRANSIENT in this scene compared to the base environment description: temporary objects (mugs on table, books open, toys on floor), scene-specific state (door open/closed, curtains drawn/open), items being actively used, lighting changes (candles lit, lamps on/off), weather effects (rain outside, fog). DO NOT repeat base structure (walls, permanent furniture, fixed layout) - that comes from environment.description. Write as standalone additions. If minimal changes, describe time-of-day atmosphere or specific focus. Write IN ENGLISH.',
        styleGuidance?.setting
      ),
      withStyleHint(
        '- "cameraComposition": An OBJECT with two fields:',
        styleGuidance?.composition
      ),
      '  - "shot": Camera angle and shot type IN ENGLISH (e.g. "Medium-wide shot at child eye-level").',
      '  - "characters": Array of objects, one per character physically present in the scene. Each has "name" (EXACT from character list) and "description" (position in frame, posture, action, expression IN ENGLISH). Maximum 3 characters.',
      withStyleHint(
        '- "lighting": Light source, direction, intensity, shadows, color temperature, atmosphere. Write IN ENGLISH.',
        styleGuidance?.lighting
      ),
      '- ALL sceneVisual fields MUST be written in ENGLISH regardless of story language.',
      '',
      'CRITICAL - characterOutfits:',
      '- REQUIRED object mapping EACH character from cameraComposition.characters to their outfit.',
      '- You MUST provide outfit for EVERY character in the scene.',
      '- Describe scene-appropriate attire (indoor: casual/pajamas, outdoor: coats/boots, etc).',
      '- For animals/creatures without clothes, write "natural appearance".',
      '- Example: { "Emilia": "cozy sweater, leggings", "Dad": "grey space farmer coveralls", "Rabbit": "natural appearance" }',
      '- NEVER return empty {} - always fill with character names from cameraComposition.',
    ].join('\n');
  }

  return [
    'CRITICAL - sceneVisual (structured visual description for image generation):',
    '- "sceneVisual" is an object with three fields, ALL IN ENGLISH:',
    withStyleHint(
      '  - "setting": DELTA ONLY - Scene-specific additions IN ENGLISH. Describe ONLY what is NEW, CHANGED, or TRANSIENT in this scene compared to the base environment description: temporary objects (mugs on table, books open, toys on floor), scene-specific state (door open/closed, curtains drawn/open), items being actively used, lighting changes (candles lit, lamps on/off), weather effects (rain outside, fog). DO NOT repeat base structure (walls, permanent furniture, fixed layout) - that comes from environment.description. Write as standalone additions. If minimal changes, describe time-of-day atmosphere or specific focus. Write IN ENGLISH.',
      styleGuidance?.setting
    ),
    withStyleHint(
      '  - "cameraComposition": An OBJECT with two fields:',
      styleGuidance?.composition
    ),
    '    - "shot": Camera angle (wide/medium/close-up), eye level, focal point. IN ENGLISH.',
    '    - "characters": Array of objects — one entry per character physically present in the scene. Maximum 3 characters. Each entry has:',
    '      - "name": EXACT character name from the story character list',
    '      - "description": Position in frame (foreground/background, left/right/center, on what object), body posture, action (sitting, flying, running, hugging, sleeping, eating), facial expression, gaze direction. IN ENGLISH.',
    withStyleHint(
      '  - "lighting": Light source, direction, intensity, shadow style, color temperature, atmosphere.',
      styleGuidance?.lighting
    ),
    '- Each field MUST be in English for image generation',
    '- cameraComposition.characters is the SINGLE SOURCE OF TRUTH for which characters are drawn in the scene illustration',
    '- The base environment structure comes from environment.description - sceneVisual.setting should only add scene-specific deltas.',
    '- Example good setting delta: "Two books and telescope on coffee table. Windows show morning stars. Dad holding glowing seed in open palm."',
    '- Example bad setting: "A cozy circular living room with panoramic windows..." (this duplicates base environment - only write what\'s new)',
    '- Example good cameraComposition: { "shot": "Medium-wide shot at child eye-level", "characters": [{ "name": "Emilia", "description": "foreground center at workbench, sitting, examining a blueprint with magnifying glass, focused expression" }, { "name": "Rabbit", "description": "right side perched on workbench edge, ears perked up, looking curiously at Emilia" }] }',
    '- Example bad cameraComposition: "Characters in a workshop" (too vague, not structured, no per-character entries)',
    '',
    'CRITICAL - characterOutfits (scene-appropriate attire):',
    '- "characterOutfits" is an object mapping each character from cameraComposition.characters to their attire description for THIS scene.',
    '- characterOutfits is MANDATORY - you must describe outfit for each character present in the scene',
    '- Match character names EXACTLY as they appear in cameraComposition.characters array',
    '- Outfit descriptions help maintain visual consistency and scene appropriateness',
    '- Describe attire appropriate to the scene location and activity.',
    '- Adapt outfits to the scene context — indoor scenes may use casual/comfortable attire instead of outdoor wear.',
    '- For animals or creatures without attire, use "natural appearance".',
    '- Example: { "Emilia": "cozy sweater, leggings", "Binbon": "natural appearance" }',
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
 * Max 3 active characters per scene constraint.
 */
export function formatCharactersPerSceneRules(): string {
  return [
    'CRITICAL - Characters Per Scene (max 3 active):',
    '- Each scene should have AT MOST 3 characters physically present and actively participating in the action.',
    '- If the story has more than 3 characters, rotate them: some characters go to another room, leave on an errand, stay behind, or arrive later. Write the plot so that each scene naturally focuses on 1-3 characters.',
    '- The protagonist (main child character) should be in almost every scene.',
    '- Other characters can be briefly MENTIONED (heard from another room, just left, remembered in dialogue) but should NOT be described as physically present and performing actions in the scene.',
    '- "cameraComposition.characters": list ONLY the characters who are physically present and actively participating in the scene (same characters who perform actions in the text). Maximum 3.',
    '- Use EXACT character names as defined in the story',
    '- If scene has no characters (e.g., pure description), use an empty array for cameraComposition.characters',
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
    '- Think of it as: text = the full story of the scene, sceneVisual = a single illustration capturing the key moment of that text.',
  ].join('\n');
}

/**
 * ElevenLabs v3 audio tags rules — full version with format rules, examples, and safety.
 */
export function formatAudioTagsRules(): string {
  return [
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
    '- Use 2-3 tags per scene maximum for natural flow',
    '',
    'Examples:',
    '- \'[excited] Look at that beautiful sunset!\'',
    '- \'She opened the door slowly. [exhales sharply] The room was filled with treasure!\'',
    '- \'[laughing] This is so much fun! [excited] Let\\\'s try again!\'',
    '',
    'SAFETY: Only use child-appropriate audio tags from approved list above. Avoid scary sounds ([gunshot], [explosion]), aggressive emotions. Prefer gentle, playful tags like [chuckles], [laughing], [excited], [whisper], [curious].',
    '',
    'Use tags naturally to enhance storytelling emotion without overusing them.',
  ].join('\n');
}

/**
 * Scene text boundary rules — sentences must not split across scenes.
 */
export function formatSceneTextBoundaryRules(): string {
  return [
    'CRITICAL - Scene Text Boundaries:',
    '- Each scene\'s "text" MUST end at a complete sentence boundary (period, exclamation mark, or question mark followed by any closing quotes)',
    '- NEVER split a sentence across two scenes — every sentence must belong entirely to one scene',
    '- Do NOT start a new sentence at the end of a scene that continues in the next scene',
  ].join('\n');
}

/**
 * Art style visual guidance for text generation.
 * Tells the text model how to describe settings/characters for the chosen image style,
 * so sceneVisual is style-aware (e.g. "clay walls" for clay, not generic "painted walls").
 */
/**
 * Composite function: all shared visual story rules in one call.
 * Used by TextPrompt, DirectTextPrompt, and ContinuationPrompt.
 */
export function formatVisualStoryRules(opts?: { imageStyle?: string | null }): string {
  const parts = [
    formatEnvironmentRules(),
    formatSceneVisualRules({ imageStyle: opts?.imageStyle }),
    formatCharactersPerSceneRules(),
    formatTextVisualConsistencyRules(),
    formatAudioTagsRules(),
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
  const trimmedLines = lines.map(line => line.trimEnd());
  
  // Remove leading empty lines
  while (trimmedLines.length > 0 && trimmedLines[0] === '') {
    trimmedLines.shift();
  }
  
  // Remove trailing empty lines
  while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1] === '') {
    trimmedLines.pop();
  }

  return trimmedLines.join('\n');
}
