/**
 * Parse/serialize characterOutfits between string (LLM) and Record (image gen).
 * Preferred delimiters: newline or semicolon. Legacy single-line uses "Name: outfit. Name2: ..."
 * without splitting outfit prose on interior periods.
 */

import { stripCharacterIdFromName } from '@wondertales/shared';

/**
 * Find the first colon that separates "name" from "value" (not inside brackets like [ID: x]).
 */
export function findNameValueSeparator(s: string, start = 0): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

/**
 * End index for outfit value starting at `from`: stop at `;`, newline, or legacy ". NextName:" boundary.
 */
function findOutfitValueEnd(s: string, from: number): number {
  let min = s.length;
  const semi = s.indexOf(';', from);
  const nl = s.indexOf('\n', from);
  if (semi >= 0) min = Math.min(min, semi);
  if (nl >= 0) min = Math.min(min, nl);

  const re =
    /\.\s+([A-Za-zА-ЯІЇЄҐа-яіїєґ0-9][A-Za-zА-ЯІЇЄҐа-яіїєґ0-9\s\-]{0,98}?):\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index < from) continue;
    if (m.index >= min) break;
    const cand = m[1].trim();
    if (cand.length > 0 && cand.length <= 100 && !cand.includes('.')) {
      return m.index;
    }
  }
  return min;
}

function parseDelimitedSegments(rawSegments: string[]): Record<string, string> {
  const merged: string[] = [];
  for (const seg of rawSegments.map((s) => s.trim()).filter(Boolean)) {
    if (merged.length > 0 && findNameValueSeparator(seg) === -1) {
      merged[merged.length - 1] += ` ${seg}`;
    } else {
      merged.push(seg);
    }
  }
  const result: Record<string, string> = {};
  for (const segment of merged) {
    const colonIdx = findNameValueSeparator(segment);
    if (colonIdx === -1) continue;
    const name = segment.slice(0, colonIdx).trim();
    const outfit = segment.slice(colonIdx + 1).trim();
    if (name && outfit) result[name] = outfit;
  }
  return result;
}

function parseScanningFormat(s: string): Record<string, string> {
  const result: Record<string, string> = {};
  let pos = 0;
  const n = s.length;
  while (pos < n) {
    while (pos < n && /\s/.test(s[pos])) pos++;
    if (pos >= n) break;
    const colon = findNameValueSeparator(s, pos);
    if (colon === -1) break;
    const name = s.slice(pos, colon).trim();
    if (!name) {
      pos = colon + 1;
      continue;
    }
    const valueEnd = findOutfitValueEnd(s, colon + 1);
    const outfit = s.slice(colon + 1, valueEnd).trim();
    if (name && outfit) result[name] = outfit;
    pos = valueEnd;
    while (pos < n && /[.\s;]/.test(s[pos])) pos++;
  }
  return result;
}

/**
 * Parse characterOutfits string to Record for downstream use.
 * Handles multiline / semicolon-separated entries and legacy "Name: outfit. Name2: ..."
 * without truncating on dots inside the outfit description.
 */
export function parseCharacterOutfitsString(str: string): Record<string, string> {
  if (!str || typeof str !== 'string') return {};
  const trimmed = str.trim();
  if (!trimmed) return {};

  const normalized = trimmed.replace(/\r\n/g, '\n');

  if (/[;\n]/.test(normalized)) {
    return parseDelimitedSegments(normalized.split(/\n+|;\s*/));
  }

  return parseScanningFormat(normalized);
}

/**
 * Serialize Record to string for LLM output / fill fallback.
 */
export function serializeCharacterOutfitsToStr(record: Record<string, string>): string {
  if (!record || Object.keys(record).length === 0) return '';
  return Object.entries(record)
    .map(([name, outfit]) => `${name}: ${outfit}`)
    .join('. ');
}

/**
 * Resolve outfit text for a character name against a Record (keys may include [ID: …]).
 */
export function lookupOutfitForCharacterName(
  characterName: string,
  outfits?: Record<string, string>,
): string | undefined {
  if (!outfits || !characterName) return undefined;
  if (outfits[characterName]) return outfits[characterName];
  const base = stripCharacterIdFromName(characterName).trim();
  if (outfits[base]) return outfits[base];
  const lower = base.toLowerCase();
  for (const [k, v] of Object.entries(outfits)) {
    if (stripCharacterIdFromName(k).trim().toLowerCase() === lower) return v;
  }
  return undefined;
}

/** Canonical wardrobe row from story JSON (`outfits` array). */
export type StoryOutfitDefinition = { id: string; characterName: string; description: string };

/** LLM output: explicit binding (like environmentId → environments[].id). */
export type OutfitBinding = { characterName: string; outfitId: string };

/**
 * Convert structured outfitBindings[] to Record<characterName, outfitId> for resolveCharacterOutfits / merge.
 * @deprecated Legacy Director/text shape; prefer cameraCompositionOutfitsToRecord.
 */
export function outfitBindingsToRecord(
  bindings: Array<{ characterName?: string; outfitId?: string }> | undefined | null,
): Record<string, string> | undefined {
  if (!Array.isArray(bindings) || bindings.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const b of bindings) {
    const n = typeof b?.characterName === 'string' ? b.characterName.trim() : '';
    const id = typeof b?.outfitId === 'string' ? b.outfitId.trim() : '';
    if (n && id) out[n] = id;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Build name → outfitId from sceneVisual.cameraComposition.characters (each row: name, outfitId).
 */
export function cameraCompositionOutfitsToRecord(
  cameraComposition: unknown,
): Record<string, string> | undefined {
  if (!cameraComposition || typeof cameraComposition !== 'object') return undefined;
  const cam = cameraComposition as { characters?: unknown };
  if (!Array.isArray(cam.characters) || cam.characters.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const c of cam.characters) {
    if (!c || typeof c !== 'object') continue;
    const row = c as { name?: string; outfitId?: string };
    const n = typeof row.name === 'string' ? row.name.trim() : '';
    const id = typeof row.outfitId === 'string' ? row.outfitId.trim() : '';
    if (n && id) out[n] = id;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * After structured text generation: cameraComposition.characters[].outfitId → characterOutfitIds.
 * Drops legacy outfitBindings if present. Prefers camera rows over legacy bindings.
 */
export function normalizeOutfitBindingsOnEpisodeText(text: { scenes?: Array<Record<string, unknown>> }): void {
  if (!text?.scenes) return;
  for (const s of text.scenes) {
    const sv = s.sceneVisual as Record<string, unknown> | undefined;
    const fromCam = cameraCompositionOutfitsToRecord(sv?.cameraComposition);
    const fromBindings = outfitBindingsToRecord(
      s.outfitBindings as Array<{ characterName?: string; outfitId?: string }> | undefined,
    );
    const rec = fromCam ?? fromBindings;
    if (rec) s.characterOutfitIds = rec;
    delete s.outfitBindings;
  }
}

/**
 * Map scene.characterOutfitIds (name → outfit id) to name → wardrobe description using outfits[].
 */
export function resolveOutfitDescriptionsFromSceneIds(
  characterOutfitIds: Record<string, string> | undefined,
  outfits: StoryOutfitDefinition[] | undefined,
): Record<string, string> | undefined {
  if (!characterOutfitIds || !outfits?.length) return undefined;
  const byId = new Map(outfits.map((o) => [o.id, o]));
  const out: Record<string, string> = {};
  for (const [charName, oid] of Object.entries(characterOutfitIds)) {
    const row = byId.get(oid);
    if (row?.description?.trim()) out[charName] = row.description.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Resolve outfit id for a character from scene.characterOutfitIds keys (fuzzy name match). */
export function lookupOutfitIdForCharacterName(
  characterName: string,
  characterOutfitIds?: Record<string, string>,
): string | undefined {
  if (!characterOutfitIds || !characterName) return undefined;
  if (characterOutfitIds[characterName]) return characterOutfitIds[characterName];
  const base = stripCharacterIdFromName(characterName).trim();
  if (characterOutfitIds[base]) return characterOutfitIds[base];
  const lower = base.toLowerCase();
  for (const [k, v] of Object.entries(characterOutfitIds)) {
    if (stripCharacterIdFromName(k).trim().toLowerCase() === lower) return v;
  }
  return undefined;
}
