/**
 * Direct Text Generation Prompt (without outline)
 * Generates complete story prose only. Visual planning belongs to DirectorPrompt.
 * Supports both standard and continuation modes via optional params
 */

import * as helpers from '../helpers';
import type { StorySpec } from '../../ai/types';
import config from '../../config';

export interface DirectTextPromptParams {
  spec: StorySpec;
  sceneCount: number;
  vocabLevel: string;
  /** When true, adds continuation-specific sections */
  isContinuation?: boolean;
  previousOutlines?: Array<{
    title: string;
    moral: string;
    scenes: Array<{ setting: string; goal: string }>;
  }>;
  usedPlots?: string[];
  /** Required characters (when isContinuation) */
  requiredCharacters?: helpers.ContinuationCharacter[];
  /** Optional characters (when isContinuation, MAY use) */
  optionalCharacters?: helpers.ContinuationCharacter[];
  /** Environments from previous episodes — reuse IDs when same location */
  previousEnvironments?: Array<{
    id: string;
    name: string;
    description: string;
    characterOutfits?: string;
  }>;
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
 * Recover a Writer response that contains usable prose but missed the plain-output envelope.
 * It is deliberately a formatting-only request: no new story content may be invented.
 */
export function buildDirectTextFormatRepairPrompt(rawText: string): string {
  return `Reformat the following children's story response without changing, adding, removing, translating, or summarizing any story prose. Return plain text only — no Markdown code fence and no commentary.

Required envelope:
title: <existing title>

description: <existing short description>

---
<existing first scene prose>
---
<existing next scene prose>

Use a line containing exactly --- between every scene. If title or description is absent, derive it only from the supplied response. Keep the original language exactly.

SOURCE RESPONSE:
${rawText}`;
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

  const continuationRequirementsSection =
    isContinuation && previousOutlines && previousOutlines.length > 0
      ? (() => {
          const reqChars = requiredCharacters || [];
          const optChars = optionalCharacters || [];
          return `${helpers.formatContinuationStoryContext({
            context: {
              previousOutlines,
              requiredCharacters: reqChars,
              optionalCharacters: optChars,
              usedPlots,
            },
            mode: 'plain_text',
          })}
- Introduce new secondary characters in the narrative as needed; a later visual pass will capture cast, outfits, and environments (you do not output JSON for those).
- Use names and actions directly for required/optional characters. Avoid reintroducing them through physical appearance.
- Do not mention clothing in scene prose, even if clothes changed. When the look changes, state it clearly in the story (e.g. raincoat, pajamas) so a later visual pass can infer wardrobe; avoid catalog-style garment lists.
- Avoid prose about hair color, eye color, freckles, face shape, skin tone, or other stable appearance traits unless one brief mention is truly needed for a NEW character's first introduction.
- Describe physical appearance in scene prose only for genuinely NEW LLM-invented characters that were not present in the provided story context before this story/episode.
- NEW characters: if needed, give only one brief first-glance visual cue in scene prose at first introduction. Do not output a separate character sheet.

`;
        })()
      : '';

  const reuseEnvironmentsSectionPlain =
    isContinuation && previousEnvironments && previousEnvironments.length > 0
      ? `${helpers.formatContinuationLocationMemory(previousEnvironments)}\n\n`
      : '';

  const reuseOutfitsSectionPlain =
    isContinuation && previousOutfits && previousOutfits.length > 0
      ? `${helpers.formatContinuationOutfitMemory(previousOutfits)}\n\n`
      : '';

  const storyRequirementsLabel = isContinuation ? '' : 'STORY REQUIREMENTS:\n';

  return helpers.cleanTemplate`
You are ${isContinuation ? 'continuing an ongoing story series for a child. ' : "a creative storyteller specializing in children's content with audio narration. "}
Role boundary: you are the Story Writer, not the Visual Director.
Generate ${isContinuation ? 'the continuation in ' : 'a complete story in '}PLAIN TEXT format (no JSON).

LANGUAGE: Write entirely in ${helpers.getLanguageName(spec.language)}.

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

${
  spec.storyComplexityAgeGroup && spec.storyComplexityAgeGroup !== spec.ageGroup
    ? `${helpers.formatTextComplexityRequirements(spec.storyComplexityAgeGroup)}\n- Content maturity, themes, conflict, and emotional intensity must remain appropriate for chronological age group ${spec.ageGroup}.`
    : helpers.formatAgeRequirements(spec.ageGroup)
}

${helpers.formatContentPolicySection(spec)}

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
${
  isContinuation && (requiredCharacters?.length || 0) + (optionalCharacters?.length || 0) > 0
    ? `- In scene TEXT: Do NOT re-describe required/optional characters. NEW characters may get only one brief first-glance appearance cue when first introduced.
- In scene text: skip clothing lists and long appearance breakdowns—use action, feelings, and dialogue. One quick look-in for a brand-new character is enough when they first appear.
- In scene TEXT: Describe physical appearance only for genuinely NEW LLM-invented characters that were not already present in the provided story context.
- Establish NEW characters through the narrative only; do not output a separate character roster.`
    : `- Use the SUPPORTING CHARACTERS from above plus any new characters you invent in the story.
- If the story only uses user-provided characters, do not invent extra named cast unless the plot truly needs them.
- In scene text: skip clothing lists and long appearance breakdowns—prefer action, feelings, and dialogue.
- For a NEW character, allow at most one brief first-glance appearance cue in prose when they first matter to the plot.
- Good introduction example: "A small fluffy creature with purple fur tapped her shoulder—its silver crown glinted."
- Vague (avoid): "A cute helper appeared."`
}

FINAL SILENT SELF-CHECK BEFORE OUTPUT:
- Scan every invented object, location, clue, and promise for literal sense. Ask: can this thing actually be there, inside that object, or cause that result based on the scene already written?
- Rewrite poetic but illogical claims. Example: do not write "treasures hidden inside the bridge" unless the bridge has been established as hollow or portal-like; write "beyond the bridge", "under the bridge", "near the bridge", or remove the treasure bait.
- Scan the draft and rewrite any sentence that explains a hidden law, lesson, or safety moral directly.
- Remove target-language equivalents of: "she understood/realized", "remembered the rule", "safety rule(s)", "the main rule", "magic stopped working", "power was exhausted", "save energy", "learned the lesson", "did the right thing", "good/correct behavior".
- For Ukrainian/Russian output, specifically avoid phrases like: "вона зрозуміла", "він зрозумів", "згадала правило", "головне правило", "правила безпеки", "магія не спрацювала", "сила вичерпалася", "не витрачати сили", "берегти сили", "вчинила правильно", "добре вчинила", "правильно зробила".
- Replace those with visible story action: a dim glow, tingling fingers, a pause, stepping back, choosing another tool, calling a trusted adult, or a concrete consequence.

OUTPUT FORMAT (plain text only):
title: Story title in ${spec.language}

description: Short SEO description (1-2 sentences, max 160 characters). ${isContinuation && previousOutlines && previousOutlines.length > 0 ? "For continuations, describe THIS episode's adventure. Do not summarize the whole series. " : ''}Summarize the story for search engines.
Description rules: describe the adventure hook only. Do NOT announce the moral, praise the hero's correct behavior, or use phrases like "learns that", "does the right thing", "important lesson", or equivalents in the story language.

---
${plainSceneExampleLine}
---
Scene 2 text...
---
(continue for all ${sceneCount} scenes)

TITLE (for the title line above):
${helpers.formatStoryTitleRules({
  isContinuation: !!(isContinuation && previousOutlines && previousOutlines.length > 0),
})}

RULES (format only):
- No JSON, no scene numbers in the text — only the --- delimiter between scenes
- Do not output sceneVisual, cameraComposition, outfits, environments, image prompts, or any visual-production metadata
`;
}
