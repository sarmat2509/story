/**
 * Text Generation Prompt Builder
 * Generates prompts for full story text generation based on outline
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
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
You are a creative storyteller specializing in children's content with audio narration support.
Generate expressive text with ElevenLabs v3 audio tags for natural, engaging spoken delivery.

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

OUTLINE:
${JSON.stringify(outline, null, 2)}

${helpers.formatSupportingCharacters(spec)}

WRITING REQUIREMENTS:
- Age group: ${spec.ageGroup}
- Vocabulary level: ${vocabLevel}

${helpers.formatAgeRequirements(spec.ageGroup)}

${getContentPolicy({ policyProfile: spec.policyProfile, scenarioCardId: spec.scenarioCard?.id }).textPromptSection}

${helpers.formatWritingStyle(spec, vocabLevel)}

${helpers.formatVisualStoryRules({ imageStyle: spec.imageStyle, scenarioCardId: spec.scenarioCard?.id, policyProfile: spec.policyProfile })}

OUTPUT FORMAT (JSON). Generate environments LAST — one entry per unique environmentId used in scenes. characterOutfits must list ALL characters who appear there — never empty string.
{
  "title": "${outline.title}",
  "language": "${spec.language}",
  "scenes": [
    {
      "sceneId": 1,
      "environmentId": "short_id",
      "text": "Full scene text (1-3 paragraphs) with embedded ElevenLabs v3 audio tags for expressive narration.",
      "sceneVisual": {
        "setting": "Complete physical setting for this scene IN ENGLISH: room layout, furniture, objects, wall decorations, floor material, materials, textures, colors, weather, time of day.",
        "cameraComposition": {
          "shot": "Medium shot at child eye-level, focal point on Character1",
          "characters": [
            { "name": "Character Name 1", "description": "foreground left on chair, sitting, smiling, looking at Character Name 2" },
            { "name": "Character Name 2", "description": "background right near window, standing, waving" }
          ]
        },
        "lighting": "Lighting conditions IN ENGLISH: warm golden sunlight from left window, soft shadows on floor."
      }
    }
  ],
  "environments": [
    {
      "id": "short_id",
      "name": "Human-readable location name",
      "description": "BASE visual description IN ENGLISH...",
      "characterOutfits": "ExactCharacterName: detailed outfit. CreatureName: natural appearance"
    }
  ]
}

IMPORTANT - Scene Structure:
- Write complete, standalone text for EACH scene with audio tags embedded
- Each scene should be 1-3 paragraphs depending on age
`;
}
