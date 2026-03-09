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
import { getContentPolicy } from './contentPolicy';

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
 * Format user characters with IDs for Director prompt (same format as main flow)
 * Used so Director can output "Name [ID: uuid]" for reliable matching.
 */
export function formatUserCharactersWithIds(characters: Array<{ id?: string; name: string }>): string {
  if (!characters?.length) return '';
  return characters
    .map((c) => (c.id ? `${c.name} [ID: ${c.id}]` : c.name))
    .join(', ');
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
// Core Story Rules — PLOT structure, PACING, HOOKS, VOCAB.
// Used by DirectTextPrompt, ContinuationPrompt. Scene-level only for RegenerationPrompt.
// ─────────────────────────────────────────────────────────────────────────────

const YOUNG_AGE_GROUPS = ['0-1', '1y', '2-3'];

/**
 * Format core story rules (PLOT, PACING, HOOKS, VOCAB) for full story generation.
 * Formulas: MissionScene = min(2, ceil(N*0.25)), RuleScene = ceil(N*0.45),
 * ClimaxScene = ceil(N*0.85), ResolutionScene = N.
 */
export function formatCoreStoryRules(params: {
  sceneCount: number;
  ageGroup: string;
  hasWorldRule?: boolean;
  worldRuleText?: string;
}): string {
  const { sceneCount, ageGroup, hasWorldRule = false, worldRuleText } = params;
  const isYoung = YOUNG_AGE_GROUPS.includes(ageGroup);
  const sections: string[] = [];

  // PLOT structure (formulas) — skip for young ages
  if (!isYoung && sceneCount > 0) {
    const N = sceneCount;
    const missionScene = Math.min(2, Math.ceil(N * 0.25));
    const ruleScene = Math.ceil(N * 0.45);
    const climaxScene = Math.ceil(N * 0.85);
    const resolutionScene = N;

    let plotText = `PLOT STRUCTURE:
- By end of Scene ${missionScene}: state 1-sentence mission.
- Scenes ${missionScene + 1}–${climaxScene - 1}: 2–3 escalating obstacles.`;

    if (hasWorldRule && worldRuleText) {
      plotText += `\n- In Scene ${ruleScene}: introduce the world rule.`;
    }

    plotText += `
- Scene ${climaxScene}: decisive brave action solves main problem.
- Scene ${resolutionScene}: happy return + small tangible token + tiny sequel hint.`;

    sections.push(plotText);

    if (hasWorldRule && worldRuleText) {
      sections.push(`WORLD RULE: ${worldRuleText}\nIntroduce this rule in Scene ${ruleScene}.`);
    }
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
- End every scene with a micro-hook (question / new clue / small twist). No scene ends flat.`);
  }

  // VOCAB — for 4-5 and above
  if (!isYoung) {
    sections.push(`VOCAB:
- Challenging words (per age requirements): each immediately clarified by context or dialogue.
- Avoid rare/archaic words unless explained.`);
  }

  return 'CORE STORY RULES:\n' + sections.join('\n\n');
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
- Challenging words: clarify by context or dialogue. Avoid rare/archaic unless explained.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared visual story rules — used by TextPrompt, DirectTextPrompt,
// ContinuationPrompt (via composite), and RegenerationPrompt (individual).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mandatory characterOutfits instruction — short, prominent, impossible to miss.
 * Call this right before OUTPUT FORMAT so LLM sees it last before generating.
 */
export function formatCharacterOutfitsMandatory(): string {
  return [
    'CHARACTER OUTFITS — MANDATORY:',
    'Every environment MUST have "characterOutfits" as a NON-EMPTY string.',
    'Format: "Char1: outfit1. Char2: outfit2." — one entry per character who appears in that location.',
    'Outfit must be DETAILED and CONTEXT-APPROPRIATE for the location:',
    '  - Type of clothing: dress, pajamas, overalls, swimsuit, spacesuit, raincoat, etc.',
    '  - Colors: "yellow pajamas", "bright blue overalls", "orange t-shirt"',
    '  - Details: collar, buttons, pockets, patterns (stars, stripes), accessories (hat, scarf, belt)',
    '  - Match the environment: beach → swimsuit/trunks; space → spacesuit/helmet; winter forest → warm coat, hat, mittens; bedroom → pajamas; kitchen → apron; underwater → diving suit.',
    'Example: "Emilia: yellow pajamas with star patterns, white collar, bare feet. Mochovyk: natural appearance"',
    'Example (beach): "Max: red swim trunks, no shirt"',
    'Example (space): "Luna: white spacesuit with blue stripes, transparent helmet"',
    'Animals/creatures: use "natural appearance".',
    'NEVER return empty string — always list all characters who appear in that location.',
  ].join('\n');
}

/**
 * Environment definition rules with good/bad examples.
 */
export function formatEnvironmentRules(): string {
  return [
    'CRITICAL - Environments (Base Descriptions):',
    '- Define environments LAST, after scenes. One entry per unique environmentId used in scenes.',
    '- Each environment has FOUR fields (all required):',
    '  - "id": Short identifier (e.g. "bedroom", "forest_clearing")',
    '  - "name": Human-readable name',
    '  - "description": BASE visual description IN ENGLISH of the fixed, permanent elements:',
    '    * Room structure: layout, shape, dimensions',
    '    * Permanent furniture: beds, tables, shelves, cabinets',
    '    * Fixed features: walls, floor, ceiling, windows, doors',
    '    * Key permanent objects: decorations, fixtures, large items',
    '    * Materials and colors of permanent elements',
    '    * SPATIAL LAYOUT: describe where key objects are (left/center/right, foreground/background) AND their positions relative to each other (path beside the tree, house behind the bushes, bushes to the left of the path). This layout is reused for ALL scenes in this environment.',
    '    * Include ALL static objects that appear in the story: flower, tree, rock, bench — everything that has a fixed place. If the story mentions a flower, it must be in environment.description with its position. No static object may appear "new" in sceneVisual — it must already be in the environment. Scene delta can only describe state changes (flower bloomed, tree lit up), not new objects.',
    '  - "characterOutfits": REQUIRED string. Format "Char1: outfit1. Char2: outfit2." — EVERY character who appears in ANY scene in this environment. DETAILED outfit IN ENGLISH. Must match the environment (beach→swimsuit, space→spacesuit, winter→coat+hat, bedroom→pajamas). For animals/creatures: "natural appearance". NEVER omit or return empty string.',
    '- Base description should work for ALL scenes in this location',
    '- STORY-CRITICAL STATIC OBJECTS (tree, building, monument, rock, path, bushes, flower, bench) MUST be in environment.description with fixed position. For each: position in frame (left/center/right, foreground/background) AND position relative to other objects ("tree to the left of path", "path leads from foreground to tree", "bushes along left side of path", "house behind trees").',
    '- NO NEW STATIC OBJECTS IN SCENE: If an object appears in the story (flower, tree, rock), it is ALWAYS in environment. In scene delta — only state changes (flower bloomed, tree lit up, leaves rustling), never new objects or new positions. The object must be on the environment image.',
    '- DO NOT include temporary/transient elements (those go in sceneVisual.setting)',
    '- Example characterOutfits (bedroom): "Zoryana: yellow pajamas with star patterns, white collar. Flash: natural appearance"',
    '- Example characterOutfits (beach): "Emilia: turquoise one-piece swimsuit, sun hat"',
    '- Example characterOutfits (space): "Cosmo: white spacesuit with blue stripes, transparent helmet"',
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
const SPATIAL_POSITION_RULE = 'Position near furniture: use beside, next to, behind, in front of — avoid "at" when standing (read as "on").';

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
        '- "setting": DELTA ONLY - Scene-specific additions IN ENGLISH. Describe ONLY what is NEW, CHANGED, or TRANSIENT in this scene compared to the base environment description: temporary objects (mugs on table, books open, toys on floor), scene-specific state (door open/closed, curtains drawn/open), items being actively used, lighting changes (candles lit, lamps on/off), weather effects (rain outside, fog). DO NOT repeat base structure (walls, permanent furniture, fixed layout) - that comes from environment.description. Write as standalone additions. STANDALONE: never use "the same X", "as before"; if location unchanged, repeat key visual elements. Write IN ENGLISH.',
        styleGuidance?.setting
      ),
      withStyleHint(
        '- "cameraComposition": An OBJECT with two fields:',
        styleGuidance?.composition
      ),
      '  - "shot": Camera angle and shot type IN ENGLISH (e.g. "Medium-wide shot at child eye-level").',
      `  - "characters": Array of objects, one per character. Each has "name" (EXACT from character list) and "description" (position in frame, posture, action, expression IN ENGLISH. Use positions relative to static objects from environment: "beside the tree", "on the path"). ${SPATIAL_POSITION_RULE} Maximum 3 characters.`,
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
      '  - "setting": DELTA ONLY - Scene-specific additions IN ENGLISH. Describe ONLY what is NEW, CHANGED, or TRANSIENT in this scene compared to the base environment description: temporary objects (mugs on table, books open, toys on floor), scene-specific state (door open/closed, curtains drawn/open), items being actively used, lighting changes (candles lit, lamps on/off), weather effects (rain outside, fog). DO NOT repeat base structure (walls, permanent furniture, fixed layout) - that comes from environment.description. Write as standalone additions. If minimal changes, describe time-of-day atmosphere or specific focus. Write IN ENGLISH.',
      styleGuidance?.setting
    ),
    '    - STANDALONE: NEVER use "the same X", "as before", "continuing from previous scene". If the location is unchanged, REPEAT the key visual elements (describe the nook, foliage, objects) — do not reference other scenes.',
    withStyleHint(
      '  - "cameraComposition": An OBJECT with two fields:',
      styleGuidance?.composition
    ),
    '    - "shot": Camera angle (wide/medium/close-up), eye level, focal point. IN ENGLISH.',
    '    - "characters": Array of objects — one entry per character physically present in the scene. Maximum 3 characters. Each entry has:',
    '      - "name": EXACT character name from the story character list',
    `      - "description": Position in frame (foreground/background, left/right/center), body posture, action, facial expression, gaze direction. Use positions relative to static objects from environment (e.g. "beside the tree", "on the path"). ${SPATIAL_POSITION_RULE} IN ENGLISH.`,
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
    '- Example good cameraComposition: { "shot": "Medium-wide shot at child eye-level", "characters": [{ "name": "Emilia", "description": "foreground center beside workbench, sitting, examining a blueprint with magnifying glass, focused expression" }, { "name": "Rabbit", "description": "right side perched on workbench edge, ears perked up, looking curiously at Emilia" }] }',
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
    '- sceneVisual.setting must be SELF-CONTAINED — never use "the same X" or reference other scenes.',
    '- INTERNAL CONSISTENCY: setting, cameraComposition.shot, cameraComposition.characters, and lighting must ALL describe the SAME location and moment. If shot says "inside the car", setting must describe the car interior — never mix locations. Before outputting, verify: could a single photograph capture everything described?',
    '- Think of it as: text = the full story of the scene, sceneVisual = a single illustration capturing the key moment of that text.',
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
 * Uses getContentPolicy for audio tags when policyProfile provided.
 */
export function formatVisualStoryRules(opts?: {
  imageStyle?: string | null;
  scenarioCardId?: string;
  policyProfile?: PolicyProfile;
}): string {
  const policyProfile = opts?.policyProfile ?? {
    ageGroup: '6-8',
    language: 'en',
    disallowedRules: [],
    fearLevelMax: 2,
    allowedConflicts: [],
    constraints: { mustHaveHappyEnding: true, noShamingLanguage: true },
    readability: { maxSentenceLen: 18, targetWordsRange: [500, 800], dialogRatio: 0.5 },
    promptGuidelines: '',
  };
  const audioTagsRules = getContentPolicy({
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
