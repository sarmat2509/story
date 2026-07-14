import { stripCharacterIdFromName } from '@wondertales/shared';
import type { SceneVisual } from './types';
import { crossScriptIdentityKey } from '../utils/characterNormalization';

type KnownCharacterIdentity = {
  name?: string;
  canonicalName?: string;
  nameInStory?: string;
  nameAliases?: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = stripCharacterIdFromName(value).trim().replace(/\s+/g, ' ');
  return clean || undefined;
}

function normalizedName(value: string): string {
  return cleanName(value)?.normalize('NFC').toLocaleLowerCase() ?? '';
}

function containsName(text: string, name: string): boolean {
  const clean = cleanName(name);
  if (!clean) return false;
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapeRegExp(clean)}(?=$|[^\\p{L}\\p{N}_])`,
    'iu'
  );
  return pattern.test(text);
}

function sceneVisualText(sceneVisual: SceneVisual | undefined): string {
  if (!sceneVisual) return '';
  const composition = sceneVisual.cameraComposition;
  const compositionText =
    typeof composition === 'string'
      ? composition
      : [
          composition.shot,
          ...composition.characters.flatMap((character) => [character.name, character.description]),
        ].join('\n');
  return [sceneVisual.setting, compositionText, sceneVisual.lighting].filter(Boolean).join('\n');
}

/**
 * Character references must cover every known character mentioned anywhere in sceneVisual,
 * not only rows in cameraComposition.characters[]. Relations such as "beside Emilia" or
 * "through Khomka's projection" are visible staging instructions too.
 */
export function collectSceneVisualCharacterNames(
  sceneVisual: SceneVisual | undefined,
  fallbackNames: string[],
  knownCharacters: KnownCharacterIdentity[]
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown, preserveOriginal = false) => {
    const clean = cleanName(value);
    if (!clean) return;
    const key = normalizedName(clean);
    const identityKey = crossScriptIdentityKey(clean);
    if (!key || seen.has(key) || (identityKey && seen.has(`identity:${identityKey}`))) return;
    seen.add(key);
    if (identityKey) seen.add(`identity:${identityKey}`);
    const original = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : clean;
    names.push(preserveOriginal && original ? original : clean);
  };

  for (const name of fallbackNames) push(name, true);

  const visualText = sceneVisualText(sceneVisual);
  if (!visualText) return names;

  for (const character of knownCharacters) {
    const canonicalName = cleanName(character.name);
    if (!canonicalName) continue;
    const aliases = [
      character.name,
      character.canonicalName,
      character.nameInStory,
      ...(Array.isArray(character.nameAliases) ? character.nameAliases : []),
    ].filter((name): name is string => typeof name === 'string');
    if (aliases.some((alias) => containsName(visualText, alias))) {
      push(canonicalName);
    }
  }

  return names;
}
