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

export const TEXT_REGENERATION_CACHE_KEY = 'text_regeneration_rules_v1';

export function buildBatchRegenerationCachedPrefix(): string {
  return `Rewrite only the scenes that failed validation.

Core rules:
- Fix ONLY what validation flags.
- Keep plot, characters, location, events, and scene meaning unchanged.
- The illustration will not change, so the rewritten text must still describe the same scene.
- Return JSON only.

Output contract:
{
  "scenes": [
    { "sceneId": <number>, "text": "<regenerated scene text>" }
  ]
}`;
}

export function buildBatchRegenerationRuntimePrompt(params: BatchRegenerationPromptParams): string {
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
      (f) => `SCENE ${f.sceneId}
FEEDBACK: ${f.feedback}
ORIGINAL TEXT:
${f.originalText}`
    )
    .join('\n\n');

  return `LANGUAGE: ${getLanguageFullDisplay(spec.language as any)}
AGE GROUP: ${spec.ageGroup}
VOCABULARY LEVEL: ${vocabLevel}
TARGET WORDS PER SCENE: ${minWords}-${maxWords}
SCENE COUNT IN STORY: ${sceneCount}

SCENES TO FIX:
${scenesBlock}

POLICY RULES:
${textPromptSection}

${helpers.formatChildProfile(spec)}

${helpers.formatSceneLevelRules({ ageGroup: spec.ageGroup })}

Include exactly ${failedScenes.length} corrected scenes in the same order.`;
}
