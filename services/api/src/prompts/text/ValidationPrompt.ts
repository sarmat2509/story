/**
 * Validation Prompt Builder
 * Generates prompts for scene-by-scene content safety validation
 */

import type { EpisodeText, PolicyProfile } from '../../ai/types';
import { getContentPolicy } from '../contentPolicy';

export interface BatchValidationPromptParams {
  scenes: EpisodeText['scenes'];
  policy: PolicyProfile;
  scenarioCardId?: string;
}

/**
 * Build batch validation prompt - validate ALL scenes in one request.
 * Returns only failed scenes (minimal info) to save tokens.
 */
export function buildBatchValidationPrompt(params: BatchValidationPromptParams): string {
  const { scenes, policy, scenarioCardId } = params;
  const { validationRules } = getContentPolicy({
    policyProfile: policy,
    scenarioCardId,
  });

  const scenesBlock = scenes
    .map((scene, idx) => {
      const isLastScene = idx === scenes.length - 1;
      const sceneVisual = (scene as any).sceneVisual;
      const cameraPart =
        sceneVisual?.cameraComposition && typeof sceneVisual.cameraComposition === 'object'
          ? `\nCAMERA COMPOSITION:\n${JSON.stringify(sceneVisual.cameraComposition, null, 2)}`
          : '';
      return `--- SCENE ${scene.sceneId} (isLastScene: ${isLastScene}) ---
TEXT:
${scene.text}
${cameraPart}`;
    })
    .join('\n\n');

  return `Validate ALL scenes of this children's story for age-appropriateness.
Return JSON ONLY for scenes that FAIL validation. Scenes that pass need NO entry.

AGE GROUP: ${policy.ageGroup}
TOTAL SCENES: ${scenes.length}

SCENES:
${scenesBlock}

VALIDATION RULES:
${validationRules}
- Last scene (sceneId ${scenes.length > 0 ? scenes[scenes.length - 1].sceneId : '?'}) MUST end positively with hope and resolution.
- Other scenes should progress the story appropriately.

CAMERA COMPOSITION CHECK (when present):
- cameraComposition.characters MUST list ALL characters physically present in the scene.
- If scene text describes someone present but they are NOT in cameraComposition.characters, provide correctedCameraComposition.

RETURN JSON (only failed scenes; empty array if all pass):
{
  "failedScenes": [
    {
      "sceneId": <number>,
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
  ]
}

- Include ONLY scenes that failed. Omit scenes that pass.
- correctedCameraComposition: ONLY when cameraComposition has issues. Use EXACT character names.
- Be fair. Only flag real safety issues.`;
}
