/**
 * Validation Prompt Builder
 * Generates prompts for scene-by-scene content safety validation
 */

import type { EpisodeOutline, EpisodeText, PolicyProfile } from '../../ai/types';
import { getContentPolicy } from '../contentPolicy';

export interface ValidationPromptParams {
  sceneOutline: EpisodeOutline['scenes'][0];
  sceneText: EpisodeText['scenes'][0];
  policy: PolicyProfile;
  isLastScene: boolean;
  scenarioCardId?: string;
}

/**
 * Build scene validation prompt
 *
 * IMPORTANT: Uses minimal prompt to avoid triggering AI safety filters
 * Only includes scene text and basic validation criteria
 */
export function buildValidationPrompt(params: ValidationPromptParams): string {
  const { sceneText, policy, isLastScene } = params;
  const { validationRules } = getContentPolicy({
    policyProfile: policy,
    scenarioCardId: params.scenarioCardId,
  });

  return `Validate this children's story scene for age-appropriateness.

AGE GROUP: ${policy.ageGroup}
IS LAST SCENE: ${isLastScene}

SCENE TEXT:
${sceneText.text}

VALIDATION RULES:
${validationRules}
${isLastScene
    ? '4. Last scene MUST end positively with hope and resolution'
    : '4. Scene should progress the story appropriately'}

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
