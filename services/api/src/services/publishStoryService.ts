/**
 * Publish Story Service
 * Handles story publication, slug generation, and static HTML generation.
 */

import { getStoryRepository, getUserRepository } from '../repositories';
import { enrichAllStoriesWithImages } from './storyOrchestrationService';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
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

export interface PublishResult {
  slug: string;
  shareUrl: string;
}

/**
 * Publish a story. Sets published_at, published_slug, author_display_name.
 * Returns slug and shareUrl for immediate share sheet.
 */
export async function publishStory(storyId: string, userId: string): Promise<PublishResult | null> {
  const storyRepo = getStoryRepository();
  const userRepo = getUserRepository();

  const story = await storyRepo.findByIdAndUser(storyId, userId);
  if (!story) return null;

  if (story.isPublished && story.publishedSlug) {
    const webAppUrl = config.web.webAppUrl.replace(/\/$/, '');
    return {
      slug: story.publishedSlug,
      shareUrl: `${webAppUrl}/stories/${story.publishedSlug}`,
    };
  }

  const user = await userRepo.findById(userId);
  const authorDisplayName =
    user?.pseudonym || user?.displayName || 'Anonymous';

  const baseSlug = slugify(story.title);
  const slug = await generateUniqueSlug(baseSlug);

  await storyRepo.updateStory(storyId, {
    isPublished: true,
    publishedAt: new Date(),
    publishedSlug: slug,
    authorDisplayName,
  });

  logger.info({ storyId, slug, userId }, 'Story published');

  // Regenerate HTML in background (non-blocking)
  regeneratePublishedHtml(slug).catch((err) =>
    logger.error({ err, slug }, 'Failed to regenerate published HTML')
  );

  const webAppUrl = config.web.webAppUrl.replace(/\/$/, '');
  return {
    slug,
    shareUrl: `${webAppUrl}/stories/${slug}`,
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

  await storyRepo.updateStory(storyId, {
    isPublished: false,
    publishedAt: null,
    publishedSlug: null,
    authorDisplayName: null,
  });

  if (slug) {
    const outputDir = config.web.publishedStoriesOutputDir;
    if (outputDir) {
      const filePath = path.join(outputDir, slug, 'index.html');
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore if file doesn't exist
      }
    }
  }

  logger.info({ storyId, slug, userId }, 'Story unpublished');
  return true;
}

/**
 * Regenerate static HTML for a published story.
 * Called after publish, or when audio/images are updated.
 */
export async function regeneratePublishedHtml(slug: string): Promise<void> {
  const outputDir = config.web.publishedStoriesOutputDir;
  if (!outputDir) {
    logger.debug({ slug }, 'PUBLISHED_STORIES_OUTPUT_DIR not set, skipping HTML generation');
    return;
  }

  const storyRepo = getStoryRepository();
  const story = await storyRepo.findByPublishedSlug(slug);
  if (!story) {
    logger.warn({ slug }, 'Story not found for HTML regeneration');
    return;
  }

  // Enrich scenes with image URLs from assets table (same as list published)
  const enrichedScenesMap = await enrichAllStoriesWithImages([
    { id: story.id, scenes: (story.scenes as any[]) || [] },
  ]);
  const enrichedScenes = enrichedScenesMap.get(story.id) || story.scenes || [];

  const apiBase = config.web.apiPublicUrl.replace(/\/$/, '');
  const webAppUrl = config.web.webAppUrl.replace(/\/$/, '');

  const scenes = Array.isArray(enrichedScenes) ? enrichedScenes : [];
  const firstScene = scenes[0];
  const firstImagePath = firstScene?.image?.url ?? firstScene?.imageUrl;
  const firstImageUrl = firstImagePath
    ? (String(firstImagePath).startsWith('http') ? firstImagePath : `${apiBase}/api/v1/assets/${String(firstImagePath).replace(/^\/api\/v1\/assets\//, '')}`)
    : `${webAppUrl}/favicon.png`;

  // Get audio URL if exists
  let audioUrl: string | null = null;
  if (story.audioMetadata) {
    try {
      const { db } = await import('../db');
      const { audioAssets, assets } = await import('../db/schema');
      const { eq, and, desc, isNull } = await import('drizzle-orm');
      const [audioAsset] = await db
        .select({ audioAsset: audioAssets, asset: assets })
        .from(audioAssets)
        .innerJoin(assets, eq(audioAssets.assetId, assets.id))
        .where(and(
          eq(audioAssets.storyId, story.id),
          eq(audioAssets.status, 'completed'),
          eq(audioAssets.isFinal, true),
          isNull(audioAssets.sceneGroupIndex)
        ))
        .orderBy(desc(audioAssets.createdAt))
        .limit(1);
      if (audioAsset) {
        audioUrl = `${apiBase}/api/v1/assets/${audioAsset.asset.storagePath}`;
      }
    } catch {
      // Non-fatal
    }
  }

  const publishedAt = story.publishedAt
    ? new Date(story.publishedAt).toLocaleDateString('uk-UA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const html = `<!DOCTYPE html>
<html lang="${story.language || 'uk'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(story.title)} — WonderTales</title>
  <meta property="og:title" content="${escapeHtml(story.title)}">
  <meta property="og:description" content="${escapeHtml((story.fullText || '').slice(0, 200))}...">
  <meta property="og:image" content="${firstImageUrl}">
  <meta property="og:url" content="${webAppUrl}/stories/${slug}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(story.title)}">
  <meta name="twitter:image" content="${firstImageUrl}">
  <link rel="preconnect" href="${apiBase}">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; line-height: 1.6; color: #1e293b; }
    h1 { font-size: 1.75rem; margin-bottom: 8px; }
    .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 24px; }
    .scene { margin-bottom: 32px; }
    .scene img { width: 100%; border-radius: 8px; }
    .scene p { margin: 12px 0 0; }
    .cta { background: #f1f5f9; border-radius: 12px; padding: 24px; margin-top: 32px; text-align: center; }
    .cta h2 { font-size: 1.25rem; margin-bottom: 8px; }
    .cta p { color: #64748b; margin-bottom: 16px; }
    .cta a { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .cta a:hover { background: #0284c7; }
    audio { width: 100%; margin: 16px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(story.title)}</h1>
  <div class="meta">${escapeHtml(story.authorDisplayName || 'Anonymous')} · ${publishedAt}</div>
  ${audioUrl ? `<audio controls src="${audioUrl}"></audio>` : ''}
  ${scenes
    .map((s: any) => {
      const imgPath = s.image?.url ?? s.imageUrl;
      const imgSrc = imgPath
        ? (String(imgPath).startsWith('http') ? imgPath : `${apiBase}/api/v1/assets/${String(imgPath).replace(/^\/api\/v1\/assets\//, '')}`)
        : '';
      return `<div class="scene">${imgSrc ? `<img src="${imgSrc}" alt="" loading="lazy">` : ''}<p>${escapeHtml(s.text || '')}</p></div>`;
    })
    .join('\n  ')}
  <div class="cta">
    <h2>Твоя дитина — герой власної казки</h2>
    <p>Створи історію, де твоя дитина стане персонажем. Картинки та озвучка — за кілька хвилин.</p>
    <a href="${webAppUrl}/login?redirect=${encodeURIComponent(webAppUrl + '/stories/' + slug)}">Увійти та створити</a>
  </div>
</body>
</html>`;

  const dir = path.join(outputDir, slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), html, 'utf-8');

  logger.info({ slug }, 'Published story HTML regenerated');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
