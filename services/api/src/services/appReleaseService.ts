import {
  AppReleaseInputSchema,
  normalizePublicSeoLocale,
  type AppReleaseInput,
  type PublicSeoLocale,
} from '@wondertales/shared';
import { getAppReleaseRepository } from '../repositories';
import { invalidateSitemapCache } from './sitemapService';

export class AppReleaseServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = 'AppReleaseServiceError';
  }
}

export async function listPublishedAppReleases(locale?: string | null) {
  const normalizedLocale: PublicSeoLocale = normalizePublicSeoLocale(locale);
  return getAppReleaseRepository().listPublished(normalizedLocale);
}

export async function listAdminAppReleases() {
  return getAppReleaseRepository().listAdmin();
}

export async function getAdminAppRelease(id: string) {
  return getAppReleaseRepository().findAdminById(id);
}

function parseInput(input: unknown): AppReleaseInput {
  const parsed = AppReleaseInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppReleaseServiceError(
      'INVALID_RELEASE',
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    );
  }
  return parsed.data;
}

export async function createAdminAppRelease(input: unknown, actorUserId: string) {
  const release = await getAppReleaseRepository().create(parseInput(input), actorUserId);
  if (release.status === 'published') void invalidateSitemapCache();
  return release;
}

export async function updateAdminAppRelease(id: string, input: unknown, actorUserId: string) {
  const release = await getAppReleaseRepository().update(id, parseInput(input), actorUserId);
  if (!release) {
    throw new AppReleaseServiceError('RELEASE_NOT_FOUND', 'App release not found', 404);
  }
  void invalidateSitemapCache();
  return release;
}
