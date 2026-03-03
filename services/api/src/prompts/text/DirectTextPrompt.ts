/**
 * Direct Text Generation Prompt (without outline)
 * Generates complete story text directly, including scene structure
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';

export interface DirectTextPromptParams {
  spec: StorySpec;
  sceneCount: number;
  vocabLevel: string;
}

/**
 * Build direct text generation prompt
 * Skips outline generation and creates full story in one step
 */
export function buildDirectTextPrompt(params: DirectTextPromptParams): string {
  const { spec, sceneCount, vocabLevel } = params;
  
  return helpers.cleanTemplate`
You are a creative storyteller specializing in children's content with audio narration.
Generate a complete story directly with all scenes, text, and visual descriptions.

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

${helpers.formatChildProfile(spec)}

${helpers.formatSupportingCharacters(spec)}

STORY REQUIREMENTS:
${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${getContentPolicy({ policyProfile: spec.policyProfile, scenarioCardId: spec.scenarioCard?.id }).textPromptSection}

${helpers.formatWritingStyle(spec, vocabLevel)}

OUTPUT FORMAT (JSON):
{
  "title": "Story title in ${spec.language}",
  "language": "${spec.language}",
  "environments": [
    {
      "id": "short_id",
      "name": "Human-readable location name"
    }
  ],
  "characters": [
    {
      "name": "Character name",
      "type": "human | animal | creature | object",
      "description": "Detailed visual appearance: size, colors, distinctive features, clothing/accessories. Be specific and consistent.",
      "role": "protagonist | sidekick | mentor | helper | guide | friend",
      "personality": "Key personality traits"
    }
  ],
  "moral": "The moral/lesson of the story",
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
      },
      "characterOutfits": { "Character Name 1": "scene-appropriate outfit description" }
    }
  ]
}

${helpers.formatVisualStoryRules({ imageStyle: spec.imageStyle, scenarioCardId: spec.scenarioCard?.id, policyProfile: spec.policyProfile })}

IMPORTANT - Character Descriptions:
- Return ALL characters you create in the story (do NOT include user-provided characters from SUPPORTING CHARACTERS section above)
- If no new characters are created (story only uses user-provided characters), return empty array []
- Provide DETAILED visual descriptions (appearance, colors, size, distinctive features, clothing)
- Be SPECIFIC and CONSISTENT - describe exactly how the character looks for image generation
- Example good description: "Small fluffy creature with purple fur, large golden eyes, translucent butterfly wings with star patterns, wears a tiny silver crown"
- Example bad description: "Cute helper" (too vague, will generate inconsistent images)
- These descriptions will be used for image generation to maintain character consistency across all scenes

IMPORTANT:
- Write exactly ${sceneCount} scenes total
- Each scene should be 1-3 paragraphs depending on age group
- Focus on positive, empowering storytelling
- Happy, safe ending required
`;
}
