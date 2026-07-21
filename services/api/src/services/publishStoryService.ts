/**
 * Publish Story Service
 * Handles story publication and slug generation.
 * SSR HTML is rendered on-demand via GET /ssr/stories/:slug (Redis cache).
 */

import { getCharacterRepository, getStoryRepository } from '../repositories';
import { addPublishedSlug, incrementLandingRenderVersion, removePublishedSlug } from '../ssr/storyCache';
import { invalidateSitemapCache } from './sitemapService';
import { config } from '../config';
import { logger } from '../utils/logger';
import { assertStoryPublishSafety } from './storyPublishSafetyService';
import { resolveStoryCoverAssetId, validateStoryCoverAssetId } from './storyCoverService';
import crypto from 'crypto';
import anyAscii from 'any-ascii';
import { syncChildProfileCharactersForUser } from './childProfileService';

/**
 * Slugify title: lowercase, transliterate, replace non-alphanumeric with hyphens.
 */
function slugify(title: string): string {
  const ascii = anyAscii(title);
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'story';
}

/**
 * Generate short random ID (8 chars, url-safe).
 */
function shortId(): string {
  return crypto.randomBytes(6).toString('base64url');
}

/**
 * Generate unique published slug. On collision, append shortId.
 */
async function generateUniqueSlug(baseSlug: string): Promise<string> {
  const repo = getStoryRepository();
  let slug = baseSlug;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const existing = await repo.findByPublishedSlug(slug);
    if (!existing) return slug;
    slug = `${baseSlug}-${shortId()}`;
    attempts++;
  }

  return `${baseSlug}-${shortId()}`;
}

export type PublishVisibility = 'public' | 'unlisted';

export interface PublishResult {
  slug: string | null;
  shareToken: string | null;
  shareUrl: string;
  visibility: PublishVisibility;
  publishedStoriesCount?: number;
}

export class PublishStoryError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'PublishStoryError';
  }
}

export interface UnpublishStoryUpdate {
  isPublished: false;
  publishedAt: null;
  publishedSlug: null;
  authorDisplayName: null;
  authorType: 'user';
  authorChildProfileId: null;
  visibility: null;
  shareToken: null;
  publishCharacters: false;
  showOnHomePage?: false;
}

export function buildUnpublishStoryUpdate(story: { showOnHomePage?: boolean | null }): UnpublishStoryUpdate {
  return {
    isPublished: false,
    publishedAt: null,
    publishedSlug: null,
    authorDisplayName: null,
    authorType: 'user',
    authorChildProfileId: null,
    visibility: null,
    shareToken: null,
    publishCharacters: false,
    ...(story.showOnHomePage === true ? { showOnHomePage: false } : {}),
  };
}

/**
 * Publish a story. Sets published_at, published_slug or share_token.
 * visibility: 'public' = in catalog (slug), 'unlisted' = by link only (share_token).
 * Returns shareUrl for immediate share sheet.
 */
export async function publishStory(
  storyId: string,
  userId: string,
  visibility: PublishVisibility = 'public',
  requestedCoverAssetId?: string | null,
  publishCharacters = true
): Promise<PublishResult | null> {
  const storyRepo = getStoryRepository();

  const story = await storyRepo.findByIdAndUser(storyId, userId);
  if (!story) return null;
  await assertStoryPublishSafety(story, visibility);
  const authorUpdate = story.createdByMode === 'child' && story.createdByChildProfileId
    ? { authorType: 'child' as const, authorChildProfileId: story.createdByChildProfileId }
    : { authorType: 'user' as const, authorChildProfileId: null };

  const webAppUrl = config.web.webAppUrl.replace(/\/$/, '');
  const currentVisibility = story.visibility || (story.publishedSlug ? 'public' : 'unlisted');
  const resolvedCoverAssetId = requestedCoverAssetId
    ? await validateStoryCoverAssetId(storyId, requestedCoverAssetId)
    : story.coverAssetId ?? await resolveStoryCoverAssetId(storyId);
  if (requestedCoverAssetId && !resolvedCoverAssetId) {
    throw new PublishStoryError(
      400,
      'INVALID_COVER_ASSET',
      'Cover asset must be a completed final scene image for this story'
    );
  }
  const coverUpdate =
    resolvedCoverAssetId && resolvedCoverAssetId !== story.coverAssetId
      ? { coverAssetId: resolvedCoverAssetId }
      : {};

  if (publishCharacters) {
    await ensureChildCharactersAreLinked(story);
  }

  // Already published with same visibility - return existing URL
  if (story.isPublished && currentVisibility === visibility) {
    const sharingChanged = story.publishCharacters !== publishCharacters;
    if (Object.keys(coverUpdate).length > 0 || sharingChanged) {
      await storyRepo.updateStory(storyId, {
        ...coverUpdate,
        publishCharacters,
      });
      await storyRepo.incrementPublicRenderVersion(storyId);
    }

    const publishedStoriesCount = await storyRepo.countPublishedByUser(userId);
    if (visibility === 'public' && story.publishedSlug) {
      return {
        slug: story.publishedSlug,
        shareToken: null,
        shareUrl: `${webAppUrl}/stories/${story.publishedSlug}`,
        visibility: 'public',
        publishedStoriesCount,
      };
    }
    if (visibility === 'unlisted' && story.shareToken) {
      return {
        slug: null,
        shareToken: story.shareToken,
        shareUrl: `${webAppUrl}/u/${story.shareToken}`,
        visibility: 'unlisted',
        publishedStoriesCount,
      };
    }
  }

  if (visibility === 'unlisted') {
    const token = shortId() + shortId(); // 16 chars
    const shouldClearHomePageFlag = story.showOnHomePage === true;
    await storyRepo.updateStory(storyId, {
      isPublished: true,
      publishedAt: new Date(),
      publishedSlug: null,
      visibility: 'unlisted',
      shareToken: token,
      publishCharacters,
      ...authorUpdate,
      ...coverUpdate,
      ...(shouldClearHomePageFlag ? { showOnHomePage: false } : {}),
    });
    await storyRepo.incrementPublicRenderVersion(storyId);
    if (story.publishedSlug) {
      await removePublishedSlug(story.publishedSlug);
      await invalidateSitemapCache();
    }
    if (shouldClearHomePageFlag) {
      await incrementLandingRenderVersion();
    }

    logger.info({ storyId, shareToken: token, userId }, 'Story published (unlisted)');

    const publishedStoriesCount = await storyRepo.countPublishedByUser(userId);

    return {
      slug: null,
      shareToken: token,
      shareUrl: `${webAppUrl}/u/${token}`,
      visibility: 'unlisted',
      publishedStoriesCount,
    };
  }

  const baseSlug = slugify(story.title);
  const slug = await generateUniqueSlug(baseSlug);

  await storyRepo.updateStory(storyId, {
    isPublished: true,
    publishedAt: new Date(),
    publishedSlug: slug,
    visibility: 'public',
    shareToken: null,
    publishCharacters,
    ...authorUpdate,
    ...coverUpdate,
  });
  await storyRepo.incrementPublicRenderVersion(storyId);
  await addPublishedSlug(slug);
  await invalidateSitemapCache();

  logger.info({ storyId, slug, userId }, 'Story published (public)');

  const publishedStoriesCount = await storyRepo.countPublishedByUser(userId);

  return {
    slug,
    shareToken: null,
    shareUrl: `${webAppUrl}/stories/${slug}`,
    visibility: 'public',
    publishedStoriesCount,
  };
}

async function ensureChildCharactersAreLinked(story: {
  id: string;
  userId: string;
  storyRequestId?: string | null;
  childProfileId?: string | null;
}): Promise<void> {
  const request = story.storyRequestId
    ? await getStoryRepository().findRequestById(story.storyRequestId)
    : null;
  const selected = Array.isArray(request?.selectedChildren)
    ? request.selectedChildren.filter((id): id is string => typeof id === 'string')
    : [];
  const childProfileIds = [...new Set([
    ...selected,
    ...(story.childProfileId ? [story.childProfileId] : []),
  ])];
  if (childProfileIds.length === 0) return;

  await syncChildProfileCharactersForUser(story.userId);
  const mirrors = await Promise.all(
    childProfileIds.map((childProfileId) =>
      getCharacterRepository().findByChildProfileId(story.userId, childProfileId)
    )
  );
  await getStoryRepository().createStoryCharacters(
    mirrors
      .filter((character): character is NonNullable<typeof character> => !!character)
      .map((character) => ({ storyId: story.id, characterId: character.id, role: 'protagonist' }))
  );
}

/**
 * Unpublish a story. Clears published fields.
 */
export async function unpublishStory(storyId: string, userId: string): Promise<boolean> {
  const storyRepo = getStoryRepository();
  const story = await storyRepo.findByIdAndUser(storyId, userId);
  if (!story) return false;

  const slug = story.publishedSlug;
  const shouldClearHomePageFlag = story.showOnHomePage === true;

  await storyRepo.updateStory(storyId, buildUnpublishStoryUpdate(story));

  if (slug) {
    await storyRepo.incrementPublicRenderVersion(storyId);
    await removePublishedSlug(slug);
    await invalidateSitemapCache();
  }
  if (shouldClearHomePageFlag) {
    await incrementLandingRenderVersion();
  }

  logger.info({ storyId, slug, userId }, 'Story unpublished');
  return true;
}
