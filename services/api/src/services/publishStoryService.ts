/**
 * Publish Story Service
 * Handles story publication and slug generation.
 * SSR HTML is rendered on-demand via GET /ssr/stories/:slug (Redis cache).
 */

import { getStoryRepository } from '../repositories';
import { addPublishedSlug, incrementLandingRenderVersion, removePublishedSlug } from '../ssr/storyCache';
import { invalidateSitemapCache } from './sitemapService';
import { config } from '../config';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import anyAscii from 'any-ascii';

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

/**
 * Publish a story. Sets published_at, published_slug or share_token.
 * visibility: 'public' = in catalog (slug), 'unlisted' = by link only (share_token).
 * Returns shareUrl for immediate share sheet.
 */
export async function publishStory(
  storyId: string,
  userId: string,
  visibility: PublishVisibility = 'public',
  shareCardSceneId?: number
): Promise<PublishResult | null> {
  const storyRepo = getStoryRepository();

  const story = await storyRepo.findByIdAndUser(storyId, userId);
  if (!story) return null;

  const webAppUrl = config.web.webAppUrl.replace(/\/$/, '');
  const currentVisibility = story.visibility || (story.publishedSlug ? 'public' : 'unlisted');

  // Already published with same visibility - return existing URL
  if (story.isPublished && currentVisibility === visibility) {
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
      ...(shouldClearHomePageFlag ? { showOnHomePage: false } : {}),
      ...(shareCardSceneId != null && { shareCardSceneId }),
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
    ...(shareCardSceneId != null && { shareCardSceneId }),
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

/**
 * Unpublish a story. Clears published fields.
 */
export async function unpublishStory(storyId: string, userId: string): Promise<boolean> {
  const storyRepo = getStoryRepository();
  const story = await storyRepo.findByIdAndUser(storyId, userId);
  if (!story) return false;

  const slug = story.publishedSlug;
  const shouldClearHomePageFlag = story.showOnHomePage === true;

  await storyRepo.updateStory(storyId, {
    isPublished: false,
    publishedAt: null,
    publishedSlug: null,
    authorDisplayName: null,
    visibility: 'public',
    shareToken: null,
    ...(shouldClearHomePageFlag ? { showOnHomePage: false } : {}),
  });

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
