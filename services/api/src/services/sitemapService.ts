/**
 * Sitemap Service
 * Generates and caches sitemap.xml for all public stories.
 * Cache is invalidated on publish/unpublish via invalidateSitemapCache().
 */

import { getStoryRepository } from '../repositories';
import { getRedisClient } from '../utils/redisClient';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getLandingUrl, LANDING_LOCALES } from '../ssr/landingContent';

const SITEMAP_CACHE_KEY = 'sitemap:xml';
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

export async function generateSitemapXml(): Promise<string> {
  const repo = getStoryRepository();
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || '';

  const stories = await repo.listPublished({ limit: 50000, offset: 0 });

  const storyUrls = stories
    .filter((s) => s.publishedSlug)
    .map((s) => {
      const loc = escapeXml(`${webAppUrl}/stories/${s.publishedSlug}`);
      const lastmod = toDateString(s.publishedAt);
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    });

  const landingUrls = LANDING_LOCALES.map((locale) => {
    const loc = escapeXml(getLandingUrl(webAppUrl || 'https://magic-sleep-time.duckdns.org', locale));
    const priority = locale === 'uk' ? '1.0' : '0.9';
    return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  });

  const staticUrls = [
    ...landingUrls,
    `  <url>\n    <loc>${escapeXml(`${webAppUrl}/stories`)}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...storyUrls].join('\n')}
</urlset>`;

  logger.info({ count: storyUrls.length }, 'Sitemap generated');
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
