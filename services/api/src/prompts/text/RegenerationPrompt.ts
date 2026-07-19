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
  storyScenes?: Array<{ sceneId: number; text: string }>;
  vocabLevel: string;
}

export const TEXT_REGENERATION_CACHE_KEY = 'text_regeneration_rules_v2';

export function buildBatchRegenerationCachedPrefix(): string {
  return `Rewrite only the scenes that failed validation.

Core rules:
- Fix ONLY what validation flags.
- Read the full story context to preserve continuity and cause-and-effect, but return only the target scenes.
- Apply every repair entirely inside its target sceneId. Never edit or claim to edit an untargeted scene.
- Make the smallest repair that makes the action, consequence, motivation, transition, or payoff concrete.
- Keep plot, characters, location, events, and scene meaning unchanged.
- Preserve unaffected sentences and wording whenever possible.
- Do not repair a logic gap with a narrator lecture, an announced moral, or a bare claim that the characters understood something. Show the missing action or observable change.
- A single {...} phrase in the final scene is intentional internal metadata for the story's keepsake. Preserve exactly one such marker if the target scene already contains it; keep the braces and a natural, grammatically inflected noun phrase inside. Never remove it, duplicate it, or move it to an untargeted scene.
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
  const { spec, sceneCount, failedScenes, storyScenes, vocabLevel } = params;
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

  const storyContext = storyScenes?.length
    ? `FULL STORY CONTEXT (READ ONLY — DO NOT RETURN UNTARGETED SCENES):
${storyScenes.map((scene) => `SCENE ${scene.sceneId}:\n${scene.text}`).join('\n\n')}

`
    : '';

  return `LANGUAGE: ${getLanguageFullDisplay(spec.language as any)}
AGE GROUP: ${spec.ageGroup}
READING COMPLEXITY GROUP: ${spec.storyComplexityAgeGroup ?? spec.ageGroup}
VOCABULARY LEVEL: ${vocabLevel}
TARGET WORDS PER SCENE: ${minWords}-${maxWords}
SCENE COUNT IN STORY: ${sceneCount}

${storyContext}TARGET SCENES TO FIX:
${scenesBlock}

POLICY RULES:
${textPromptSection}

${helpers.formatChildProfile(spec)}

${helpers.formatSceneLevelRules({ ageGroup: spec.storyComplexityAgeGroup ?? spec.ageGroup })}

Include exactly ${failedScenes.length} corrected scenes in the same order.`;
}
