import { createHash } from 'node:crypto';
import anyAscii from 'any-ascii';
import { stripCharacterIdFromName } from '@wondertales/shared';
import { inferReferenceKind, type ReferenceImageKind } from '../utils/referenceImageKind';

export type ReferenceBindingKind = 'character' | 'environment' | 'outfit' | 'object';

export type ReferenceBindingInput = {
  referenceBindingId?: string | null;
  referenceKind?: ReferenceImageKind | null;
  source?: string | null;
  type?: string | null;
  characterName?: string | null;
  imageIndex?: number | null;
  environmentId?: string | null;
  referenceEnvironmentId?: string | null;
  outfitId?: string | null;
  storagePath?: string | null;
  instructionText?: string | null;
};

export function referenceBindingKind(ref: ReferenceBindingInput): ReferenceBindingKind {
  if (ref.source === 'environment' || ref.type === 'environment_reference') {
    return 'environment';
  }
  if (ref.source === 'outfit_plate' || ref.type === 'outfit_plate_reference') {
    return 'outfit';
  }
  if (ref.referenceKind === 'object') {
    return 'object';
  }
  if (inferReferenceKind(ref) === 'character') {
    return 'character';
  }
  return 'object';
}

function slugReferenceLabel(value: string | null | undefined, fallback: string): string {
  const stripped = stripCharacterIdFromName(String(value || '')).trim() || fallback;
  const ascii = anyAscii(stripped)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return ascii || fallback;
}

function shortStableHash(parts: Array<string | number | null | undefined>): string {
  const input = parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join('|');
  return createHash('sha1').update(input || 'reference').digest('hex').slice(0, 6).toUpperCase();
}

export function referenceBindingIdFor(ref: ReferenceBindingInput): string {
  const existing = String(ref.referenceBindingId || '').trim();
  if (existing) return existing;

  const kind = referenceBindingKind(ref);
  const hash = shortStableHash([
    kind,
    ref.characterName,
    ref.environmentId,
    ref.referenceEnvironmentId,
    ref.outfitId,
    ref.storagePath,
    ref.source,
    ref.type,
    ref.imageIndex,
  ]);

  if (kind === 'environment') {
    const label = slugReferenceLabel(
      ref.environmentId || ref.referenceEnvironmentId || ref.characterName,
      'LOCATION'
    );
    return `REF_ENV_${label}_${hash}`;
  }

  if (kind === 'outfit') {
    const character = slugReferenceLabel(ref.characterName, 'CHARACTER');
    const outfit = slugReferenceLabel(ref.outfitId || ref.storagePath, 'WARDROBE');
    return `REF_OUTFIT_${character}_${outfit}_${hash}`;
  }

  if (kind === 'character') {
    const character = slugReferenceLabel(ref.characterName, 'CHARACTER');
    return `REF_CH_${character}_${hash}`;
  }

  const label = slugReferenceLabel(ref.characterName || ref.environmentId, 'OBJECT');
  return `REF_OBJ_${label}_${hash}`;
}

export function ensureReferenceBindingId<T extends ReferenceBindingInput>(
  ref: T
): T & { referenceBindingId: string } {
  const bindingId = referenceBindingIdFor(ref);
  (ref as T & { referenceBindingId: string }).referenceBindingId = bindingId;
  return ref as T & { referenceBindingId: string };
}

export function referenceBindingLabel(
  ref: ReferenceBindingInput,
  imageIndex?: number | null
): string {
  const idx = imageIndex ?? ref.imageIndex;
  return idx ? `${referenceBindingIdFor(ref)} / Image ${idx}` : referenceBindingIdFor(ref);
}

function referenceDisplayName(ref: ReferenceBindingInput): string {
  return (
    stripCharacterIdFromName(ref.characterName || '').trim() ||
    ref.environmentId ||
    ref.referenceEnvironmentId ||
    'reference'
  );
}

export function formatReferenceBindingInstruction(
  ref: ReferenceBindingInput,
  imageIndex?: number | null
): string {
  const label = referenceBindingLabel(ref, imageIndex);
  const name = referenceDisplayName(ref);
  const kind = referenceBindingKind(ref);

  if (kind === 'environment') {
    return `${label}: Environment reference for "${name}". Reusable location structure, background objects, materials, and color continuity.`;
  }

  if (kind === 'outfit') {
    return `${label}: Outfit reference for "${name}". Wardrobe only: garments, shoes, and worn accessories. Do not use this reference for face, hair, body, age, species, silhouette, or identity.`;
  }

  if (kind === 'character') {
    return `${label}: Character identity reference for "${name}". This image is one character only. Use only ${referenceBindingIdFor(ref)} when the prompt asks for "${name}" or this REF id. Do not borrow body parts, clothes, colors, heads, species, silhouette, or facial traits from another reference.`;
  }

  return `${label}: Object reference for "${name}". Use only for the named object or prop.`;
}

export function buildReferenceBindingRegistry(
  refs: ReferenceBindingInput[] | undefined,
  options: { title?: string } = {}
): string {
  if (!refs || refs.length === 0) return '';
  const rows = refs.map((ref, index) => {
    const imageIndex = ref.imageIndex ?? index + 1;
    const id = referenceBindingIdFor({ ...ref, imageIndex });
    const kind = referenceBindingKind(ref);
    const display = referenceDisplayName(ref);
    if (kind === 'outfit') {
      return `- ${id} = Image ${imageIndex} = outfit reference for "${display}" (wardrobe only).`;
    }
    if (kind === 'environment') {
      return `- ${id} = Image ${imageIndex} = environment reference for "${display}".`;
    }
    if (kind === 'character') {
      return `- ${id} = Image ${imageIndex} = character identity reference for "${display}".`;
    }
    return `- ${id} = Image ${imageIndex} = object reference for "${display}".`;
  });
  return `${options.title ?? 'REFERENCE BINDING REGISTRY'}:\n${rows.join('\n')}`;
}

function normalizedName(value?: string | null): string {
  return stripCharacterIdFromName(value || '').trim().toLowerCase();
}

export function findCharacterReferenceBinding(
  characterName: string,
  refs: ReferenceBindingInput[] | undefined
): ReferenceBindingInput | undefined {
  const target = normalizedName(characterName);
  if (!target || !refs) return undefined;
  return refs.find(
    (ref) =>
      referenceBindingKind(ref) === 'character' &&
      normalizedName(ref.characterName) === target
  );
}

export function findOutfitReferenceBinding(
  characterName: string,
  refs: ReferenceBindingInput[] | undefined
): ReferenceBindingInput | undefined {
  const target = normalizedName(characterName);
  if (!target || !refs) return undefined;
  return refs.find(
    (ref) =>
      referenceBindingKind(ref) === 'outfit' &&
      normalizedName(ref.characterName) === target
  );
}

export function findEnvironmentReferenceBinding(
  environment: { id?: string | null; name?: string | null } | undefined,
  refs: ReferenceBindingInput[] | undefined
): ReferenceBindingInput | undefined {
  if (!environment || !refs) return undefined;
  const targetId = normalizedName(environment.id);
  const targetName = normalizedName(environment.name);
  return refs.find((ref) => {
    if (referenceBindingKind(ref) !== 'environment') return false;
    const refEnv = normalizedName(ref.environmentId || ref.referenceEnvironmentId);
    const refName = normalizedName(ref.characterName);
    return (
      (!!targetId && (refEnv === targetId || refName === targetId)) ||
      (!!targetName && (refEnv === targetName || refName === targetName))
    );
  });
}
