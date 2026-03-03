/**
 * Regeneration Prompt Builder
 * Generates prompts for selective scene text regeneration based on validation feedback.
 * Input: scene text + violation. Output: plain text only. No outline, no sceneVisual.
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec, EpisodeOutline } from '../../ai/types';
import { getLanguageFullDisplay } from '@wondertales/shared';

export interface RegenerationPromptParams {
  spec: StorySpec;
  outline: EpisodeOutline;
  sceneId: number;
  originalSceneText: string;
  validationFeedback: string;
  vocabLevel: string; // simple, basic, intermediate, advanced
}

/**
 * Build scene regeneration prompt
 *
 * Fixes ONLY policy violations in the scene text. Keeps same plot, characters, location, events.
 * The scene illustration will NOT change — regenerated text must match it.
 */
export function buildRegenerationPrompt(params: RegenerationPromptParams): string {
  const { spec, sceneId, originalSceneText, validationFeedback, vocabLevel } = params;

  const totalScenes = params.outline.scenes.length;
  const minWords = Math.floor(spec.policyProfile.readability.targetWordsRange[0] / totalScenes);
  const maxWords = Math.ceil(spec.policyProfile.readability.targetWordsRange[1] / totalScenes);

  return helpers.cleanTemplate`
Fix policy violations in ONE scene. Fix ONLY what the validation flags. Keep plot, characters, location, events unchanged. The illustration will NOT change — your text must describe the same scene.

LANGUAGE: Write entirely in ${getLanguageFullDisplay(spec.language as any)}.

VALIDATION FEEDBACK (ISSUES TO FIX):
${validationFeedback}

ORIGINAL SCENE TEXT:
${originalSceneText}

${getContentPolicy({ policyProfile: spec.policyProfile, scenarioCardId: spec.scenarioCard?.id }).textPromptSection}

REQUIREMENTS:
- Age group: ${spec.ageGroup}
- Vocabulary level: ${vocabLevel}
- Target word count: ${minWords}-${maxWords} words

${helpers.formatChildProfile(spec)}

${helpers.formatSceneLevelRules({ ageGroup: spec.ageGroup })}

OUTPUT: Output ONLY the regenerated scene text. No JSON, no metadata, no sceneId. Plain text only.
`;
}
