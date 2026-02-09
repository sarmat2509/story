/**
 * Regeneration Prompt Builder
 * Generates prompts for selective scene regeneration based on validation feedback
 */

import * as helpers from '../helpers';
import type { StorySpec, EpisodeOutline } from '../../ai/types';
import { getLanguageFullDisplay } from '@kazka/shared';

export interface RegenerationPromptParams {
  spec: StorySpec;
  outline: EpisodeOutline;
  sceneId: number;
  validationFeedback: string;
  vocabLevel: string; // simple, basic, intermediate, advanced
}

/**
 * Build scene regeneration prompt
 * 
 * Regenerates a single scene with:
 * - Validation feedback to fix specific issues
 * - Context from neighboring scenes for continuity
 * - All original requirements and constraints
 */
export function buildRegenerationPrompt(params: RegenerationPromptParams): string {
  const { spec, outline, sceneId, validationFeedback, vocabLevel } = params;
  
  // Find the scene and its neighbors
  const sceneOutline = outline.scenes.find(s => s.sceneId === sceneId);
  if (!sceneOutline) {
    throw new Error(`Scene ${sceneId} not found in outline`);
  }
  
  const previousScene = outline.scenes.find(s => s.sceneId === sceneId - 1);
  const nextScene = outline.scenes.find(s => s.sceneId === sceneId + 1);
  
  // Calculate per-scene word count target
  const totalScenes = outline.scenes.length;
  const minWords = Math.floor(spec.policyProfile.readability.targetWordsRange[0] / totalScenes);
  const maxWords = Math.ceil(spec.policyProfile.readability.targetWordsRange[1] / totalScenes);
  
  return helpers.cleanTemplate`
You are regenerating ONE scene of a children's story based on validation feedback.

IMPORTANT CONTEXT: You are creating SAFE, age-appropriate content for children. The validation feedback below identifies content that should be IMPROVED to ensure child safety. Your task is to rewrite the scene to be completely safe and appropriate.

LANGUAGE: Write entirely in ${getLanguageFullDisplay(spec.language as any)}.

VALIDATION FEEDBACK (ISSUES TO FIX FOR CHILD SAFETY):
${validationFeedback}

${helpers.formatChildProfile(spec)}

STORY CONTEXT:
- Story title: ${outline.title}
- Story moral: ${outline.moral}

FULL STORY OUTLINE:
${JSON.stringify(outline, null, 2)}

SCENE TO REGENERATE: Scene ${sceneId}
${JSON.stringify(sceneOutline, null, 2)}

${previousScene ? `PREVIOUS SCENE (for continuity):
Scene ${previousScene.sceneId}: ${previousScene.setting} - ${previousScene.goal}` : 'This is the first scene.'}

${nextScene ? `NEXT SCENE (for flow):
Scene ${nextScene.sceneId}: ${nextScene.setting} - ${nextScene.goal}` : 'This is the last scene.'}

WRITING REQUIREMENTS:
- Age group: ${spec.ageGroup}
- Vocabulary level: ${vocabLevel}
- Target word count for this scene: ${minWords}-${maxWords} words

${helpers.formatSafetyPolicy(spec.policyProfile)}

CRITICAL INSTRUCTIONS:
- FIX all issues mentioned in validation feedback to ensure CHILD SAFETY
- Maintain continuity with previous/next scenes
- Follow the scene outline (setting, goal, emotion, beats)
- If this is the last scene: MUST end with clear positive resolution
- Keep the same sceneId: ${sceneId}

OUTPUT FORMAT (JSON):
{
  "sceneId": ${sceneId},
  "text": "Complete regenerated text for this scene...",
  "visualPrompt": "Enhanced visual description for image generation..."
}
`;
}
