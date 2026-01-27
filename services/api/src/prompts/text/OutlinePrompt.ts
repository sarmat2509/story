/**
 * Outline Prompt Builder
 * Generates prompts for story outline/structure generation
 */

import * as helpers from '../helpers';
import type { StorySpec } from '../../ai/types';

export interface OutlinePromptParams {
  spec: StorySpec;
  sceneCount: number;
}

/**
 * Build outline generation prompt
 * 
 * Outline includes:
 * - Story title and moral
 * - Scene-by-scene structure (setting, goal, emotion, beats)
 * - Visual prompts for future image generation
 */
export function buildOutlinePrompt(params: OutlinePromptParams): string {
  const { spec, sceneCount } = params;
  
  return helpers.cleanTemplate`
You are a professional children's story writer creating a bedtime story.

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

CHILD PROFILE:
${helpers.formatChildProfile(spec)}

STORY REQUIREMENTS:
${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatSafetyPolicy(spec.policyProfile)}

OUTPUT FORMAT (JSON):
{
  "title": "Story title in ${spec.language}",
  "language": "${spec.language}",
  "moral": "The moral/lesson",
  "scenes": [
    {
      "sceneId": 1,
      "setting": "Where this happens",
      "goal": "What should happen in this scene",
      "emotion": "Primary emotion (calm/happy/curious/concerned)",
      "beats": ["beat 1", "beat 2", "beat 3"],
      "visualPrompt": "VISUAL DESCRIPTION for image generation: Describe the scene visually - setting details, character positions/actions, lighting/mood, colors. Focus on what would appear in an illustration. Age-appropriate, safe, positive imagery only."
    }
  ],
  "safetyNotes": ["Any safety considerations"]
}

IMPORTANT - Visual Prompts:
- Each scene needs a clear visual description for future illustration
- Describe: setting elements, character appearances/poses, lighting, colors, mood
- Keep visual style appropriate for age group
- Ensure visual prompts follow all safety guidelines (no scary imagery, violence, etc.)
- Example good visual prompt: "Cozy bedroom at twilight. ${spec.childName} (age ${spec.ageGroup}) sits on bed with stuffed bunny, warm lamp glow, stars visible through window. Peaceful, safe atmosphere."
`;
}
