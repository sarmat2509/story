/**
 * Direct Text Generation Prompt (without outline)
 * Generates complete story text directly, including scene structure
 * Supports both standard and continuation modes via optional params
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';

export interface DirectTextPromptParams {
  spec: StorySpec;
  sceneCount: number;
  vocabLevel: string;
  /** When true, adds continuation-specific sections */
  isContinuation?: boolean;
  previousOutlines?: Array<{ title: string; moral: string; scenes: Array<{ setting: string; goal: string }> }>;
  usedPlots?: string[];
  /** Required characters (when isContinuation) */
  requiredCharacters?: helpers.ContinuationCharacter[];
  /** Optional characters (when isContinuation, MAY use) */
  optionalCharacters?: helpers.ContinuationCharacter[];
  /** Environments from previous episodes — reuse IDs when same location */
  previousEnvironments?: Array<{ id: string; name: string; description: string; characterOutfits?: string }>;
}

/**
 * Build direct text generation prompt
 * Skips outline generation and creates full story in one step
 * When isContinuation=true, adds previous episodes, required/optional characters, usedPlots
 */
export function buildDirectTextPrompt(params: DirectTextPromptParams): string {
  const { spec, sceneCount, vocabLevel, isContinuation, previousOutlines, usedPlots, requiredCharacters, optionalCharacters, previousEnvironments } = params;

  const charactersSection = isContinuation && requiredCharacters
    ? helpers.formatSupportingCharactersContinuation(requiredCharacters, optionalCharacters)
    : helpers.formatSupportingCharacters(spec);

  const previousEpisodesSection = isContinuation && previousOutlines && previousOutlines.length > 0
    ? (() => {
        const partNumber = previousOutlines.length + 1;
        const text = previousOutlines
          .map((outline, i) => {
            const hasMoral = outline.moral && outline.moral.trim().length > 0;
            const validScenes = outline.scenes
              .map((s) => s.goal)
              .filter((goal) => goal && goal.trim().length > 0);
            let episodeText = `Episode ${i + 1}: "${outline.title}"`;
            if (hasMoral) episodeText += `\n- Moral: ${outline.moral}`;
            if (validScenes.length > 0) episodeText += `\n- Key Scenes: ${validScenes.join('; ')}`;
            return episodeText;
          })
          .join('\n\n');
        return `PREVIOUS EPISODES SUMMARY:\n${text}\n\n`;
      })()
    : '';

  const continuationRequirementsSection = isContinuation && previousOutlines && previousOutlines.length > 0
    ? (() => {
        const partNumber = previousOutlines.length + 1;
        const validUsedPlots = (usedPlots || []).filter((p) => p && p.trim().length > 0);
        const reqChars = requiredCharacters || [];
        const optChars = optionalCharacters || [];
        return `STORY CONTINUATION REQUIREMENTS:
- This is Part ${partNumber} of the series
- The story MUST connect to the previous episode. Reference events, characters, or outcomes from Part ${partNumber - 1}. Maintain narrative continuity while introducing a NEW world rule and NEW setting.
${reqChars.length > 0 ? '- MUST feature all REQUIRED characters from above\n' : ''}
${optChars.length > 0 ? '- MAY feature OPTIONAL characters if they fit the story (not required)\n' : ''}
- Create NEW events and challenges (not covered in previous episodes)
- Build on previous story but make this episode standalone enjoyable
- Introduce new secondary characters if needed (return them in "characters" output)
${validUsedPlots.length > 0 ? `- DO NOT repeat these plot elements: ${validUsedPlots.join(', ')}\n` : ''}
- Maintain the same tone and age-appropriateness
- MUST have a satisfying conclusion for this episode
- OPTIONAL: Add a gentle cliffhanger or hint for next episode
- DO NOT repeat physical appearance of required/optional characters (from previous episodes). Use names and actions directly. Avoid "Emilia with her bright eyes...", "Flash, round and yellow...". Start with action.
- NEW characters: MUST describe their appearance when first introduced (for reader and image generation). Add to characters array with detailed description.

`;
      })()
    : '';

  const reuseEnvironmentsSection = isContinuation && previousEnvironments && previousEnvironments.length > 0
    ? `REUSE ENVIRONMENTS: When the scene is in the SAME location as a previous episode, use the EXACT environment id. Available from previous episodes:\n${previousEnvironments
        .map((e) => `- ${e.id} (${e.name}): ${e.description.slice(0, 120)}${e.description.length > 120 ? '...' : ''}`)
        .join('\n')}\nAdd NEW environments only for new locations. Use the same id when returning to a known location.\n\n`
    : '';

  const storyRequirementsLabel = isContinuation ? '' : 'STORY REQUIREMENTS:\n';

  return helpers.cleanTemplate`
${isContinuation ? 'You are continuing an ongoing story series for a child.\n\n' : 'You are a creative storyteller specializing in children\'s content with audio narration.\nGenerate a complete story directly with all scenes, text, and visual descriptions.\n\n'}

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

${previousEpisodesSection}

${helpers.formatChildProfile(spec)}

${charactersSection}

${storyRequirementsLabel}

${continuationRequirementsSection}

${reuseEnvironmentsSection}

${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${getContentPolicy({ policyProfile: spec.policyProfile, scenarioCardId: spec.scenarioCard?.id }).textPromptSection}

${helpers.formatWritingStyle(spec, vocabLevel)}

${helpers.formatCoreStoryRules({ sceneCount, ageGroup: spec.ageGroup, hasWorldRule: !!spec.worldRule, worldRuleText: spec.worldRule?.description })}

${helpers.formatVisualStoryRules({ imageStyle: spec.imageStyle, scenarioCardId: spec.scenarioCard?.id, policyProfile: spec.policyProfile })}

OUTPUT FORMAT (JSON). Generate environments LAST — one entry per unique environmentId used in scenes. characterOutfits must list ALL characters who appear there — never empty string.
{
  "title": "Story title in ${spec.language}",
  "language": "${spec.language}",
  "characters": [
    {
      "name": "Character name",
      "type": "human | animal | creature | object",
      "description": "Detailed visual appearance: size, colors, distinctive features, clothing/accessories. Be specific and consistent.",
      "role": "protagonist | sidekick | mentor | helper | guide | friend",
      "personality": "Key personality traits"
    }
  ],
  "moral": "The moral/lesson of the story",
  "scenes": [
    {
      "sceneId": 1,
      "environmentId": "short_id",
      "text": "Full scene text (1-3 paragraphs) with embedded ElevenLabs v3 audio tags for expressive narration.",
      "sceneVisual": {
        "setting": "Complete physical setting for this scene IN ENGLISH: room layout, furniture, objects, wall decorations, floor material, materials, textures, colors, weather, time of day.",
        "cameraComposition": {
          "shot": "Medium shot at child eye-level, focal point on Character1",
          "characters": [
            { "name": "Character Name 1", "description": "foreground left on chair, sitting, smiling, looking at Character Name 2" },
            { "name": "Character Name 2", "description": "background right near window, standing, waving" }
          ]
        },
        "lighting": "Lighting conditions IN ENGLISH: warm golden sunlight from left window, soft shadows on floor."
      }
    }
  ],
  "environments": [
    {
      "id": "short_id",
      "name": "Human-readable location name",
      "description": "BASE visual description IN ENGLISH...",
      "characterOutfits": "ExactCharacterName: detailed outfit (type, colors, elements). CreatureName: natural appearance"
    }
  ]
}

IMPORTANT - Character Descriptions:
${isContinuation && (requiredCharacters?.length || 0) + (optionalCharacters?.length || 0) > 0
  ? `- In scene TEXT: Do NOT re-describe required/optional characters. NEW characters — MUST describe appearance when first introduced.
- characters array: Include ONLY new characters. Provide DETAILED visual descriptions (appearance, colors, size, distinctive features, clothing) for each.
- Do NOT include required/optional characters from above in output
- Be SPECIFIC and CONSISTENT for image generation`
  : `- Return ALL characters you create in the story (do NOT include user-provided characters from SUPPORTING CHARACTERS section above)
- If no new characters are created (story only uses user-provided characters), return empty array []
- Provide DETAILED visual descriptions (appearance, colors, size, distinctive features, clothing)
- Be SPECIFIC and CONSISTENT - describe exactly how the character looks for image generation
- Example good description: "Small fluffy creature with purple fur, large golden eyes, translucent butterfly wings with star patterns, wears a tiny silver crown"
- Example bad description: "Cute helper" (too vague, will generate inconsistent images)
- These descriptions will be used for image generation to maintain character consistency across all scenes`}

IMPORTANT:
- Write exactly ${sceneCount} scenes total
- Each scene should be 1-3 paragraphs depending on age group
- Focus on positive, empowering storytelling
- Happy, safe ending required
- TITLE: Be creative and imaginative. Reflect the ESSENCE of this story — the main event, conflict, or theme. Do NOT use generic templates like "Пригоди X у Y". Use poetic, intriguing, or whimsical phrasing when it fits. Spark curiosity. Examples: "Таємниця висохлого озера", "Чарівна крапля надії", "Таємниця печери мрій", "Подорож до зірок"
${isContinuation && previousOutlines && previousOutlines.length > 0
  ? '\n- TITLE (continuations): Do NOT use "Частина 2/3/N". Each episode gets a unique title.'
  : ''}
`;
}

/**
 * Build plain text generation prompt (Director flow)
 * Output: title, description, scenes separated by --- (no JSON)
 */
export function buildDirectTextPromptPlain(params: DirectTextPromptParams): string {
  const {
    spec,
    sceneCount,
    vocabLevel,
    isContinuation,
    previousOutlines,
    usedPlots,
    requiredCharacters,
    optionalCharacters,
    previousEnvironments,
  } = params;

  const charactersSection =
    isContinuation && requiredCharacters
      ? helpers.formatSupportingCharactersContinuation(requiredCharacters, optionalCharacters)
      : helpers.formatSupportingCharacters(spec);

  const previousEpisodesSection =
    isContinuation && previousOutlines && previousOutlines.length > 0
      ? (() => {
          const text = previousOutlines
            .map((outline, i) => {
              const hasMoral = outline.moral && outline.moral.trim().length > 0;
              const validScenes = outline.scenes
                .map((s) => s.goal)
                .filter((goal) => goal && goal.trim().length > 0);
              let episodeText = `Episode ${i + 1}: "${outline.title}"`;
              if (hasMoral) episodeText += `\n- Moral: ${outline.moral}`;
              if (validScenes.length > 0) episodeText += `\n- Key Scenes: ${validScenes.join('; ')}`;
              return episodeText;
            })
            .join('\n\n');
          return `PREVIOUS EPISODES SUMMARY:\n${text}\n\n`;
        })()
      : '';

  const continuationRequirementsSection =
    isContinuation && previousOutlines && previousOutlines.length > 0
      ? (() => {
          const partNumber = previousOutlines.length + 1;
          const validUsedPlots = (usedPlots || []).filter((p) => p && p.trim().length > 0);
          const reqChars = requiredCharacters || [];
          const optChars = optionalCharacters || [];
          return `STORY CONTINUATION REQUIREMENTS:
- This is Part ${partNumber} of the series
- The story MUST connect to the previous episode
${reqChars.length > 0 ? '- MUST feature all REQUIRED characters from above\n' : ''}
${optChars.length > 0 ? '- MAY feature OPTIONAL characters if they fit the story\n' : ''}
- Create NEW events and challenges
- Build on previous story but make this episode standalone enjoyable
${validUsedPlots.length > 0 ? `- DO NOT repeat these plot elements: ${validUsedPlots.join(', ')}\n` : ''}
- Maintain the same tone and age-appropriateness
- MUST have a satisfying conclusion for this episode
- DO NOT repeat physical appearance of required/optional characters (from previous episodes). Use names and actions directly. Avoid "Emilia with her bright eyes...", "Flash, round and yellow...". Start with action.
- NEW characters: MUST describe their appearance when first introduced (for reader and image generation).

`;
        })()
      : '';

  const reuseEnvironmentsSection =
    isContinuation && previousEnvironments && previousEnvironments.length > 0
      ? `REUSE ENVIRONMENTS: When the scene is in the SAME location as a previous episode, use the EXACT environment id. Available from previous episodes:\n${previousEnvironments
          .map((e) => `- ${e.id} (${e.name}): ${e.description.slice(0, 120)}${e.description.length > 120 ? '...' : ''}`)
          .join('\n')}\nAdd NEW environments only for new locations. Use the same id when returning to a known location.\n\n`
      : '';

  const storyRequirementsLabel = isContinuation ? '' : 'STORY REQUIREMENTS:\n';

  return helpers.cleanTemplate`
You are ${isContinuation ? 'continuing an ongoing story series for a child. ' : "a creative storyteller specializing in children's content with audio narration. "}
Generate ${isContinuation ? 'the continuation in ' : 'a complete story in '}PLAIN TEXT format (no JSON).

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

${previousEpisodesSection}

${helpers.formatChildProfile(spec)}

${charactersSection}

${storyRequirementsLabel}

${continuationRequirementsSection}

${reuseEnvironmentsSection}

${helpers.formatStoryRequirements({ spec, sceneCount })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${getContentPolicy({ policyProfile: spec.policyProfile, scenarioCardId: spec.scenarioCard?.id }).textPromptSection}

${helpers.formatWritingStyle(spec, vocabLevel)}

${helpers.formatCoreStoryRules({ sceneCount, ageGroup: spec.ageGroup, hasWorldRule: !!spec.worldRule, worldRuleText: spec.worldRule?.description })}

OUTPUT FORMAT (plain text only):
title: Story title in ${spec.language}

description: Short SEO description (1-2 sentences, max 160 characters). ${isContinuation && previousOutlines && previousOutlines.length > 0 ? 'For continuations, describe THIS episode\'s adventure. Do not summarize the whole series. ' : ''}Summarize the story for search engines.

---
Scene 1 text (1-3 paragraphs with ElevenLabs v3 audio tags for expressive narration)...
---
Scene 2 text...
---
(continue for all ${sceneCount} scenes)

RULES:
- Write exactly ${sceneCount} scenes, each separated by --- on its own line
- No JSON, no scene numbers in the text — only the --- delimiter between scenes
- Each scene: 1-3 paragraphs depending on age group
- Focus on positive, empowering storytelling
- Happy, safe ending required
- TITLE: Be creative and imaginative. Reflect the ESSENCE of this story — the main event, conflict, or theme. Do NOT use generic templates like "Пригоди X у Y". Use poetic, intriguing, or whimsical phrasing when it fits. Spark curiosity. Examples: "Таємниця висохлого озера", "Чарівна крапля надії", "Таємниця печери мрій", "Подорож до зірок"
${isContinuation && previousOutlines && previousOutlines.length > 0
  ? '\n- TITLE (continuations): Do NOT use "Частина 2/3/N". Each episode gets a unique title.'
  : ''}
`;
}
