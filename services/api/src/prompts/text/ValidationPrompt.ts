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
 * Validates a single scene for:
 * - Content safety policy compliance
 * - Age-appropriateness
 * - Fear level
 * - Emotional tone
 * - Happy ending (for last scene)
 */
export function buildValidationPrompt(params: ValidationPromptParams): string {
  const { sceneOutline, sceneText, policy, isLastScene } = params;
  
  return `You are a content safety validator for children's stories.

ROLE: Analyze ONE scene for safety and age-appropriateness. Be thorough but fair.

AGE GROUP: ${policy.ageGroup}
LANGUAGE: ${sceneText.text.substring(0, 50)}... (detect from text)
IS LAST SCENE: ${isLastScene}

SCENE OUTLINE:
${JSON.stringify(sceneOutline, null, 2)}

SCENE TEXT:
${JSON.stringify(sceneText, null, 2)}

VALIDATION CRITERIA:
1. CONTENT POLICY: ${policy.promptGuidelines}
2. AGE-APPROPRIATE: Vocabulary, sentence complexity, themes must match ${policy.ageGroup}
3. FEAR LEVEL: Emotion should match outline. No excessive fear for this age group.
4. ${isLastScene 
    ? 'HAPPY ENDING: Last scene MUST end positively with hope and emotional resolution. Check the final sentences carefully.' 
    : 'EMOTIONAL PROGRESSION: Scene emotion should build the story arc appropriately.'}

RETURN JSON:
{
  "sceneId": ${sceneText.sceneId},
  "isValid": true/false,
  "violations": [
    {
      "category": "content_policy" | "age_inappropriate" | "fear_level" | "emotional_tone" | "vocabulary",
      "severity": "critical" | "high" | "medium",
      "message": "Clear explanation of the issue",
      "suggestion": "How to fix it (optional)"
    }
  ]
}

IMPORTANT:
- Only flag REAL violations, not minor stylistic issues
- Be especially careful with last scene - happy ending is critical
- Consider the full context of the scene, not isolated sentences
- "isValid": false only if there are violations
- Empty violations array means the scene is valid`;
}
