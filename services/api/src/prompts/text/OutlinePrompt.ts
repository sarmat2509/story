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

${helpers.formatSupportingCharacters(spec)}

STORY REQUIREMENTS:
${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${spec.scenarioCard?.id === 'scary_stories' ? helpers.formatScaryStoryRequirements(spec.ageGroup) : ''}

${helpers.formatSafetyPolicy(spec.policyProfile)}

OUTPUT FORMAT (JSON):
{
  "title": "Story title in ${spec.language}",
  "language": "${spec.language}",
  "moral": "The moral/lesson",
  "environments": [
    {
      "id": "short_id",
      "name": "Human-readable location name",
      "visualDescription": "Rich visual description of the location IN ENGLISH: layout, furniture, objects, colors, baseline lighting, atmosphere."
    }
  ],
  "scenes": [
    {
      "sceneId": 1,
      "setting": "Where this happens",
      "environmentId": "short_id",
      "goal": "What should happen in this scene",
      "emotion": "Primary emotion (calm/happy/curious/concerned)",
      "beats": ["beat 1", "beat 2", "beat 3"],
      "visualPrompt": "Action-focused description IN ENGLISH: character poses, expressions, interactions, transient changes. Do NOT describe the room/location here."
    }
  ],
  "safetyNotes": ["Any safety considerations"]
}

CRITICAL - Environments:
- Define ALL distinct physical locations in the story in "environments" array
- "visualDescription" MUST be in English: describe room layout, furniture, objects, colors, baseline lighting, atmosphere
- Be DETAILED and SPECIFIC - this is the only source of setting details for image generation
- Multiple scenes can share the same environmentId. Only create a new environment when the physical location changes.
- Example good visualDescription: "Cozy bedroom with a small wooden bed, nightstand with a glowing lamp, stuffed animals on a shelf, stars visible through a large window, soft warm lighting, pastel wallpaper with cloud patterns."

IMPORTANT - Visual Prompts:
- "visualPrompt" describes ONLY the ACTION: character poses, interactions, expressions, transient changes (weather, new objects)
- Do NOT repeat the room/location in visualPrompt — that comes from the environment
- Keep visual style appropriate for age group
- Ensure visual prompts follow all safety guidelines (no scary imagery, violence, etc.)
- Example good visual prompt: "${spec.childName || 'Child'} (age ${spec.ageGroup}) sits on the bed hugging a stuffed bunny, peaceful expression, warm lamp glow on their face."
`;
}
