/**
 * Regeneration Prompt Builder
 * Generates prompts for selective scene text regeneration based on validation feedback.
 * Input: scene text + violation. Output: plain text only. No outline, no sceneVisual.
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';
import { getLanguageFullDisplay } from '@wondertales/shared';

export interface BatchRegenerationPromptParams {
  spec: StorySpec;
  sceneCount: number;
  failedScenes: Array<{
    sceneId: number;
    originalText: string;
    feedback: string;
  }>;
  vocabLevel: string;
}

/**
 * Build batch regeneration prompt - fix ALL failed scenes in one request.
 * Returns JSON with all corrected scenes.
 */
export function buildBatchRegenerationPrompt(params: BatchRegenerationPromptParams): string {
  const { spec, sceneCount, failedScenes, vocabLevel } = params;
  const totalScenes = sceneCount;
  const minWords = Math.floor(spec.policyProfile.readability.targetWordsRange[0] / totalScenes);
  const maxWords = Math.ceil(spec.policyProfile.readability.targetWordsRange[1] / totalScenes);
  const { textPromptSection } = getContentPolicy({
    policyProfile: spec.policyProfile,
    scenarioCardId: spec.scenarioCard?.id,
  });

  const scenesBlock = failedScenes
    .map(
      (f) => `--- SCENE ${f.sceneId} ---
VALIDATION FEEDBACK (ISSUES TO FIX):
${f.feedback}

ORIGINAL TEXT:
${f.originalText}`
    )
    .join('\n\n');

  return `Fix policy violations in ALL scenes below. Fix ONLY what the validation flags. Keep plot, characters, location, events unchanged. The illustration will NOT change — your text must describe the same scene.

LANGUAGE: Write entirely in ${getLanguageFullDisplay(spec.language as any)}.

SCENES TO FIX:
${scenesBlock}

${textPromptSection}

REQUIREMENTS:
- Age group: ${spec.ageGroup}
- Vocabulary level: ${vocabLevel}
- Target word count per scene: ${minWords}-${maxWords} words

${helpers.formatChildProfile(spec)}

${helpers.formatSceneLevelRules({ ageGroup: spec.ageGroup })}

RETURN JSON with ALL corrected scenes in the same order:
{
  "scenes": [
    { "sceneId": <number>, "text": "<regenerated scene text>" }
  ]
}

- Include exactly ${failedScenes.length} entries, one per scene above.
- sceneId must match the scene number. text = regenerated scene text only.`;
}
