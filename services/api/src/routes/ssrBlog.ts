import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { normalizePublicSeoLocale, type PublicSeoLocale } from '@wondertales/shared';
import { renderBlogArticleHtml, renderBlogIndexHtml } from '../ssr/renderBlogHtml';
import { logger } from '../utils/logger';

const router = Router();

export function resolveBlogRouteLocale(locale?: string | null): PublicSeoLocale {
  return normalizePublicSeoLocale(locale);
}

function buildBlogEtag(prefix: string, html: string): string {
  return `"${prefix}-${crypto.createHash('sha1').update(html).digest('hex').slice(0, 12)}"`;
}

function sendHtml(req: Request, res: Response, html: string, prefix: string) {
  const etag = buildBlogEtag(prefix, html);
  if (req.headers['if-none-match'] === etag) {
    res.status(304);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
    return res.end();
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
  res.send(html);
}

function renderBlogIndexRoute(req: Request, res: Response) {
  try {
    const locale = resolveBlogRouteLocale(req.params.locale);
    const html = renderBlogIndexHtml({ locale });
    sendHtml(req, res, html, `blog-index-${locale}`);
  } catch (error) {
    logger.error({ err: error }, 'Error rendering blog index page');
    res.status(500).send('Internal Server Error');
  }
}

function renderBlogArticleRoute(req: Request, res: Response) {
  try {
    const locale = resolveBlogRouteLocale(req.params.locale);
    const slug = req.params.slug;
    const html = renderBlogArticleHtml({ slug, locale });
    if (!html) {
      res.status(404).send('Not Found');
      return;
    }

    sendHtml(req, res, html, `blog-article-${locale}-${slug}`);
  } catch (error) {
    logger.error({ err: error, slug: req.params.slug, locale: req.params.locale }, 'Error rendering blog article page');
    res.status(500).send('Internal Server Error');
  }
}

router.get('/', renderBlogIndexRoute);
router.get('/index/:locale', renderBlogIndexRoute);
router.get('/:slug', renderBlogArticleRoute);
router.get('/:locale/:slug', renderBlogArticleRoute);

export default router;
