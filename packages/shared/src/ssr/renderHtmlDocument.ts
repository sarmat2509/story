/**
 * Render full HTML document for SSR published story
 */
import type { StoryPublicView } from './types';
import { buildStoryMeta } from './buildStoryMeta';
import { buildStoryJsonLd } from './buildStoryJsonLd';

export interface RenderHtmlDocumentParams {
  story: StoryPublicView;
  baseUrl: string;
  webBundleUrl: string;
  bodyHtml?: string;
  robots?: 'index,follow' | 'noindex,nofollow';
  headStyles?: string;
}

/**
 * Renders HTML shell with meta, JSON-LD, body placeholder, and __INITIAL_STORY__ script.
 * Body is typically empty or minimal for SPA hydration.
 */
export function renderHtmlDocument(params: RenderHtmlDocumentParams): string {
  const {
    story,
    baseUrl,
    webBundleUrl,
    bodyHtml = '<div id="root"></div>',
    robots = 'index,follow',
    headStyles = '',
  } = params;

  const meta = buildStoryMeta({
    title: story.title,
    description: story.seoDescription ?? (story.fullText || '').slice(0, 200) + (story.fullText?.length > 200 ? '...' : ''),
    ogImageUrl: story.share.ogImageUrl,
    url: story.share.url,
    robots,
  });

  const jsonLd = buildStoryJsonLd(story, baseUrl);
  const initialStoryJson = JSON.stringify(story).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  ${meta}
  ${headStyles ? `<style>${headStyles}</style>` : ''}
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  ${bodyHtml}
  <script>window.__INITIAL_STORY__ = ${initialStoryJson};</script>
  <script src="${webBundleUrl}" defer></script>
</body>
</html>`;
}
