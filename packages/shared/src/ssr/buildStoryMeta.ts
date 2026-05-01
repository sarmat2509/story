/**
 * Build OG/Twitter meta tags for published story
 */
import type { StoryMetaParams } from './types';
import { escapeHtml } from './escapeHtml';

export function buildStoryMeta(params: StoryMetaParams): string {
  const {
    title,
    description,
    ogImageUrl,
    url,
    locale = 'uk',
    robots = 'index,follow',
  } = params;

  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description.slice(0, 200));
  const safeUrl = escapeHtml(url);
  const safeImage = escapeHtml(ogImageUrl);

  return `
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="${robots}">
  <title>${safeTitle} — WonderTales</title>
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${safeUrl}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="${locale}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeImage}">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <link rel="canonical" href="${safeUrl}">`.trim();
}
