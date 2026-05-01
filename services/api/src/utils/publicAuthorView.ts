import type { PublicAuthorView } from '@wondertales/shared';

export interface PublicAuthorSource {
  id: string;
  displayName?: string | null;
  pseudonym?: string | null;
  avatarUrl?: string | null;
  aboutMe?: string | null;
}

function normalizeDisplayPart(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolvePublicAuthorDisplayName(
  author?: Pick<PublicAuthorSource, 'pseudonym' | 'displayName'> | null
): string {
  return (
    normalizeDisplayPart(author?.pseudonym) ??
    normalizeDisplayPart(author?.displayName) ??
    'Anonymous'
  );
}

export function buildPublicAuthorView(author: PublicAuthorSource): PublicAuthorView {
  return {
    id: author.id,
    displayName: resolvePublicAuthorDisplayName(author),
    avatarUrl: author.avatarUrl ?? null,
    aboutMe: author.aboutMe ?? null,
  };
}
