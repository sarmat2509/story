import anyAscii from 'any-ascii';
import type { CharacterData } from '@wondertales/shared';

export const TEMP_CHARACTER_REF_PREFIX = 'NEW_CH_';
export const TEMP_CHARACTER_REF_PATTERN = /^NEW_CH_[1-9][0-9]*$/;
export const CHARACTER_UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export type CharacterIdentityInput = Pick<
  CharacterData,
  'id' | 'name' | 'canonicalName' | 'nameAliases'
> & {
  characterRef?: string | null;
  type?: string;
};

export type CharacterIdentityEntry = {
  characterRef: string;
  characterId: string;
  displayName: string;
  canonicalName?: string;
  nameAliases: string[];
  type?: string;
};

export type CharacterIdentityRegistry = {
  byRef: Map<string, CharacterIdentityEntry>;
  refsByNameKey: Map<string, Set<string>>;
};

const RELATIONSHIP_TITLE_KEYS = new Set(
  [
    'dad',
    'daddy',
    'father',
    'papa',
    'mom',
    'mommy',
    'mama',
    'mother',
    'aunt',
    'auntie',
    'uncle',
    'grandma',
    'grandmother',
    'grandpa',
    'grandfather',
    'mr',
    'mister',
    'mrs',
    'ms',
    'miss',
    'dr',
    'tato',
    'batko',
    'matusia',
    'titka',
    'titonka',
    'diadko',
    'babusia',
    'didus',
    'papá',
    'padre',
    'mamá',
    'madre',
    'tía',
    'tia',
    'tío',
    'tio',
    'abuela',
    'abuelo',
    'señor',
    'senor',
    'señora',
    'senora',
    'père',
    'pere',
    'maman',
    'mère',
    'mere',
    'tante',
    'oncle',
    'mamie',
    'papi',
    'monsieur',
    'madame',
    'vater',
    'mutter',
    'onkel',
    'oma',
    'opa',
    'herr',
    'frau',
    'tata',
    'ojciec',
    'matka',
    'ciocia',
    'wujek',
    'babcia',
    'dziadek',
    'pan',
    'pani',
    'папа',
    'отец',
    'мама',
    'мать',
    'тетя',
    'дядя',
    'бабушка',
    'дедушка',
    'господин',
    'госпожа',
    'тато',
    'батько',
    'матуся',
    'тітка',
    'тітонька',
    'дядько',
    'бабуся',
    'дідусь',
    'пан',
    'пані',
  ].map((value) => identityNameKey(value))
);

export function normalizeCharacterRef(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isTemporaryCharacterRef(value: unknown): value is string {
  return TEMP_CHARACTER_REF_PATTERN.test(normalizeCharacterRef(value));
}

export function isPersistedCharacterRef(value: unknown): value is string {
  return CHARACTER_UUID_PATTERN.test(normalizeCharacterRef(value));
}

export function temporaryCharacterRef(index: number): string {
  return `${TEMP_CHARACTER_REF_PREFIX}${Math.max(1, Math.floor(index) + 1)}`;
}

export function characterRefForCharacter(character: {
  id?: string | null;
  characterRef?: string | null;
}): string {
  return normalizeCharacterRef(character.characterRef) || normalizeCharacterRef(character.id);
}

export function identityNameKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return anyAscii(value.normalize('NFKC'))
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function pushUniqueName(target: string[], value: unknown): void {
  if (typeof value !== 'string') return;
  const clean = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!clean) return;
  const key = identityNameKey(clean);
  if (!target.some((existing) => identityNameKey(existing) === key)) target.push(clean);
}

export function buildCharacterIdentityRegistry(
  characters: CharacterIdentityInput[]
): CharacterIdentityRegistry {
  const byRef = new Map<string, CharacterIdentityEntry>();
  const refsByNameKey = new Map<string, Set<string>>();

  for (const character of characters) {
    const characterId = normalizeCharacterRef(character.id);
    const characterRef = characterRefForCharacter(character);
    if (!characterId || !characterRef || !character.name?.trim()) continue;
    const aliases: string[] = [];
    pushUniqueName(aliases, character.name);
    pushUniqueName(aliases, character.canonicalName);
    for (const alias of character.nameAliases || []) pushUniqueName(aliases, alias);
    const entry: CharacterIdentityEntry = {
      characterRef,
      characterId,
      displayName: character.name.trim(),
      ...(character.canonicalName?.trim()
        ? { canonicalName: character.canonicalName.trim() }
        : {}),
      nameAliases: aliases,
      ...(character.type ? { type: character.type } : {}),
    };
    byRef.set(characterRef, entry);
    for (const alias of aliases) {
      const key = identityNameKey(alias);
      if (!key) continue;
      const refs = refsByNameKey.get(key) || new Set<string>();
      refs.add(characterRef);
      refsByNameKey.set(key, refs);
    }
  }

  return { byRef, refsByNameKey };
}

function relationshipBaseNameKey(value: unknown): string {
  const key = identityNameKey(value);
  if (!key) return '';
  const [first, ...rest] = key.split(' ');
  return first && rest.length > 0 && RELATIONSHIP_TITLE_KEYS.has(first) ? rest.join(' ') : '';
}

export function resolveCharacterRefByName(
  value: unknown,
  registry: CharacterIdentityRegistry
): { characterRef: string | null; reason: 'exact_alias' | 'relationship_alias' | 'none' | 'ambiguous' } {
  const exactKey = identityNameKey(value);
  const exactRefs = exactKey ? registry.refsByNameKey.get(exactKey) : undefined;
  if (exactRefs?.size === 1) {
    return { characterRef: [...exactRefs][0], reason: 'exact_alias' };
  }
  if (exactRefs && exactRefs.size > 1) {
    return { characterRef: null, reason: 'ambiguous' };
  }

  const baseKey = relationshipBaseNameKey(value);
  const relationshipRefs = baseKey ? registry.refsByNameKey.get(baseKey) : undefined;
  if (relationshipRefs?.size === 1) {
    return { characterRef: [...relationshipRefs][0], reason: 'relationship_alias' };
  }
  if (relationshipRefs && relationshipRefs.size > 1) {
    return { characterRef: null, reason: 'ambiguous' };
  }
  return { characterRef: null, reason: 'none' };
}

export function replaceTemporaryCharacterRefs(
  value: unknown,
  replacements: ReadonlyMap<string, string>
): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) replaceTemporaryCharacterRefs(item, replacements);
    return;
  }
  const record = value as Record<string, unknown>;
  const current = normalizeCharacterRef(record.characterRef);
  const replacement = replacements.get(current);
  if (replacement) record.characterRef = replacement;
  if (record.characterOutfitRefs && typeof record.characterOutfitRefs === 'object') {
    const outfitRefs = record.characterOutfitRefs as Record<string, unknown>;
    for (const [characterRef, outfitId] of Object.entries(outfitRefs)) {
      const persistedRef = replacements.get(characterRef);
      if (!persistedRef) continue;
      outfitRefs[persistedRef] = outfitId;
      delete outfitRefs[characterRef];
    }
  }
  for (const nested of Object.values(record)) replaceTemporaryCharacterRefs(nested, replacements);
}

function stripLegacyIdMarker(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.normalize('NFC').replace(/\s*\[ID:\s*[^\]]+\]/giu, '').trim();
}

function sanitizeGeneratedDisplayNames(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) sanitizeGeneratedDisplayNames(item);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const field of ['name', 'characterName', 'speaker']) {
    if (typeof record[field] === 'string') record[field] = stripLegacyIdMarker(record[field]);
  }
  for (const nested of Object.values(record)) sanitizeGeneratedDisplayNames(nested);
}

/**
 * Normalize a newly generated structured story/comic document before persistence.
 * Existing identities are UUID refs, genuinely new identities are declared once as NEW_CH_n,
 * and all nested characterRef values must point at a declaration.
 */
export function reconcileGeneratedCharacterIdentity(params: {
  document: Record<string, any>;
  existingCharacters: CharacterIdentityInput[];
}): Map<string, string> {
  const { document } = params;
  sanitizeGeneratedDisplayNames(document);
  const registry = buildCharacterIdentityRegistry(params.existingCharacters);
  const declarations = Array.isArray(document.characters) ? document.characters : [];
  const seenOriginalRefs = new Set<string>();
  const aliasReplacements = new Map<string, string>();

  for (const declaration of declarations) {
    const characterRef = normalizeCharacterRef(declaration?.characterRef);
    const name = typeof declaration?.name === 'string' ? declaration.name.trim() : '';
    if (!characterRef || !name) {
      throw new Error('Every generated characters[] row must include characterRef and name');
    }
    if (seenOriginalRefs.has(characterRef)) {
      throw new Error(`Duplicate characters[] declaration for characterRef "${characterRef}"`);
    }
    seenOriginalRefs.add(characterRef);

    if (registry.byRef.has(characterRef)) continue;
    if (!isTemporaryCharacterRef(characterRef)) {
      throw new Error(`Unknown characterRef "${characterRef}" in characters[]`);
    }

    const resolved = resolveCharacterRefByName(name, registry);
    if (resolved.reason === 'ambiguous') {
      throw new Error(`Ambiguous existing-character alias "${name}"`);
    }
    if (resolved.characterRef) aliasReplacements.set(characterRef, resolved.characterRef);
  }

  replaceTemporaryCharacterRefs(document, aliasReplacements);

  const declarationsByRef = new Map<string, any>();
  for (const declaration of declarations) {
    const characterRef = normalizeCharacterRef(declaration?.characterRef);
    if (!declarationsByRef.has(characterRef)) declarationsByRef.set(characterRef, declaration);
  }
  document.characters = [...declarationsByRef.values()];

  const knownRefs = new Set<string>(
    document.characters.map((character: any) => normalizeCharacterRef(character?.characterRef))
  );
  const outfitRefsById = new Map<string, string>();
  for (const outfit of Array.isArray(document.outfits) ? document.outfits : []) {
    const outfitId = typeof outfit?.id === 'string' ? outfit.id.trim() : '';
    const characterRef = normalizeCharacterRef(outfit?.characterRef);
    if (!outfitId || !characterRef) {
      throw new Error('Every generated outfits[] row must include id and characterRef');
    }
    if (outfitRefsById.has(outfitId)) throw new Error(`Duplicate outfit id "${outfitId}"`);
    outfitRefsById.set(outfitId, characterRef);
  }
  const visit = (value: unknown, path: string): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    const record = value as Record<string, unknown>;
    if ('characterRef' in record) {
      const characterRef = normalizeCharacterRef(record.characterRef);
      if (!characterRef) throw new Error(`Missing characterRef at ${path}`);
      if (!knownRefs.has(characterRef)) {
        throw new Error(`Undeclared characterRef "${characterRef}" at ${path}`);
      }
    }
    if ('outfitId' in record) {
      const outfitId = typeof record.outfitId === 'string' ? record.outfitId.trim() : '';
      const characterRef = normalizeCharacterRef(record.characterRef);
      const outfitCharacterRef = outfitRefsById.get(outfitId);
      if (!outfitId || !outfitCharacterRef || outfitCharacterRef !== characterRef) {
        throw new Error(`Invalid outfit binding "${outfitId}" at ${path}`);
      }
    }
    for (const [key, nested] of Object.entries(record)) visit(nested, `${path}.${key}`);
  };
  visit(document, 'result');
  return aliasReplacements;
}
