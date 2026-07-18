/**
 * Public Story Service
 * Builds StoryPublicView for GET /api/v1/public/stories and SSR
 */

import sharp from 'sharp';
import type { Story } from '../db/schema';
import {
  getAssetRepository,
  getChildProfileRepository,
  getGraphicNovelRepository,
  getStoryRepository,
  getAlignmentRepository,
  getUserRepository,
} from '../repositories';
import { enrichAllStoriesWithImages } from './storyOrchestrationService';
import { loadStoryCoverAssets } from './storyCoverService';
import { getAssetStorageService } from './assetStorageService';
import { logger } from '../utils/logger';
import { stripAllTags, stripCharacterIds } from '../utils/audioTags';
import { config } from '../config';
import { versionPublicIconAsset } from '../ssr/publicAssetUrls';
import { buildGraphicNovelPageTextOverlay } from '../domain/graphicNovel/textOverlay';
import type { PlannedGraphicNovelPage } from '../domain/graphicNovel';
import { normalizeAssetStoragePath } from './entityAssetCleanupService';
import {
  buildPublicAuthorView,
  type PublicAuthorSource,
} from '../utils/publicAuthorView';
import type {
  AlignmentData,
  PublicGraphicNovelPage,
  PublicGraphicNovelTextOverlay,
  PublicGraphicNovelTextOverlayItem,
  PublicMixedStoryReadingOrderItem,
  PublicAuthorView,
  PublicStoryFormat,
  PublicStoryListItem,
  PublicStoryScene,
  StoryPublicView,
  StoryAudioMetadata,
} from '@wondertales/shared';

const PUBLIC_STORY_FORMATS = new Set<PublicStoryFormat>([
  'story',
  'graphic_novel',
  'mixed_story',
]);

function resolvePublicStoryFormat(metadata: Record<string, unknown>): PublicStoryFormat {
  const value = metadata.storyFormat;
  return typeof value === 'string' && PUBLIC_STORY_FORMATS.has(value as PublicStoryFormat)
    ? (value as PublicStoryFormat)
    : 'story';
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? Math.round(parsed) : null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function percent(value: number): string {
  return `${Number((clamp01(value) * 100).toFixed(3))}%`;
}

function publicAssetUrl(value: unknown, shareToken?: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  const url = /^https?:\/\//i.test(normalized)
    ? normalized
    : `/api/v1/assets/${normalized.replace(/^\/api\/v1\/assets\//, '').replace(/^\/+/, '')}`;
  return appendUnlistedShareToken(url, shareToken);
}

function publicRect(value: unknown): { x: number; y: number; width: number; height: number } | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const x = finiteNumber(source.x);
  const y = finiteNumber(source.y);
  const width = finiteNumber(source.width);
  const height = finiteNumber(source.height);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
    return null;
  }
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: Math.min(clamp01(width), 1 - clamp01(x)),
    height: Math.min(clamp01(height), 1 - clamp01(y)),
  };
}

function publicTextOverlay(
  value: unknown,
  fallbackPageNumber: number
): PublicGraphicNovelTextOverlay | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, any>;
  const pageNumber = positiveInteger(source.pageNumber) ?? fallbackPageNumber;
  const pageSizeSource = source.pageSize as Record<string, unknown> | undefined;
  const pageWidth = positiveInteger(pageSizeSource?.width);
  const pageHeight = positiveInteger(pageSizeSource?.height);
  if (!pageWidth || !pageHeight) return null;

  const items: PublicGraphicNovelTextOverlayItem[] = Array.isArray(source.items)
    ? source.items.flatMap((item: unknown, index: number) => {
        if (!item || typeof item !== 'object') return [];
        const raw = item as Record<string, any>;
        const rect = publicRect(raw.rect);
        const kind = raw.kind;
        const text = stripAllTags(stripCharacterIds(String(raw.text ?? raw.audioText ?? ''))).trim();
        if (!rect || !text || !['speech', 'thought', 'caption'].includes(kind)) return [];
        const tailTo = raw.tailTo && typeof raw.tailTo === 'object'
          ? {
              x: clamp01(finiteNumber(raw.tailTo.x) ?? 0),
              y: clamp01(finiteNumber(raw.tailTo.y) ?? 0),
            }
          : undefined;
        const publicItem: PublicGraphicNovelTextOverlayItem = {
          id: String(raw.id ?? `public-bubble-${pageNumber}-${index + 1}`),
          segmentId: String(raw.segmentId ?? `public-segment-${pageNumber}-${index + 1}`),
          pageNumber,
          panelIndex: positiveInteger(raw.panelIndex) ?? 1,
          bubbleIndex: positiveInteger(raw.bubbleIndex) ?? index + 1,
          readingOrder: positiveInteger(raw.readingOrder) ?? index + 1,
          kind,
          ...(typeof raw.speaker === 'string' && raw.speaker.trim()
            ? { speaker: stripAllTags(stripCharacterIds(raw.speaker)).trim() }
            : {}),
          text,
          rect,
          cssPercent: {
            left: percent(rect.x),
            top: percent(rect.y),
            width: percent(rect.width),
            height: percent(rect.height),
          },
          ...(tailTo ? { tailTo } : {}),
          ...(typeof raw.ariaLabel === 'string' && raw.ariaLabel.trim()
            ? { ariaLabel: stripAllTags(stripCharacterIds(raw.ariaLabel)).trim() }
            : {}),
        };
        return [publicItem];
      })
    : [];

  const textStyleSource = source.textStyle as Record<string, unknown> | undefined;
  const textStyleValues = textStyleSource
    ? {
        fontSizePx: positiveInteger(textStyleSource.fontSizePx),
        lineHeightPx: positiveInteger(textStyleSource.lineHeightPx),
        paddingXPx: positiveInteger(textStyleSource.paddingXPx),
        paddingYPx: positiveInteger(textStyleSource.paddingYPx),
        targetPageWidthPx: positiveInteger(textStyleSource.targetPageWidthPx),
        targetPageHeightPx: positiveInteger(textStyleSource.targetPageHeightPx),
      }
    : null;
  const hasTextStyle = textStyleValues && Object.values(textStyleValues).every(Boolean);

  return {
    mode: 'html_overlay',
    coordinateSpace: 'normalized_0_1',
    pageNumber,
    pageSize: { width: pageWidth, height: pageHeight },
    ...(hasTextStyle ? { textStyle: textStyleValues as NonNullable<PublicGraphicNovelTextOverlay['textStyle']> } : {}),
    items: items.sort((a, b) => a.readingOrder - b.readingOrder),
  };
}

function pageOverlayFromRows(page: { bubbleLayoutJson: unknown; layoutJson: unknown; pageNumber: number }) {
  const bubbleLayout = page.bubbleLayoutJson as { textOverlay?: unknown } | null;
  const persisted = publicTextOverlay(bubbleLayout?.textOverlay, page.pageNumber);
  if (persisted) return persisted;

  try {
    const rebuilt = buildGraphicNovelPageTextOverlay(page.layoutJson as PlannedGraphicNovelPage, {
      textTransform: stripCharacterIds,
      displayTextTransform: stripAllTags,
      audioTextTransform: stripAllTags,
    });
    return publicTextOverlay(rebuilt, page.pageNumber);
  } catch {
    return null;
  }
}

async function loadPublicComicPages(
  storyId: string,
  shareToken?: string
): Promise<PublicGraphicNovelPage[]> {
  const repository = getGraphicNovelRepository();
  const project = await repository.findProjectByStoryId(storyId);
  if (!project) return [];
  const pages = await repository.findPagesByProjectId(project.id);
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    pageRole: page.pageRole,
    status: page.status,
    imageUrl: publicAssetUrl(page.imageUrl, shareToken),
    textOverlay: pageOverlayFromRows(page),
  }));
}

function publicMixedReadingOrder(
  metadata: Record<string, unknown>,
  scenes: PublicStoryScene[]
): PublicMixedStoryReadingOrderItem[] {
  const source = Array.isArray(metadata.mixedStoryReadingOrder)
    ? metadata.mixedStoryReadingOrder
    : [];
  const normalized = source.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Record<string, unknown>;
    const screenOrder = positiveInteger(raw.screenOrder);
    const kind = raw.kind;
    if (!screenOrder || (kind !== 'prose' && kind !== 'comic')) return [];
    const item: PublicMixedStoryReadingOrderItem = {
      screenOrder,
      kind,
      ...(positiveInteger(raw.sceneId) ? { sceneId: positiveInteger(raw.sceneId)! } : {}),
      ...(positiveInteger(raw.pageNumber) ? { pageNumber: positiveInteger(raw.pageNumber)! } : {}),
      sourceSceneIds: Array.isArray(raw.sourceSceneIds)
        ? raw.sourceSceneIds.map(positiveInteger).filter((value): value is number => value !== null)
        : [],
      textSegmentIds: Array.isArray(raw.textSegmentIds)
        ? raw.textSegmentIds.filter((value): value is string => typeof value === 'string')
        : [],
    };
    return [item];
  });
  if (normalized.length > 0) {
    return normalized.sort((a, b) => a.screenOrder - b.screenOrder);
  }

  return scenes.map((scene, index) => ({
    screenOrder: scene.mixedStoryScreenOrder ?? index + 1,
    kind: scene.mixedStoryBlockKind ?? (scene.graphicNovelPageNumber ? 'comic' : 'prose'),
    ...(scene.graphicNovelPageNumber ? { pageNumber: scene.graphicNovelPageNumber } : {}),
    sourceSceneIds: [scene.sceneId],
    textSegmentIds: [],
  }));
}

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
  const row = await getAssetRepository().findFinalCompletedAudioByStoryId(storyId);
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
  const metadata = (story.metadata as Record<string, unknown> | null) || {};
  const storyFormat = resolvePublicStoryFormat(metadata);

  const [{ url: audioUrl, alignment, duration }, comicPages] = await Promise.all([
    getAudioUrlAndAlignment(story.id),
    storyFormat === 'story'
      ? Promise.resolve([])
      : loadPublicComicPages(story.id, options?.shareToken),
  ]);

  const shareUrl = options?.shareToken
    ? `${webAppUrl}/u/${options.shareToken}`
    : `${webAppUrl}/stories/${slug}`;
  const slugOrToken = options?.shareToken ?? slug;
  const isUnlisted = !!options?.shareToken;
  const ogImageUrl = getOgImageUrl({ ...story, scenes }, apiBase, slugOrToken, isUnlisted);

  const formattedScenes: PublicStoryScene[] = scenes.map((s: any) => {
    const imgPath = s.image?.url ?? s.imageUrl;
    const mixedStoryBlockKind = s.mixedStoryBlockKind;
    const mixedStoryScreenOrder = positiveInteger(s.mixedStoryScreenOrder);
    const graphicNovelPageNumber = positiveInteger(s.graphicNovelPageNumber);
    return {
      sceneId: positiveInteger(s.sceneId) ?? 1,
      text: stripAllTags(s.text || ''),
      imageUrl: publicAssetUrl(imgPath, options?.shareToken),
      ...(mixedStoryBlockKind === 'prose' || mixedStoryBlockKind === 'comic'
        ? { mixedStoryBlockKind }
        : {}),
      ...(mixedStoryScreenOrder ? { mixedStoryScreenOrder } : {}),
      ...(graphicNovelPageNumber ? { graphicNovelPageNumber } : {}),
    };
  });

  const author = await getPublicAuthorForStory(story);
  return {
    id: story.id,
    title: story.title,
    fullText: stripAllTags(story.fullText || ''),
    storyFormat,
    ...(metadata.seoDescription && typeof metadata.seoDescription === 'string' && { seoDescription: metadata.seoDescription }),
    // Artifact collection is owner-only. Public story payloads keep the prose readable
    // but omit artifact metadata, labels, text segment markers, and collection affordances.
    scenes: formattedScenes,
    ...(storyFormat !== 'story' ? { comicPages } : {}),
    ...(storyFormat === 'mixed_story'
      ? { mixedStoryReadingOrder: publicMixedReadingOrder(metadata, formattedScenes) }
      : {}),
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
      const normalizedScenes: PublicStoryScene[] = scenes.map((sc: any) => {
        const imgPath = sc.image?.url ?? sc.imageUrl;
        const mixedStoryBlockKind = sc.mixedStoryBlockKind;
        const mixedStoryScreenOrder = positiveInteger(sc.mixedStoryScreenOrder);
        const graphicNovelPageNumber = positiveInteger(sc.graphicNovelPageNumber);
        return {
          sceneId: positiveInteger(sc.sceneId) ?? 1,
          text: stripAllTags(sc.text || ''),
          imageUrl: publicAssetUrl(imgPath),
          ...(mixedStoryBlockKind === 'prose' || mixedStoryBlockKind === 'comic'
            ? { mixedStoryBlockKind }
            : {}),
          ...(mixedStoryScreenOrder ? { mixedStoryScreenOrder } : {}),
          ...(graphicNovelPageNumber ? { graphicNovelPageNumber } : {}),
        };
      });
      const metadata = (s.metadata as Record<string, unknown> | null) || {};
      const storyFormat = resolvePublicStoryFormat(metadata);
      return {
        id: s.id,
        title: s.title,
        language: s.language,
        ageGroup: s.ageGroup,
        storyFormat,
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
