/**
 * Sitemap Service
 * Generates and caches sitemap.xml for all public stories.
 * Cache is invalidated on publish/unpublish via invalidateSitemapCache().
 */

import { getAppReleaseRepository, getStoryRepository } from '../repositories';
import { getRedisClient } from '../utils/redisClient';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  DEFAULT_PUBLIC_SEO_LOCALE,
  buildAbsoluteRouteUrl,
  buildPublicSeoSitemapStaticRoutes,
} from '@wondertales/shared';
import type * as schema from '../db/schema';
import { getBlogSitemapRoutes } from '../ssr/blogContent';

const SITEMAP_CACHE_KEY = 'sitemap:xml:v6';
const SITEMAP_TTL = 3600; // 1 hour

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toDateString(date: Date | string | null): string {
  if (!date) return new Date().toISOString().slice(0, 10);
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

type SitemapStory = Pick<schema.Story, 'publishedSlug' | 'publishedAt' | 'userId'>;

export function buildSitemapXmlForStories(
  stories: SitemapStory[],
  webAppUrl: string = config.web?.webAppUrl?.replace(/\/$/, '') || 'https://wondertales.art',
  updatesLastModified?: Date | string | null
): string {
  const baseUrl = webAppUrl.replace(/\/$/, '');

  const storyUrls = stories
    .filter((s) => s.publishedSlug)
    .map((s) => {
      const loc = escapeXml(`${baseUrl}/stories/${s.publishedSlug}`);
      const lastmod = toDateString(s.publishedAt);
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    });

  const authorLastmodById = new Map<string, string>();
  for (const story of stories) {
    if (!story.publishedSlug || !story.userId) continue;

    const lastmod = toDateString(story.publishedAt);
    const previousLastmod = authorLastmodById.get(story.userId);
    if (!previousLastmod || lastmod > previousLastmod) {
      authorLastmodById.set(story.userId, lastmod);
    }
  }

  const authorUrls = [...authorLastmodById.entries()].map(([authorId, lastmod]) => {
    const loc = escapeXml(`${baseUrl}/authors/${encodeURIComponent(authorId)}`);
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
  });

  const staticUrls = buildPublicSeoSitemapStaticRoutes().map((route) => {
    const loc = escapeXml(buildAbsoluteRouteUrl(baseUrl, route.path));
    const lastmod = route.id === 'updates' && updatesLastModified
      ? `\n    <lastmod>${toDateString(updatesLastModified)}</lastmod>`
      : '';
    return `  <url>\n    <loc>${loc}</loc>${lastmod}\n    <changefreq>${route.changefreq}</changefreq>\n    <priority>${route.priority}</priority>\n  </url>`;
  });

  const blogUrls = getBlogSitemapRoutes().map((route) => {
    const loc = escapeXml(buildAbsoluteRouteUrl(baseUrl, route.path));
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${escapeXml(route.lastmod)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${route.locale === DEFAULT_PUBLIC_SEO_LOCALE ? '0.78' : '0.68'}</priority>\n  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...blogUrls, ...storyUrls, ...authorUrls].join('\n')}
</urlset>`;
}

export async function generateSitemapXml(): Promise<string> {
  const repo = getStoryRepository();
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || 'https://wondertales.art';

  const [stories, updatesLastModified] = await Promise.all([
    repo.listPublished({ limit: 50000, offset: 0 }),
    getAppReleaseRepository().latestPublishedModifiedAt(),
  ]);
  const xml = buildSitemapXmlForStories(stories, webAppUrl, updatesLastModified);
  const authorCount = new Set(stories.filter((s) => s.publishedSlug).map((s) => s.userId)).size;

  logger.info({ storyCount: stories.length, authorCount }, 'Sitemap generated');
  return xml;
}

export async function getCachedSitemap(): Promise<string | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    return await redis.get(SITEMAP_CACHE_KEY);
  } catch (err) {
    logger.warn({ err }, 'Redis sitemap get failed');
    return null;
  }
}

export async function setCachedSitemap(xml: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.set(SITEMAP_CACHE_KEY, xml, SITEMAP_TTL);
  } catch (err) {
    logger.warn({ err }, 'Redis sitemap set failed');
  }
}

export async function invalidateSitemapCache(): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(SITEMAP_CACHE_KEY);
    logger.debug('Sitemap cache invalidated');
  } catch (err) {
    logger.warn({ err }, 'Redis sitemap invalidate failed');
  }
}

export async function getOrGenerateSitemap(): Promise<string> {
  const cached = await getCachedSitemap();
  if (cached) return cached;

  const xml = await generateSitemapXml();
  await setCachedSitemap(xml);
  return xml;
}
