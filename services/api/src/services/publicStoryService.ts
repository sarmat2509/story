/**
 * Public Story Service
 * Builds StoryPublicView for GET /api/v1/public/stories and SSR
 */

import sharp from 'sharp';
import { db } from '../db';
import { audioAssets, assets } from '../db/schema';
import type { Story } from '../db/schema';
import { and, eq, desc, isNull } from 'drizzle-orm';
import { getChildProfileRepository, getStoryRepository, getAlignmentRepository, getUserRepository } from '../repositories';
import { enrichAllStoriesWithImages } from './storyOrchestrationService';
import { loadStoryCoverAssets } from './storyCoverService';
import { getAssetStorageService } from './assetStorageService';
import { logger } from '../utils/logger';
import { stripAllTags } from '../utils/audioTags';
import { config } from '../config';
import { versionPublicIconAsset } from '../ssr/publicAssetUrls';
import { getReadingTimeMinutes } from '@wondertales/shared';
import { normalizeAssetStoragePath } from './entityAssetCleanupService';
import {
  buildPublicAuthorView,
  type PublicAuthorSource,
} from '../utils/publicAuthorView';
import type {
  AlignmentData,
  PublicAuthorView,
  StoryPublicView,
  StoryAudioMetadata,
} from '@wondertales/shared';

export function isValidPublicAuthorId(authorId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    authorId
  );
}

function getStoryAuthorId(story: any): string {
  return story.authorType === 'child' && story.authorChildProfileId
    ? story.authorChildProfileId
    : story.userId;
}

function getChildAuthorAvatarUrl(child: {
  turnaroundSheet?: unknown;
  referencePhotos?: unknown;
}): string | null {
  const turnaroundSheet = child.turnaroundSheet as { frontUrl?: string; url?: string } | null;
  if (turnaroundSheet?.frontUrl) return turnaroundSheet.frontUrl;
  if (turnaroundSheet?.url) return turnaroundSheet.url;
  const referencePhotos = child.referencePhotos as Array<{ url?: string }> | null;
  return referencePhotos?.find((photo) => photo?.url)?.url ?? null;
}

function buildChildAuthorSource(child: {
  id: string;
  name: string;
  authorPseudonym?: string | null;
  authorAboutMe?: string | null;
  turnaroundSheet?: unknown;
  referencePhotos?: unknown;
}): PublicAuthorSource {
  return {
    id: child.id,
    displayName: child.name,
    pseudonym: child.authorPseudonym ?? null,
    aboutMe: child.authorAboutMe ?? null,
    avatarUrl: getChildAuthorAvatarUrl(child),
  };
}

async function getPublicAuthorForStory(story: any): Promise<PublicAuthorView | null> {
  if (story.authorType === 'child' && story.authorChildProfileId) {
    const child = await getChildProfileRepository().findPublicChildAuthorById(story.authorChildProfileId);
    return child ? buildPublicAuthorView(buildChildAuthorSource(child)) : null;
  }
  return getPublicAuthorById(story.userId);
}

async function getAudioUrlAndAlignment(storyId: string): Promise<{ url: string | null; alignment?: any; duration?: number }> {
  const [row] = await db
    .select({ audioAsset: audioAssets, asset: assets })
    .from(audioAssets)
    .innerJoin(assets, eq(audioAssets.assetId, assets.id))
    .where(and(
      eq(audioAssets.storyId, storyId),
      eq(audioAssets.status, 'completed'),
      eq(audioAssets.isFinal, true),
      isNull(audioAssets.sceneGroupIndex)
    ))
    .orderBy(desc(audioAssets.createdAt))
    .limit(1);

  if (!row) return { url: null };

  const audioUrl = `/api/v1/assets/${row.asset.storagePath}`;
  const metadata = (row.audioAsset as { audioMetadata?: StoryAudioMetadata | null }).audioMetadata;
  // Prefer the dedicated durationSeconds column; fall back to totalDuration in the JSON metadata
  const durationFromCol = row.audioAsset.durationSeconds != null
    ? parseFloat(row.audioAsset.durationSeconds.toString())
    : undefined;
  const duration = durationFromCol ?? (typeof metadata?.totalDuration === 'number' ? metadata.totalDuration : undefined);

  // Phase 2: Prefer alignments table, fallback to audio_metadata for migrated data
  const alignmentRow = await getAlignmentRepository().findByStoryId(row.audioAsset.storyId);
  const alignment = alignmentRow?.data ?? metadata?.alignment;

  return { url: audioUrl, alignment, duration };
}

function getOgImageUrl(story: any, apiBase: string, slugOrToken: string, isUnlisted: boolean): string {
  const scenes = Array.isArray(story.scenes) ? story.scenes : [];
  const hasSceneImage = scenes.some((s: any) => s?.image?.url ?? s?.imageUrl);
  const hasCoverImage = !!story.coverAssetId || !!story.coverImageUrl;
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || '';
  if (hasCoverImage || hasSceneImage) {
    return `${webAppUrl}/share-card/${isUnlisted ? `u/${slugOrToken}` : slugOrToken}`;
  }
  return `${webAppUrl}${versionPublicIconAsset('/favicon.png')}`;
}

function appendUnlistedShareToken(url: string | null, shareToken?: string): string | null {
  if (!url || !shareToken || !String(url).includes('/api/v1/assets/')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}shareToken=${encodeURIComponent(shareToken)}`;
}

export async function buildStoryPublicView(
  story: any,
  slug: string,
  options?: { shareToken?: string }
): Promise<StoryPublicView> {
  const apiBase = config.web?.apiPublicUrl?.replace(/\/$/, '') || '';
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || '';

  const enrichedScenesMap = await enrichAllStoriesWithImages([
    { id: story.id, scenes: (story.scenes as any[]) || [] },
  ]);
  const enrichedScenes = enrichedScenesMap.get(story.id) || story.scenes || [];
  const scenes = Array.isArray(enrichedScenes) ? enrichedScenes : [];

  const { url: audioUrl, alignment, duration } = await getAudioUrlAndAlignment(story.id);

  const shareUrl = options?.shareToken
    ? `${webAppUrl}/u/${options.shareToken}`
    : `${webAppUrl}/stories/${slug}`;
  const slugOrToken = options?.shareToken ?? slug;
  const isUnlisted = !!options?.shareToken;
  const ogImageUrl = getOgImageUrl({ ...story, scenes }, apiBase, slugOrToken, isUnlisted);

  const formattedScenes = scenes.map((s: any) => {
    const imgPath = s.image?.url ?? s.imageUrl;
    const imageUrl = imgPath
      ? (String(imgPath).startsWith('http') ? imgPath : `/api/v1/assets/${String(imgPath).replace(/^\/api\/v1\/assets\//, '')}`)
      : null;
    return {
      sceneId: s.sceneId,
      text: stripAllTags(s.text || ''),
      imageUrl: appendUnlistedShareToken(imageUrl, options?.shareToken),
    };
  });

  const metadata = (story.metadata as Record<string, unknown> | null) || {};
  const author = await getPublicAuthorForStory(story);
  return {
    id: story.id,
    title: story.title,
    fullText: stripAllTags(story.fullText || ''),
    ...(metadata.seoDescription && typeof metadata.seoDescription === 'string' && { seoDescription: metadata.seoDescription }),
    // Artifact collection is owner-only. Public story payloads keep the prose readable
    // but omit artifact metadata, labels, text segment markers, and collection affordances.
    scenes: formattedScenes,
    ...(author && { author }),
    authorDisplayName: author?.displayName || 'Anonymous',
    publishedAt: story.publishedAt ? story.publishedAt.toISOString?.() ?? String(story.publishedAt) : null,
    audio: audioUrl
      ? {
          url: appendUnlistedShareToken(audioUrl, options?.shareToken) || audioUrl,
          ...(alignment && { alignment }),
          ...(duration != null && { duration }),
        }
      : undefined,
    share: {
      url: shareUrl,
      ogImageUrl,
    },
    publicRenderVersion: story.publicRenderVersion ?? 1,
    ...(buildRatingFromStory(story)),
  };
}

function buildRatingFromStory(story: { ratingSum?: number | null; ratingCount?: number | null }): { rating?: { avg: number; count: number } } {
  const count = story.ratingCount ?? 0;
  if (count === 0) return {};
  const sum = story.ratingSum ?? 0;
  return {
    rating: { avg: sum / count, count },
  };
}

export async function getPublicStoryBySlug(slug: string): Promise<StoryPublicView | null> {
  const storyRepo = getStoryRepository();
  const story = await storyRepo.findByPublishedSlug(slug);
  if (!story) return null;
  return buildStoryPublicView(story, slug);
}

/**
 * Load raw story for share-card by slug (public) or token (unlisted). Returns null if not found.
 */
export async function getStoryForShareCard(slugOrToken: string, isUnlisted: boolean): Promise<Story | null> {
  const storyRepo = getStoryRepository();
  if (isUnlisted) {
    return storyRepo.findByShareToken(slugOrToken);
  }
  return storyRepo.findByPublishedSlug(slugOrToken);
}

/** Minimal story shape needed for share-card. */
interface StoryForShareCard {
  id: string;
  coverAssetId?: string | null;
  scenes: unknown;
}

/**
 * Get share-card image as 1200×630 JPEG buffer. Returns null if no scene image.
 */
export async function getShareCardImageBuffer(
  story: StoryForShareCard,
  _slugOrToken: string,
  _isUnlisted: boolean
): Promise<Buffer | null> {
  const coverByStoryId = await loadStoryCoverAssets([
    { id: story.id, coverAssetId: story.coverAssetId ?? null },
  ]);
  const storagePath = coverByStoryId.get(story.id)?.storagePath;
  if (!storagePath) return null;

  try {
    const assetStorage = getAssetStorageService();
    const buffer = await assetStorage.getAssetByPath(storagePath);
    const resized = await sharp(buffer)
      .resize(1200, 630, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return resized;
  } catch (err) {
    logger.warn({ err, storyId: story.id, storagePath }, 'Share-card image resize failed');
    return null;
  }
}

export async function getPublicStoryByShareToken(token: string): Promise<StoryPublicView | null> {
  const storyRepo = getStoryRepository();
  const story = await storyRepo.findByShareToken(token);
  if (!story) return null;
  return buildStoryPublicView(story, story.publishedSlug || `u-${token}`, { shareToken: token });
}

/**
 * Get alignment for a published story by slug. Returns null if not found, not public, or no alignment.
 * Used by GET /api/v1/public/stories/:slug/alignment.
 */
export async function getAlignmentForPublicStory(slug: string): Promise<AlignmentData | null> {
  const storyRepo = getStoryRepository();
  const story = await storyRepo.findByPublishedSlug(slug);
  if (!story) return null;

  const alignmentRepo = getAlignmentRepository();
  const row = await alignmentRepo.findByStoryId(story.id);
  if (row?.data) return row.data;

  // Fallback: alignment in audio_metadata (pre-migration)
  const metadata = story.audioMetadata as any;
  return metadata?.alignment ?? null;
}

export interface PublicStoryListItem {
  id: string;
  title: string;
  language: string;
  ageGroup: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  coverAssetId: string | null;
  coverImageUrl: string | null;
  coverThumbnailUrl: string | null;
  publishedAt: string | null;
  publishedSlug: string;
  scenes: Array<{ sceneId: number; text: string; imageUrl: string | null }>;
  audioMetadata?: StoryAudioMetadata | null;
  hasAudio: boolean;
  scenarioCardId: string | null;
  shareUrl: string;
  rating?: { avg: number; count: number };
}

export async function listPublicStories(options: {
  limit?: number;
  offset?: number;
  hasAudio?: boolean;
  scenarioCardId?: string;
  language?: string;
  excludeLanguage?: string;
  ageGroup?: string;
  readingTimeMin?: number;
  readingTimeMax?: number;
  authorId?: string;
  showOnHomePage?: boolean;
}): Promise<{ items: PublicStoryListItem[]; total: number }> {
  const { limit = 20, offset = 0, hasAudio, scenarioCardId, language, excludeLanguage, ageGroup, readingTimeMin, readingTimeMax, authorId, showOnHomePage } = options;
  const storyRepo = getStoryRepository();
  const filterOpts = { hasAudio, scenarioCardId, language, excludeLanguage, ageGroup, readingTimeMin, readingTimeMax, authorId, showOnHomePage };
  const [stories, total] = await Promise.all([
    storyRepo.listPublished({ limit, offset, ...filterOpts }),
    storyRepo.countPublished(filterOpts),
  ]);
  const userAuthorIds = [...new Set(
    stories
      .filter((story) => story.authorType !== 'child' || !story.authorChildProfileId)
      .map((story) => story.userId)
  )];
  const childAuthorIds = [...new Set(
    stories
      .filter((story) => story.authorType === 'child' && story.authorChildProfileId)
      .map((story) => story.authorChildProfileId!)
  )];
  const [authors, childAuthors] = await Promise.all([
    getUserRepository().findPublicAuthorsByIds(userAuthorIds),
    getChildProfileRepository().findPublicChildAuthorsByIds(childAuthorIds),
  ]);
  const authorById = new Map<string, PublicAuthorView>([
    ...authors.map((author) => [author.id, buildPublicAuthorView(author)] as const),
    ...childAuthors.map((author) => [author.id, buildPublicAuthorView(buildChildAuthorSource(author))] as const),
  ]);

  const [enrichedScenesMap, coverByStoryId] = await Promise.all([
    enrichAllStoriesWithImages(
      stories.map(s => ({ id: s.id, scenes: (s.scenes as any[]) || [] }))
    ),
    loadStoryCoverAssets(
      stories.map((story) => ({ id: story.id, coverAssetId: story.coverAssetId }))
    ),
  ]);

  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || '';

  const items: PublicStoryListItem[] = stories
    .filter(s => s.publishedSlug)
    .map(s => {
      const enrichedScenes = enrichedScenesMap.get(s.id) || s.scenes || [];
      const scenes = Array.isArray(enrichedScenes) ? enrichedScenes : [];
      const scenarioCardId = (s as any).scenarioCardId ?? null;
      const authorId = getStoryAuthorId(s);
      const author = authorById.get(authorId);
      const cover = coverByStoryId.get(s.id);
      const normalizedScenes = scenes.map((sc: any) => {
        const imgPath = sc.image?.url ?? sc.imageUrl;
        const imageUrl = imgPath
          ? (String(imgPath).startsWith('http') ? imgPath : `/api/v1/assets/${String(imgPath).replace(/^\/api\/v1\/assets\//, '')}`)
          : null;
        return {
          sceneId: sc.sceneId,
          text: stripAllTags(sc.text || ''),
          imageUrl,
        };
      });
      return {
        id: s.id,
        title: s.title,
        language: s.language,
        ageGroup: s.ageGroup,
        authorId,
        authorDisplayName: author?.displayName || 'Anonymous',
        authorAvatarUrl: author?.avatarUrl ?? null,
        coverAssetId: cover?.assetId ?? null,
        coverImageUrl: cover?.imageUrl ?? null,
        coverThumbnailUrl: cover?.thumbnailUrl ?? null,
        publishedAt: s.publishedAt ? s.publishedAt.toISOString?.() ?? String(s.publishedAt) : null,
        publishedSlug: s.publishedSlug!,
        scenes: normalizedScenes,
        audioMetadata: s.audioMetadata,
        hasAudio: !!s.audioMetadata,
        scenarioCardId: scenarioCardId ?? null,
        shareUrl: `${webAppUrl}/stories/${s.publishedSlug}`,
        ...buildRatingFromStory(s),
      };
    });

  return { items, total };
}

export async function listPublicStoriesForLocaleCatalog(options: {
  locale: string;
  limit?: number;
}): Promise<{
  items: PublicStoryListItem[];
  total: number;
  fallbackStartIndex: number | null;
}> {
  const limit = options.limit ?? 24;
  const locale = options.locale.slice(0, 2).toLowerCase();
  const primary = await listPublicStories({ limit, offset: 0, language: locale });
  const remaining = Math.max(0, limit - primary.items.length);
  const fallback = await listPublicStories({
    limit: remaining,
    offset: 0,
    excludeLanguage: locale,
  });

  return {
    items: [...primary.items, ...fallback.items],
    total: primary.total + fallback.total,
    fallbackStartIndex: fallback.items.length > 0 ? primary.items.length : null,
  };
}

export async function getPublicAuthorById(authorId: string): Promise<PublicAuthorView | null> {
  if (!isValidPublicAuthorId(authorId)) return null;
  const childAuthor = await getChildProfileRepository().findPublicChildAuthorById(authorId);
  if (childAuthor) return buildPublicAuthorView(buildChildAuthorSource(childAuthor));
  const author = await getUserRepository().findPublicAuthorById(authorId);
  if (!author) return null;
  return buildPublicAuthorView(author);
}

export async function isPublicAuthorAvatarPath(
  authorId: string,
  storagePath: string
): Promise<boolean> {
  if (!isValidPublicAuthorId(authorId)) return false;

  const childAuthor = await getChildProfileRepository().findPublicChildAuthorById(authorId);
  const userAuthor = childAuthor ? null : await getUserRepository().findPublicAuthorById(authorId);
  const avatarUrl = childAuthor ? getChildAuthorAvatarUrl(childAuthor) : userAuthor?.avatarUrl;
  const avatarPath =
    typeof avatarUrl === 'string' ? normalizeAssetStoragePath(avatarUrl) : null;

  if (!avatarPath || avatarPath !== storagePath) return false;

  const publicStoryCount = await getStoryRepository().countPublished({ authorId });
  return publicStoryCount > 0;
}
