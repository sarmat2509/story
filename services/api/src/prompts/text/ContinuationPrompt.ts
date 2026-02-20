/**
 * Continuation Prompt Builder
 * Generates prompts for story continuation/series generation
 */

import * as helpers from '../helpers';
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
${validRequiredChars.length > 0 ? '- MUST feature all REQUIRED characters from above\n' : ''}
${validOptionalChars.length > 0 ? '- MAY feature OPTIONAL characters if they fit the story (not required)\n' : ''}
- Create NEW events and challenges (not covered in previous episodes)
- Build on previous story but make this episode standalone enjoyable
- Introduce new secondary characters if needed (return them in "characters" output)
${validUsedPlots.length > 0 ? `- DO NOT repeat these plot elements: ${validUsedPlots.join(', ')}\n` : ''}
- Maintain the same tone and age-appropriateness
- MUST have a satisfying conclusion for this episode
- OPTIONAL: Add a gentle cliffhanger or hint for next episode

${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${helpers.formatWritingStyle(spec, vocabLevel)}

OUTPUT FORMAT: Same as DirectTextPrompt (JSON with title, environments, characters, moral, scenes)

${helpers.formatVisualStoryRules({ imageStyle: spec.imageStyle })}

IMPORTANT - Character Descriptions:
- Return ALL new characters you create in the story in "characters" array
${validRequiredChars.length > 0 || validOptionalChars.length > 0 
  ? '- Do NOT include required/optional characters from above in output\n' 
  : ''}
- Provide DETAILED visual descriptions (appearance, colors, size, distinctive features, clothing)
- Be SPECIFIC and CONSISTENT for image generation

TITLE FORMAT: "${spec.childName ? `Пригоди ${spec.childName}` : 'Казка'} - Частина ${partNumber}"
`;
}
