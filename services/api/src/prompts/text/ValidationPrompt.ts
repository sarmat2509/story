/**
 * Validation Prompt Builder
 * Generates prompts for scene-by-scene content safety validation
 */

import type { EpisodeText, PolicyProfile, StorySpec } from '../../ai/types';
import { getContentPolicy } from '../contentPolicy';

type ReservedCharacter = StorySpec['characters'][number];

export interface ValidationPromptParams {
  sceneText: EpisodeText['scenes'][0];
  policy: PolicyProfile;
  isLastScene: boolean;
  scenarioCardId?: string;
  reservedCharacters?: ReservedCharacter[];
}

export interface BatchValidationPromptParams {
  scenes: EpisodeText['scenes'];
  policy: PolicyProfile;
  scenarioCardId?: string;
  reservedCharacters?: ReservedCharacter[];
}

export const TEXT_VALIDATION_CACHE_KEY = 'text_validation_rules_v13';

const LOCAL_VALIDATION_CATEGORIES =
  '"content_policy" | "age_inappropriate" | "fear_level" | "emotional_tone" | "vocabulary" | "language_clarity" | "reserved_character_identity_conflict" | "reserved_name_reused_for_new_entity" | "character_identity_unclear"';

const STORY_VALIDATION_CATEGORIES =
  '"causal_link_missing" | "means_end_mismatch" | "problem_resolution_gap" | "motivation_gap" | "setup_payoff_gap" | "continuity_error" | "physical_or_world_logic_error"';

function formatReservedCharacters(characters?: ReservedCharacter[]): string {
  const rows = (characters || [])
    .filter((character) => String(character?.name || '').trim())
    .map((character) => ({
      name: character.name,
      canonicalName: character.canonicalName ?? null,
      nameAliases: Array.isArray(character.nameAliases) ? character.nameAliases : [],
      type: character.type,
      subtype: character.subtype ?? null,
      role: character.role ?? null,
      visualReference: Boolean(
        (character as any).turnaroundSheet?.url ||
        (character as any).turnaroundSheet?.frontUrl ||
        (character.referencePhotos?.length || 0) > 0
      ),
      description:
        (character as any).descriptionEn ||
        (character as any).aiGeneratedDescription ||
        character.description ||
        character.appearance ||
        '',
    }));

  return rows.length > 0 ? JSON.stringify(rows, null, 2) : '';
}

function formatCharacterIdentityValidationRules(characters?: ReservedCharacter[]): string {
  const reserved = formatReservedCharacters(characters);
  if (!reserved) return '';

  return `RESERVED CHARACTER IDENTITY VALIDATION:
The following exact names and aliases belong to user-selected/reference-grounded characters. Validate the semantics of how those listed names are used; do not flag merely similar-sounding names.
${reserved}

Rules:
- These names are reserved for those exact character identities only.
- Fail with category "reserved_name_reused_for_new_entity" if a reserved character name is reused for a different entity, species, object, location, narrator, helper, vehicle, world-bearing animal, or environment.
- Fail with category "reserved_character_identity_conflict" if a reserved character is reinterpreted as a different species, body, scale, or role than its description/reference identity.
- Valid: a reserved character stands on, talks about, rides, sees, or helps a separate creature.
- Valid: an environment is located on a giant turtle/tortoise, if that turtle is not given a reserved character name.
- Invalid: a reserved moss creature named "Моховик" is presented as "the tortoise", "giant turtle", "oldest turtle", or the carrier of the world.
- If the evidence is ambiguous but likely an identity conflict, fail with category "character_identity_unclear".`;
}

export function buildBatchValidationCachedPrefix(): string {
  return `Validate the complete children's story in two passes.

PASS 1 — LOCAL SCENE VALIDATION:
- Enforce content policy, age appropriateness, fear level, emotional tone, vocabulary, and language clarity.
- Flag language_clarity only for malformed grammar, ambiguous references, or incorrect wording that materially obstructs understanding. Do not flag harmless style preferences.
- Enforce reserved character identity rules when they are provided.

PASS 2 — WHOLE-STORY COHERENCE:
- causal_link_missing: an action and outcome are both present, but the story omits the concrete link showing how the action produced the outcome.
- means_end_mismatch: the action shown could not plausibly produce the claimed result under the facts or rules established by the story.
- problem_resolution_gap: an important problem or goal is dropped, or the ending claims resolution without showing the obstacle removed and a stable result.
- motivation_gap: a plot-critical decision, reversal, or risk has no established observation, desire, information, or emotional trigger.
- setup_payoff_gap: an important question, clue, event, object, helper, plan, rule, or promise creates a narrative expectation but is abandoned, or a decisive solution appears without sufficient setup.
- continuity_error: location, possession, knowledge, ability, character state, or chronology contradicts an established fact or changes without a necessary bridge.
- physical_or_world_logic_error: spatial, practical, physical, or established magical-world logic makes an important event impossible or nonsensical.

MANDATORY NARRATIVE-OBLIGATION AUDIT — COMPLETE SILENTLY BEFORE RETURNING JSON:
1. Identify every distinct element that creates a reader expectation because it is a stated goal/problem/question, changes a character's decision or emotion, receives investigation or action, repeats, establishes a rule/plan/promise, or is emphasized as a scene-ending hook.
2. For every obligation, locate the exact later scene and observable event that closes it: completion or meaningful failure, a confirmed answer/cause, use or deliberate rejection, consequence, or an explicit intentional carry-forward that does not undermine this story's resolution.
3. Inspect every non-final scene ending separately. If it raises a concrete question, danger, task, or expected consequence, match it to a later closure.
4. A character's guess, narrator claim, genre convention, or merely plausible inferred explanation is not closure unless later prose confirms it through observation, action, or consequence.
5. Do not return an empty failedScenes array while any material obligation lacks a concrete closure. Report it as setup_payoff_gap and target the natural later payoff/resolution scene.
6. Audit one row per distinct expectation. Never merge different sounds, sights, objects, goals, questions, actions, or consequences merely because they share a mood, topic, location, or possible cause. Repeated references may share a row only when the prose clearly presents them as the same continuing thread.

Return compact JSON ONLY. Encode the completed audit as terse strings, put unresolved material obligations in open, then only scenes that FAIL in failedScenes. Omit passing scenes. Use short exact anchors from the supplied prose.

DECISION RULES:
- Flag only real issues.
- Do not demand explanations for obvious everyday cause and effect.
- Do not demand scientific explanations for magic. Magic is valid when its rule is established earlier or its concrete effect is shown consistently.
- Do not confuse intentional mystery, age-appropriate inference, metaphor, or harmless whimsy with a logic error.
- Do not treat casual speculation, jokes, metaphors, atmospheric details, or a character's guess as promised setup. Treat something as setup only when the narration frames it as a clue, plan, promise, rule, or plot-critical fact.
- Apply the narrative-obligation test by textual function, not genre or subject matter. It works the same for mysteries, conversations, journeys, school stories, fantasy rules, practical tasks, emotional promises, and any other theme.
- A character's unsupported guess is not a payoff. Later observation or action must confirm the guess, although several anomalies may share one confirmed cause when the connection is clear from the prose.
- Do not require payoff for neutral background ambience that receives no character or plot attention, such as ordinary rain, a generic floor creak, or distant wind.
- One {...} phrase in the final scene is an intentional internal marker for the required keepsake. It is valid prose metadata: never flag its curly braces as language_clarity or formatting, and never suggest removing them.
- A small tangible keepsake or reward may first appear in the final resolution after the central problem is already solved. It needs no earlier setup unless the story uses it to solve the central problem or it contradicts established facts.
- Flag story-level issues only when they materially affect a goal, obstacle, decision, solution, or the reader's understanding of events.
- Prefer visible action and concrete consequences over narrator explanations or moral summaries.
- The last scene must end positively with hope and resolution.
- Other scenes should progress the story appropriately.
- Validate only the story prose and policy/identity rules. Do not infer, complete, rewrite, or repair illustration character rosters, cameraComposition, sceneVisual, or Director metadata.
- If RESERVED CHARACTER IDENTITY VALIDATION is provided in the runtime prompt, enforce it.
- For an issue spanning scenes, put it under exactly one failedScenes row: the scene that should be repaired, normally the later scene where the missing bridge, consequence, or payoff belongs.
- For an unresolved mystery beat, target the later reveal or resolution scene where its cause can be shown naturally, not the scene that merely introduced the mystery.
- Set relatedSceneIds to every scene needed to understand a cross-scene issue. For a local issue, use only that scene id.
- Give concrete evidence from the supplied prose and a minimal, actionable suggestion that can be completed entirely inside the top-level repair target sceneId. Never tell the repairer to edit another scene; if another scene must change, make that scene the repair target instead. Do not propose changing unrelated plot facts.
- Combine all violations with the same repair target into one failedScenes row.

Output contract:
{
  "audit": [
    "<setup scene>|<2-6 word exact setup anchor>|<closure scene, 0 if open, -1 if valid future carry-forward>|<2-8 word exact closure/future anchor, empty only if open>"
  ],
  "open": [
    {
      "s": <setup scene number>,
      "k": "goal" | "question" | "threat" | "clue" | "plan" | "promise" | "rule" | "object" | "consequence" | "other",
      "a": "2-10 word exact setup anchor",
      "r": <repair scene number>
    }
  ],
  "failedScenes": [
    {
      "sceneId": <number>,
      "violations": [
        {
          "category": "<one allowed local or whole-story category>",
          "severity": "critical" | "high" | "medium",
          "message": "Clear explanation",
          "suggestion": "Smallest concrete repair (optional)",
          "relatedSceneIds": [<number>],
          "evidence": "Short evidence from the supplied prose (optional)"
        }
      ]
    }
  ]
}

AUDIT/FAILURE CONSISTENCY IS REQUIRED:
- Key map: s=setup scene, k=kind, a=setup anchor, r=repair scene.
- audit must contain one terse string for every distinct material expectation identified during the mandatory audit. Never combine expectations.
- In each audit string, the closure anchor must close that exact setup. Use 0 and an empty final field only when unresolved. Use -1 only for an explicit future-facing anchor after this story's central problem is resolved.
- Every open row must describe one distinct unresolved material expectation and have a matching setup_payoff_gap violation under failedScenes sceneId=r.
- Every setup_payoff_gap must have at least one matching open row.
- Every audit string with closure scene 0 must have a matching open row. Never put a closed obligation or valid intentional carry-forward in open.
- Keep a terse. Detailed message, suggestion, relatedSceneIds, and evidence belong only to actual failedScenes violations.

Local categories:
${LOCAL_VALIDATION_CATEGORIES}.

Whole-story categories:
${STORY_VALIDATION_CATEGORIES}.`;
}

export function buildValidationPrompt(params: ValidationPromptParams): string {
  const { sceneText, policy, isLastScene, scenarioCardId, reservedCharacters } = params;
  const { validationRules } = getContentPolicy({
    policyProfile: policy,
    scenarioCardId,
  });

  return `Validate this children's story scene for age-appropriateness and narrative safety.

Return JSON ONLY.

AGE GROUP: ${policy.ageGroup}
READING COMPLEXITY GROUP: ${policy.readingComplexityAgeGroup ?? policy.ageGroup}
SCENE ID: ${sceneText.sceneId}
IS LAST SCENE: ${isLastScene ? 'yes' : 'no'}

POLICY RULES:
${validationRules}

CORE VALIDATION RULES:
- Flag only real issues.
- Flag malformed or ambiguous language only when it materially obstructs understanding; do not flag minor style choices.
- A {...} phrase in the last scene is an intentional keepsake marker. Never flag its curly braces as a language or formatting error, and never suggest removing them.
- ${
    isLastScene
      ? 'This last scene must end positively with hope and resolution.'
      : 'This scene should progress the story appropriately.'
  }
- Validate only the story prose and policy/identity rules. Do not infer, complete, rewrite, or repair illustration character rosters, cameraComposition, sceneVisual, or Director metadata.
${formatCharacterIdentityValidationRules(reservedCharacters)}

SCENE:
TEXT: ${sceneText.text}

OUTPUT CONTRACT:
{
  "sceneId": ${sceneText.sceneId},
  "isValid": true,
  "violations": []
}

If invalid, set "isValid" to false and include violations using categories:
${LOCAL_VALIDATION_CATEGORIES}.`;
}

export function buildBatchValidationRuntimePrompt(params: BatchValidationPromptParams): string {
  const { scenes, policy, scenarioCardId, reservedCharacters } = params;
  const { validationRules } = getContentPolicy({
    policyProfile: policy,
    scenarioCardId,
  });

  const scenesBlock = scenes
    .map((scene, idx) => {
      const isLastScene = idx === scenes.length - 1;
      return [`SCENE ${scene.sceneId} | last=${isLastScene ? 'yes' : 'no'}`, `TEXT: ${scene.text}`]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return `AGE GROUP: ${policy.ageGroup}
READING COMPLEXITY GROUP: ${policy.readingComplexityAgeGroup ?? policy.ageGroup}
TOTAL SCENES: ${scenes.length}
LAST SCENE ID: ${scenes.length > 0 ? scenes[scenes.length - 1].sceneId : '?'}

POLICY RULES:
${validationRules}

${formatCharacterIdentityValidationRules(reservedCharacters)}

COMPLETE STORY, WITH REPAIRABLE SCENE BOUNDARIES:
${scenesBlock}

Evaluate both the local quality of every scene and the coherence of the complete story.
Return JSON only. Empty failedScenes array if all local and whole-story checks pass.`;
}
