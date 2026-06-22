/**
 * Direct Text Generation Prompt (without outline)
 * Generates complete story prose only. Visual planning belongs to DirectorPrompt.
 * Supports both standard and continuation modes via optional params
 */

import * as helpers from '../helpers';
import { getContentPolicy } from '../contentPolicy';
import type { StorySpec } from '../../ai/types';
import config from '../../config';

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
  /** Wardrobe facts from previous episodes — author awareness only; Director owns outfit ids. */
  previousOutfits?: Array<{ id: string; characterName: string; description: string }>;
}

export const WRITER_PLAIN_CACHE_KEY = 'writer_plain_rules_v3';

export function buildDirectTextPromptPlainCachedPrefix(): string {
  return `You are a creative storyteller specializing in children's content with audio narration.
You are the Story Writer, not the Visual Director. Generate the story in plain text only.

Core rules:
- Write age-appropriate, positive, empowering stories.
- Keep narrative and scene output internally consistent.
- Happy, safe ending required.
- Follow the requested language exactly.
- Write the requested number of scenes separated by --- on its own line.
- No JSON in the response.
- Do not output sceneVisual, cameraComposition, outfits, environments, image prompts, or any visual-production metadata.
- In SCENE TEXT, do not describe clothing. Keep physical appearance mentions to an absolute minimum.
- In SCENE TEXT, prefer actions, emotions, dialogue, and plot beats over visual re-description of characters.
- If a NEW character is introduced, allow at most one brief first-glance appearance cue in prose; do not dwell on hair, eyes, face shape, or wardrobe.

Plain output contract:
- title: Story title
- description: Short SEO description
- Then scene blocks separated by ---`;
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
    previousOutfits,
  } = params;

  const includeWriterAudioTagsPlain = !config.audio.deferAudioTagsToTts;
  const plainSceneExampleLine = includeWriterAudioTagsPlain
    ? 'Scene 1 text (1-3 paragraphs with ElevenLabs v3 audio tags for expressive narration)...'
    : 'Scene 1 text (1-3 paragraphs of narration prose only — no audio tags or square-bracket performance cues)...';

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
- The story MUST connect to the previous episode. Reference events, characters, or outcomes from Part ${partNumber - 1}. Maintain narrative continuity while introducing a NEW world rule and NEW setting.
${reqChars.length > 0 ? '- MUST feature all REQUIRED characters from above\n' : ''}
${optChars.length > 0 ? '- MAY feature OPTIONAL characters if they fit the story (not required)\n' : ''}
- Create NEW events and challenges (not covered in previous episodes)
- Build on previous story but make this episode standalone enjoyable
- Introduce new secondary characters in the narrative as needed; a later visual pass will capture cast, outfits, and environments (you do not output JSON for those).
${validUsedPlots.length > 0 ? `- DO NOT repeat these plot elements: ${validUsedPlots.join(', ')}\n` : ''}
- Maintain the same tone and age-appropriateness
- MUST have a satisfying conclusion for this episode
- OPTIONAL: Add a gentle cliffhanger or hint for next episode
- DO NOT repeat physical appearance of required/optional characters (from previous episodes). Use names and actions directly. Avoid "Emilia with her bright eyes...", "Flash, round and yellow...". Start with action.
- Do NOT mention clothing in scene prose, even if clothes changed. When the look changes, state it clearly in the story (e.g. raincoat, pajamas) so a later visual pass can infer wardrobe—avoid catalog-style garment lists.
- Avoid prose about hair color, eye color, freckles, face shape, skin tone, or other stable appearance traits unless one brief mention is truly needed for a NEW character's first introduction.
- Describe physical appearance in scene prose only for genuinely NEW LLM-invented characters that were not present in the provided story context before this story/episode.
- NEW characters: if needed, give only one brief first-glance visual cue in scene prose at first introduction. Do not output a separate character sheet.

`;
        })()
      : '';

  const reuseEnvironmentsSectionPlain =
    isContinuation && previousEnvironments && previousEnvironments.length > 0
      ? `REUSE LOCATIONS (prose continuity): When the story returns to the SAME place as a previous episode, reuse the SAME location name and clear recurring cues (layout, landmarks, atmosphere) so a later visual pass can match it. Reference locations from earlier parts:\n${previousEnvironments
          .map((e) => `- ${e.name}: ${e.description.slice(0, 120)}${e.description.length > 120 ? '...' : ''}`)
          .join('\n')}\nFor genuinely NEW places, establish a distinct name and setting in prose.\n\n`
      : '';

  const reuseOutfitsSectionPlain =
    isContinuation && previousOutfits && previousOutfits.length > 0
      ? `WARDROBE CONTINUITY (author awareness only): Do not output technical wardrobe keys or clothing lists. Mention clothing only when it matters naturally to the story (weather, disguise, pajamas, costume, safety gear). Prior episode wardrobe facts for continuity:\n${previousOutfits
          .map((o) => `- ${helpers.formatWriterCharacterName(o.characterName)}: ${o.description.slice(0, 100)}${o.description.length > 100 ? '...' : ''}`)
          .join('\n')}\n\n`
      : '';

  const storyRequirementsLabel = isContinuation ? '' : 'STORY REQUIREMENTS:\n';

  return helpers.cleanTemplate`
You are ${isContinuation ? 'continuing an ongoing story series for a child. ' : "a creative storyteller specializing in children's content with audio narration. "}
Role boundary: you are the Story Writer, not the Visual Director.
Generate ${isContinuation ? 'the continuation in ' : 'a complete story in '}PLAIN TEXT format (no JSON).

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

${previousEpisodesSection}

${helpers.formatChildProfile(spec)}

${charactersSection}

${storyRequirementsLabel}

${continuationRequirementsSection}

${reuseEnvironmentsSectionPlain}

${reuseOutfitsSectionPlain}

${helpers.formatStoryRequirements({
    spec,
    sceneCount,
    targetWordCountScope: includeWriterAudioTagsPlain ? 'audio_tags_in_manuscript' : 'prose_only',
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
  includeAudioTagsInWriter: includeWriterAudioTagsPlain,
})}

IMPORTANT — Character introductions (prose only; no JSON character list):
${isContinuation && (requiredCharacters?.length || 0) + (optionalCharacters?.length || 0) > 0
  ? `- In scene TEXT: Do NOT re-describe required/optional characters. NEW characters may get only one brief first-glance appearance cue when first introduced.
- In scene text: skip clothing lists and long appearance breakdowns—use action, feelings, and dialogue. One quick look-in for a brand-new character is enough when they first appear.
- In scene TEXT: Describe physical appearance only for genuinely NEW LLM-invented characters that were not already present in the provided story context.
- Establish NEW characters through the narrative only; do not output a separate character roster.`
  : `- Use the SUPPORTING CHARACTERS from above plus any new characters you invent in the story.
- If the story only uses user-provided characters, do not invent extra named cast unless the plot truly needs them.
- In scene text: skip clothing lists and long appearance breakdowns—prefer action, feelings, and dialogue.
- For a NEW character, allow at most one brief first-glance appearance cue in prose when they first matter to the plot.
- Good introduction example: "A small fluffy creature with purple fur tapped her shoulder—its silver crown glinted."
- Vague (avoid): "A cute helper appeared."`}

FINAL SILENT SELF-CHECK BEFORE OUTPUT:
- Scan every invented object, location, clue, and promise for literal sense. Ask: can this thing actually be there, inside that object, or cause that result based on the scene already written?
- Rewrite poetic but illogical claims. Example: do not write "treasures hidden inside the bridge" unless the bridge has been established as hollow or portal-like; write "beyond the bridge", "under the bridge", "near the bridge", or remove the treasure bait.
- Scan the draft and rewrite any sentence that explains a hidden law, lesson, or safety moral directly.
- Remove target-language equivalents of: "she understood/realized", "remembered the rule", "safety rule(s)", "the main rule", "magic stopped working", "power was exhausted", "save energy", "learned the lesson", "did the right thing", "good/correct behavior".
- For Ukrainian/Russian output, specifically avoid phrases like: "вона зрозуміла", "він зрозумів", "згадала правило", "головне правило", "правила безпеки", "магія не спрацювала", "сила вичерпалася", "не витрачати сили", "берегти сили", "вчинила правильно", "добре вчинила", "правильно зробила".
- Replace those with visible story action: a dim glow, tingling fingers, a pause, stepping back, choosing another tool, calling a trusted adult, or a concrete consequence.

OUTPUT FORMAT (plain text only):
title: Story title in ${spec.language}

description: Short SEO description (1-2 sentences, max 160 characters). ${isContinuation && previousOutlines && previousOutlines.length > 0 ? 'For continuations, describe THIS episode\'s adventure. Do not summarize the whole series. ' : ''}Summarize the story for search engines.
Description rules: describe the adventure hook only. Do NOT announce the moral, praise the hero's correct behavior, or use phrases like "learns that", "does the right thing", "important lesson", or equivalents in the story language.

---
${plainSceneExampleLine}
---
Scene 2 text...
---
(continue for all ${sceneCount} scenes)

TITLE (for the title line above):
- Be creative and imaginative. Reflect the ESSENCE of this story — the main event, conflict, or theme. Do NOT use generic templates like "Пригоди X у Y". Use poetic, intriguing, or whimsical phrasing when it fits. Spark curiosity. Examples: "Таємниця висохлого озера", "Чарівна крапля надії", "Таємниця печери мрій", "Подорож до зірок"
${isContinuation && previousOutlines && previousOutlines.length > 0
  ? '\n- TITLE (continuations): Do NOT use "Частина 2/3/N". Each episode gets a unique title.'
  : ''}

RULES (format only):
- No JSON, no scene numbers in the text — only the --- delimiter between scenes
- Do not output sceneVisual, cameraComposition, outfits, environments, image prompts, or any visual-production metadata
`;
}
