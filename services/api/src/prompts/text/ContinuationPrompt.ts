/**
 * Continuation Prompt Builder
 * Generates prompts for story continuation/series generation
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';
import config from '../../config';

export interface ContinuationPromptParams {
  spec: StorySpec;
  sceneCount: number;
  vocabLevel: string;
  previousOutlines: Array<{
    title: string;
    moral: string;
    scenes: Array<{ setting: string; goal: string; }>;
  }>;
  requiredCharacters: Array<{
    name: string;
    type: string;
    description: string;
    role: string;
  }>;
  optionalCharacters: Array<{
    name: string;
    type: string;
    description: string;
    role: string;
  }>;
  usedPlots: string[]; // Anti-repetition: ["lost in forest", "found magic item"]
}

/**
 * Build continuation prompt in PLAIN TEXT format (Director flow)
 *
 * @deprecated Use DirectTextPrompt with isContinuation and continuationContext instead.
 */
export function buildContinuationPromptPlain(params: ContinuationPromptParams): string {
  const { spec, sceneCount, vocabLevel, previousOutlines, requiredCharacters, optionalCharacters, usedPlots } = params;
  const includeWriterAudioTags = !config.audio.deferAudioTagsToTts;
  const plainSceneExampleLine = includeWriterAudioTags
    ? 'Scene 1 text (1-3 paragraphs with ElevenLabs v3 audio tags)...'
    : 'Scene 1 text (1-3 paragraphs of narration prose only — no audio tags or square-bracket performance cues)...';
  const partNumber = previousOutlines.length + 1;

  const validRequiredChars = requiredCharacters.filter(char =>
    char.description && char.description !== 'undefined' && char.description.trim().length > 0
  );
  const validOptionalChars = optionalCharacters.filter(char =>
    char.description && char.description !== 'undefined' && char.description.trim().length > 0
  );
  const validUsedPlots = usedPlots.filter(plot => plot && plot.trim().length > 0);

  const previousEpisodesText = previousOutlines.map((outline, i) => {
    const hasMoral = outline.moral && outline.moral.trim().length > 0;
    const validScenes = outline.scenes
      .map(s => s.goal)
      .filter(goal => goal && goal.trim().length > 0);

    let episodeText = `Episode ${i + 1}: "${outline.title}"`;
    if (hasMoral) {
      episodeText += `\n- Moral: ${outline.moral}`;
    }
    if (validScenes.length > 0) {
      episodeText += `\n- Key Scenes: ${validScenes.join('; ')}`;
    }
    return episodeText;
  }).join('\n\n');

  return helpers.cleanTemplate`
You are continuing an ongoing story series for a child.
Generate the continuation in PLAIN TEXT format (no JSON).

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

PREVIOUS EPISODES SUMMARY:
${previousEpisodesText}

${validRequiredChars.length > 0 ? `
REQUIRED CHARACTERS (MUST USE):
${validRequiredChars.map(char => `
- ${helpers.formatWriterCharacterName(char.name)} (${char.type}): ${char.description}
  Role: ${char.role}
`).join('\n')}
` : ''}

${validOptionalChars.length > 0 ? `
OPTIONAL CHARACTERS (MAY USE):
${validOptionalChars.map(char => `
- ${helpers.formatWriterCharacterName(char.name)} (${char.type}): ${char.description}
  Role: ${char.role}
`).join('\n')}
` : ''}

${helpers.formatChildProfile(spec)}

STORY CONTINUATION REQUIREMENTS:
- This is Part ${partNumber} of the series
- The story MUST connect to the previous episode
${validRequiredChars.length > 0 ? '- MUST feature all REQUIRED characters from above\n' : ''}
${validOptionalChars.length > 0 ? '- MAY feature OPTIONAL characters if they fit the story\n' : ''}
- Create NEW events and challenges
- Build on previous story but make this episode standalone enjoyable
${validUsedPlots.length > 0 ? `- DO NOT repeat these plot elements: ${validUsedPlots.join(', ')}\n` : ''}
- Maintain the same tone and age-appropriateness
- MUST have a satisfying conclusion for this episode
- DO NOT repeat physical appearance of required/optional characters (from previous episodes). Use names and actions directly. Avoid "Emilia with her bright eyes...", "Flash, round and yellow...". Start with action.
- Do not output technical wardrobe keys or clothing lists. Mention clothing only when it matters naturally to the story (weather, disguise, pajamas, costume, safety gear); visual wardrobe rows belong to the later Director step.
- Avoid prose about hair color, eye color, freckles, face shape, skin tone, or other stable appearance traits unless one brief mention is truly needed for a NEW character's first introduction.
- Describe physical appearance in scene prose only for genuinely NEW LLM-invented characters that were not present in the provided story context before this story/episode.
- NEW characters: if needed, give only one brief first-glance visual cue in scene prose at first introduction.

${helpers.formatStoryRequirements({
    spec,
    sceneCount,
    targetWordCountScope: includeWriterAudioTags ? 'audio_tags_in_manuscript' : 'prose_only',
  })}

${helpers.formatAgeRequirements(spec.ageGroup)}

${getContentPolicy({ policyProfile: spec.policyProfile, scenarioCardId: spec.scenarioCard?.id }).textPromptSection}

${helpers.formatWritingStyle(spec, vocabLevel)}

${helpers.formatCoreStoryRules({
    sceneCount,
    ageGroup: spec.ageGroup,
    hasWorldRule: !!spec.worldRule,
    worldRuleText: spec.worldRule?.description,
    closingArtifact: spec.closingArtifact,
  })}

${helpers.formatNarrativeContinuityRules()}

${helpers.formatWriterPlainSceneRules({
    scenarioCardId: spec.scenarioCard?.id,
    policyProfile: spec.policyProfile,
    includeAudioTagsInWriter: includeWriterAudioTags,
  })}

OUTPUT FORMAT (plain text only):
title: Story title in ${spec.language}

description: Short SEO description (1-2 sentences, max 160 characters). For continuations, describe THIS episode's adventure. Do not summarize the whole series.

---
${plainSceneExampleLine}
---
Scene 2 text...
---
(continue for all ${sceneCount} scenes)

RULES:
- Write exactly ${sceneCount} scenes, each separated by --- on its own line
- No JSON, no scene numbers in the text — only the --- delimiter between scenes
- Each scene: 1-3 paragraphs depending on age group
- TITLE: Be creative and imaginative. Reflect the ESSENCE of this story — the main event, conflict, or theme. Do NOT use generic templates like "Пригоди X у Y". Use poetic, intriguing, or whimsical phrasing when it fits. Spark curiosity. Examples: "Таємниця висохлого озера", "Чарівна крапля надії", "Таємниця печери мрій", "Подорож до зірок"
- TITLE (continuations): Do NOT use "Частина 2/3/N". Each episode gets a unique title.
`;
}
