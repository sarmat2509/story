/**
 * Text Generation Prompt Builder
 * Generates prompts for full story text generation based on outline
 */

import * as helpers from '../helpers';
import type { StorySpec, EpisodeOutline } from '../../ai/types';

export interface TextPromptParams {
  spec: StorySpec;
  outline: EpisodeOutline;
  vocabLevel: string; // simple, basic, intermediate, advanced
}

/**
 * Build text generation prompt
 * 
 * Takes an outline and generates complete text for each scene,
 * following readability guidelines, vocabulary levels, and safety policies.
 */
export function buildTextPrompt(params: TextPromptParams): string {
  const { spec, outline, vocabLevel } = params;
  
  return helpers.cleanTemplate`
You are writing the full text of a children's bedtime story based on this outline.

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

OUTLINE:
${JSON.stringify(outline, null, 2)}

WRITING REQUIREMENTS:
- Age group: ${spec.ageGroup}
- Vocabulary level: ${vocabLevel}
${helpers.formatReadabilityRequirements(spec.policyProfile)}

${helpers.formatSafetyPolicy(spec.policyProfile)}

${helpers.formatWritingStyle(spec, vocabLevel)}

OUTPUT FORMAT (JSON):
{
  "title": "${outline.title}",
  "language": "${spec.language}",
  "scenes": [
    {
      "sceneId": 1,
      "text": "Full text for scene 1 (multiple paragraphs OK)...",
      "visualPrompt": "Enhanced visual description based on the actual text written. Be specific about character actions, expressions, setting details visible in this scene. This will be used for image generation."
    }
  ],
  "fullText": "Complete story with all scenes concatenated for easy reading...",
  "wordCount": 1234
}

IMPORTANT - Scene Structure:
- Write complete, standalone text for EACH scene
- Each scene should be 1-3 paragraphs depending on age
- Visual prompts should be enhanced versions of outline prompts, reflecting actual story details
- fullText should concatenate all scene texts with proper spacing
`;
}
