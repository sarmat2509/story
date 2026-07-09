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

export const TEXT_VALIDATION_CACHE_KEY = 'text_validation_rules_v3';

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
  return `Validate children's story scenes for age-appropriateness and narrative safety.

Return JSON ONLY for scenes that FAIL. Omit all passing scenes.

Core validation rules:
- Flag only real issues.
- The last scene must end positively with hope and resolution.
- Other scenes should progress the story appropriately.
- Validate only the story prose and policy/identity rules. Do not infer, complete, rewrite, or repair illustration character rosters, cameraComposition, sceneVisual, or Director metadata.
- If RESERVED CHARACTER IDENTITY VALIDATION is provided in the runtime prompt, enforce it.

Output contract:
{
  "failedScenes": [
    {
      "sceneId": <number>,
      "violations": [
        {
          "category": "content_policy" | "age_inappropriate" | "emotional_tone" | "reserved_character_identity_conflict" | "reserved_name_reused_for_new_entity" | "character_identity_unclear",
          "severity": "critical" | "high" | "medium",
          "message": "Clear explanation",
          "suggestion": "How to fix (optional)"
        }
      ]
    }
  ]
}

Use categories:
"content_policy" | "age_inappropriate" | "emotional_tone" | "reserved_character_identity_conflict" | "reserved_name_reused_for_new_entity" | "character_identity_unclear".`;
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
SCENE ID: ${sceneText.sceneId}
IS LAST SCENE: ${isLastScene ? 'yes' : 'no'}

POLICY RULES:
${validationRules}

CORE VALIDATION RULES:
- Flag only real issues.
- ${isLastScene
    ? 'This last scene must end positively with hope and resolution.'
    : 'This scene should progress the story appropriately.'}
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
"content_policy" | "age_inappropriate" | "emotional_tone" | "reserved_character_identity_conflict" | "reserved_name_reused_for_new_entity" | "character_identity_unclear".`;
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
      return [
        `SCENE ${scene.sceneId} | last=${isLastScene ? 'yes' : 'no'}`,
        `TEXT: ${scene.text}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return `AGE GROUP: ${policy.ageGroup}
TOTAL SCENES: ${scenes.length}
LAST SCENE ID: ${scenes.length > 0 ? scenes[scenes.length - 1].sceneId : '?'}

POLICY RULES:
${validationRules}

${formatCharacterIdentityValidationRules(reservedCharacters)}

SCENES:
${scenesBlock}

Return JSON only. Empty failedScenes array if all scenes pass.`;
}

/**
 * Build batch validation prompt - validate ALL scenes in one request.
 * Returns only failed scenes (minimal info) to save tokens.
 */
export function buildBatchValidationPrompt(params: BatchValidationPromptParams): string {
  return `${buildBatchValidationCachedPrefix()}\n\n${buildBatchValidationRuntimePrompt(params)}`;
}
