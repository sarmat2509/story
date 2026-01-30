/**
 * Validation Prompt Builder
 * Generates prompts for scene-by-scene content safety validation
 */

import type { EpisodeOutline, EpisodeText, PolicyProfile } from '../../ai/types';

export interface ValidationPromptParams {
  sceneOutline: EpisodeOutline['scenes'][0];
  sceneText: EpisodeText['scenes'][0];
  policy: PolicyProfile;
  isLastScene: boolean;
}

/**
 * Build scene validation prompt
 * 
 * IMPORTANT: Uses minimal prompt to avoid triggering AI safety filters
 * Only includes scene text and basic validation criteria
 */
export function buildValidationPrompt(params: ValidationPromptParams): string {
  const { sceneText, policy, isLastScene } = params;
  
  return `Validate this children's story scene for age-appropriateness.

AGE GROUP: ${policy.ageGroup}
IS LAST SCENE: ${isLastScene}

SCENE TEXT:
${sceneText.text}

VALIDATION RULES:
1. Content must be safe and age-appropriate for ${policy.ageGroup}
2. Language and themes must match age group
3. ${isLastScene 
    ? 'Last scene MUST end positively with hope and resolution' 
    : 'Scene should progress the story appropriately'}

RETURN JSON:
{
  "sceneId": ${sceneText.sceneId},
  "isValid": true/false,
  "violations": [
    {
      "category": "content_policy" | "age_inappropriate" | "emotional_tone",
      "severity": "critical" | "high" | "medium",
      "message": "Clear explanation",
      "suggestion": "How to fix (optional)"
    }
  ]
}

IMPORTANT: Be fair. Only flag real safety issues, not minor style choices.`;
}
