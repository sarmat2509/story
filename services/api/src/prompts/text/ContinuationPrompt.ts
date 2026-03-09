/**
 * Continuation Prompt Builder
 * Generates prompts for story continuation/series generation
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';

export interface ContinuationPromptParams {
  spec: StorySpec;
  sceneCount: number;
  vocabLevel: string;
  previousOutlines: Array<{
    title: string;
    moral: string;
    scenes: Array<{ setting: string; goal: string; }>;
  }>;
  requiredCharacters: Array<{
    name: string;
    type: string;
    description: string;
    role: string;
  }>;
  optionalCharacters: Array<{
    name: string;
    type: string;
    description: string;
    role: string;
  }>;
  usedPlots: string[]; // Anti-repetition: ["lost in forest", "found magic item"]
}

/**
 * Build continuation generation prompt
 * 
 * Provides LLM with:
 * - Previous episodes summary
 * - Required characters (user-provided, MUST use)
 * - Optional characters (LLM-generated, MAY use)
 * - Anti-repetition constraints
 */
export function buildContinuationPrompt(params: ContinuationPromptParams): string {
  const { spec, sceneCount, vocabLevel, previousOutlines, requiredCharacters, optionalCharacters, usedPlots } = params;
  
  const partNumber = previousOutlines.length + 1;
  
  // Filter out characters with undefined/empty descriptions
  const validRequiredChars = requiredCharacters.filter(char => 
    char.description && char.description !== 'undefined' && char.description.trim().length > 0
  );
  const validOptionalChars = optionalCharacters.filter(char => 
    char.description && char.description !== 'undefined' && char.description.trim().length > 0
  );
  
  // Filter out empty plot elements
  const validUsedPlots = usedPlots.filter(plot => plot && plot.trim().length > 0);
  
  // Build previous episodes section
  const previousEpisodesText = previousOutlines.map((outline, i) => {
    const hasMoral = outline.moral && outline.moral.trim().length > 0;
    const validScenes = outline.scenes
      .map(s => s.goal)
      .filter(goal => goal && goal.trim().length > 0);
    
    let episodeText = `Episode ${i + 1}: "${outline.title}"`;
    if (hasMoral) {
      episodeText += `\n- Moral: ${outline.moral}`;
    }
    if (validScenes.length > 0) {
      episodeText += `\n- Key Scenes: ${validScenes.join('; ')}`;
    }
    return episodeText;
  }).join('\n\n');
  
  return helpers.cleanTemplate`
You are continuing an ongoing story series for a child.

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

PREVIOUS EPISODES SUMMARY:
${previousEpisodesText}

${validRequiredChars.length > 0 ? `
REQUIRED CHARACTERS (MUST USE):
These are user-provided main characters that MUST appear in the story:
${validRequiredChars.map(char => `
- ${char.name} (${char.type}): ${char.description}
  Role: ${char.role}
`).join('\n')}
` : ''}

${validOptionalChars.length > 0 ? `
OPTIONAL CHARACTERS (MAY USE):
These are additional characters from previous episodes. You MAY feature them if relevant to the plot, but it is NOT required:
${validOptionalChars.map(char => `
- ${char.name} (${char.type}): ${char.description}
  Role: ${char.role}
`).join('\n')}
` : ''}

${helpers.formatChildProfile(spec)}

STORY CONTINUATION REQUIREMENTS:
- This is Part ${partNumber} of the series
- The story MUST connect to the previous episode. Reference events, characters, or outcomes from Part ${partNumber - 1}. Maintain narrative continuity while introducing a NEW world rule and NEW setting.
${validRequiredChars.length > 0 ? '- MUST feature all REQUIRED characters from above\n' : ''}
${validOptionalChars.length > 0 ? '- MAY feature OPTIONAL characters if they fit the story (not required)\n' : ''}
- Create NEW events and challenges (not covered in previous episodes)
- Build on previous story but make this episode standalone enjoyable
- Introduce new secondary characters if needed (return them in "characters" output)
${validUsedPlots.length > 0 ? `- DO NOT repeat these plot elements: ${validUsedPlots.join(', ')}\n` : ''}
- Maintain the same tone and age-appropriateness
- MUST have a satisfying conclusion for this episode
- OPTIONAL: Add a gentle cliffhanger or hint for next episode
- DO NOT repeat physical appearance of required/optional characters (from previous episodes). Use names and actions directly. Avoid "Emilia with her bright eyes...", "Flash, round and yellow...". Start with action.
- NEW characters: MUST describe their appearance when first introduced (for reader and image generation). Add to characters array with detailed description.

${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${helpers.formatWritingStyle(spec, vocabLevel)}

${helpers.formatCoreStoryRules({ sceneCount, ageGroup: spec.ageGroup, hasWorldRule: !!spec.worldRule, worldRuleText: spec.worldRule?.description })}

${helpers.formatVisualStoryRules({ imageStyle: spec.imageStyle, scenarioCardId: spec.scenarioCard?.id, policyProfile: spec.policyProfile })}

OUTPUT FORMAT: Same as DirectTextPrompt (JSON with title, language, characters, moral, scenes, environments). Generate environments LAST. Each environment MUST have characterOutfits as string "Char1: outfit1. Char2: outfit2." with all characters who appear there.

IMPORTANT - Character Descriptions:
- In scene TEXT: Do NOT re-describe required/optional characters. NEW characters — MUST describe appearance when first introduced.
- characters array: Include ONLY new characters. Provide DETAILED visual descriptions (appearance, colors, size, distinctive features, clothing) for each.
${validRequiredChars.length > 0 || validOptionalChars.length > 0 
  ? '- Do NOT include required/optional characters from above in output\n' 
  : ''}
- Be SPECIFIC and CONSISTENT for image generation

TITLE FORMAT: "${spec.childName ? `Пригоди ${spec.childName}` : 'Казка'} - Частина ${partNumber}"
`;
}

/**
 * Build continuation prompt in PLAIN TEXT format (Director flow)
 * Output: title, description, scenes separated by --- (no JSON)
 */
export function buildContinuationPromptPlain(params: ContinuationPromptParams): string {
  const { spec, sceneCount, vocabLevel, previousOutlines, requiredCharacters, optionalCharacters, usedPlots } = params;
  const partNumber = previousOutlines.length + 1;

  const validRequiredChars = requiredCharacters.filter(char =>
    char.description && char.description !== 'undefined' && char.description.trim().length > 0
  );
  const validOptionalChars = optionalCharacters.filter(char =>
    char.description && char.description !== 'undefined' && char.description.trim().length > 0
  );
  const validUsedPlots = usedPlots.filter(plot => plot && plot.trim().length > 0);

  const previousEpisodesText = previousOutlines.map((outline, i) => {
    const hasMoral = outline.moral && outline.moral.trim().length > 0;
    const validScenes = outline.scenes
      .map(s => s.goal)
      .filter(goal => goal && goal.trim().length > 0);

    let episodeText = `Episode ${i + 1}: "${outline.title}"`;
    if (hasMoral) {
      episodeText += `\n- Moral: ${outline.moral}`;
    }
    if (validScenes.length > 0) {
      episodeText += `\n- Key Scenes: ${validScenes.join('; ')}`;
    }
    return episodeText;
  }).join('\n\n');

  return helpers.cleanTemplate`
You are continuing an ongoing story series for a child.
Generate the continuation in PLAIN TEXT format (no JSON).

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

PREVIOUS EPISODES SUMMARY:
${previousEpisodesText}

${validRequiredChars.length > 0 ? `
REQUIRED CHARACTERS (MUST USE):
${validRequiredChars.map(char => `
- ${char.name} (${char.type}): ${char.description}
  Role: ${char.role}
`).join('\n')}
` : ''}

${validOptionalChars.length > 0 ? `
OPTIONAL CHARACTERS (MAY USE):
${validOptionalChars.map(char => `
- ${char.name} (${char.type}): ${char.description}
  Role: ${char.role}
`).join('\n')}
` : ''}

${helpers.formatChildProfile(spec)}

STORY CONTINUATION REQUIREMENTS:
- This is Part ${partNumber} of the series
- The story MUST connect to the previous episode
${validRequiredChars.length > 0 ? '- MUST feature all REQUIRED characters from above\n' : ''}
${validOptionalChars.length > 0 ? '- MAY feature OPTIONAL characters if they fit the story\n' : ''}
- Create NEW events and challenges
- Build on previous story but make this episode standalone enjoyable
${validUsedPlots.length > 0 ? `- DO NOT repeat these plot elements: ${validUsedPlots.join(', ')}\n` : ''}
- Maintain the same tone and age-appropriateness
- MUST have a satisfying conclusion for this episode
- DO NOT repeat physical appearance of required/optional characters (from previous episodes). Use names and actions directly. Avoid "Emilia with her bright eyes...", "Flash, round and yellow...". Start with action.
- NEW characters: MUST describe their appearance when first introduced (for reader and image generation).

${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${getContentPolicy({ policyProfile: spec.policyProfile, scenarioCardId: spec.scenarioCard?.id }).textPromptSection}

${helpers.formatWritingStyle(spec, vocabLevel)}

${helpers.formatCoreStoryRules({ sceneCount, ageGroup: spec.ageGroup, hasWorldRule: !!spec.worldRule, worldRuleText: spec.worldRule?.description })}

OUTPUT FORMAT (plain text only):
title: Story title in ${spec.language}

description: Short SEO description (1-2 sentences, max 160 characters).

---
Scene 1 text (1-3 paragraphs with ElevenLabs v3 audio tags)...
---
Scene 2 text...
---
(continue for all ${sceneCount} scenes)

RULES:
- Write exactly ${sceneCount} scenes, each separated by --- on its own line
- No JSON, no scene numbers in the text — only the --- delimiter between scenes
- Each scene: 1-3 paragraphs depending on age group
- TITLE FORMAT: "${spec.childName ? `Пригоди ${spec.childName}` : 'Казка'} - Частина ${partNumber}"
`;
}
