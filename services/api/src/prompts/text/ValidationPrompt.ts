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

  const sceneVisual = (sceneText as any).sceneVisual;
  const cameraCompositionSection =
    sceneVisual?.cameraComposition && typeof sceneVisual.cameraComposition === 'object'
      ? `
CAMERA COMPOSITION (for illustration):
${JSON.stringify(sceneVisual.cameraComposition, null, 2)}

CAMERA COMPOSITION CHECK:
- cameraComposition.characters MUST list ALL characters/creatures/objects physically present and visible in the scene (performing actions, being looked at, in frame).
- If the scene text describes someone/something as physically present (e.g. "Софія peered at the robot", "a robot lay behind the chest") but they are NOT in cameraComposition.characters, you MUST provide correctedCameraComposition.
- correctedCameraComposition: add missing characters, remove extras, fix descriptions. Use EXACT character names from the story.`
      : '';

  return `Validate this children's story scene for age-appropriateness.

AGE GROUP: ${policy.ageGroup}
IS LAST SCENE: ${isLastScene}

SCENE TEXT:
${sceneText.text}
${cameraCompositionSection}

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
      "category": "content_policy" | "age_inappropriate" | "emotional_tone" | "camera_composition_incomplete",
      "severity": "critical" | "high" | "medium",
      "message": "Clear explanation",
      "suggestion": "How to fix (optional)"
    }
  ],
  "correctedCameraComposition": null or { "shot": "...", "characters": [{ "name": "...", "description": "..." }] }
}

- correctedCameraComposition: ONLY when cameraComposition has issues — provide the full corrected object (shot + characters). Omit or set to null if cameraComposition is already correct.
- Use EXACT character names from the story in correctedCameraComposition.characters.

IMPORTANT: Be fair. Only flag real safety issues, not minor style choices.`;
}
