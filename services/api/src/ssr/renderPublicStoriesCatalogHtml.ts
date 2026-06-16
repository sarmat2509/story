import { escapeHtml, getReadingTimeMinutes } from '@wondertales/shared';
import {
  PUBLIC_SEO_LOCALES,
  buildAbsoluteRouteUrl,
  buildPublicLandingPath,
  buildPublicPricingPath,
  buildPublicStoriesPath,
  normalizePublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';
import type { PublicStoryListItem } from '../services/publicStoryService';
import { config } from '../config';
import { formatLandingAgeGroup, formatLandingDuration } from './landingContent';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import {
  PUBLIC_FOOTER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageFooter,
} from './publicPageFooter';
import { getVersionedWebBundleUrl } from './webBundleUrl';

const CATALOG_COPY: Record<PublicSeoLocale, {
  title: string;
  description: string;
  navStories: string;
  navPricing: string;
  eyebrow: string;
  h1: string;
  intro: string;
  storyCount: (count: number) => string;
  readStory: string;
  authorLabel: string;
  emptyTitle: string;
  emptyBody: string;
}> = {
  uk: {
    title: 'Опубліковані історії для дітей - WonderTales',
    description: 'Публічний каталог дитячих історій WonderTales з ілюстраціями, читанням і безпечним сімейним контекстом.',
    navStories: 'Історії',
    navPricing: 'Тарифи',
    eyebrow: 'Публічна бібліотека',
    h1: 'Опубліковані історії WonderTales',
    intro: 'Добірка історій, які родини відкрили для публічного перегляду. Приватні, приховані й unlisted історії сюди не потрапляють.',
    storyCount: (count) => `${count} історій у каталозі`,
    readStory: 'Читати історію',
    authorLabel: 'Автор',
    emptyTitle: 'Публічних історій поки немає',
    emptyBody: 'Коли родини опублікують історії для каталогу, вони зʼявляться тут.',
  },
  en: {
    title: 'Published children stories - WonderTales',
    description: 'A public catalog of WonderTales children stories with illustrations, reading time, and family-safe sharing controls.',
    navStories: 'Stories',
    navPricing: 'Pricing',
    eyebrow: 'Public library',
    h1: 'Published WonderTales stories',
    intro: 'A catalog of stories families have intentionally made public. Private, hidden, and unlisted stories do not appear here.',
    storyCount: (count) => `${count} stories in the catalog`,
    readStory: 'Read story',
    authorLabel: 'Author',
    emptyTitle: 'No public stories yet',
    emptyBody: 'Stories will appear here after families publish them to the public catalog.',
  },
};

const CATALOG_STYLES = `
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;color:#172033}
a{color:inherit;text-decoration:none}
.page{max-width:1180px;margin:0 auto;padding:28px 20px 56px}
.topnav{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:36px}
.brand{font-weight:800;color:#6d5bd0;font-size:19px}
.navlinks{display:flex;gap:18px;color:#475569;font-weight:600;font-size:14px}
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;margin-bottom:28px}
.eyebrow{margin:0 0 8px;color:#6d5bd0;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
h1{font-size:42px;line-height:1.08;margin:0 0 14px;letter-spacing:0}
.intro{max-width:720px;margin:0;color:#475569;font-size:17px;line-height:1.65}
.count{margin:0;padding:10px 14px;border:1px solid #dbe3ef;border-radius:999px;background:#fff;color:#334155;font-size:14px;font-weight:700;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.card{background:#fff;border:1px solid #dbe3ef;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;min-height:100%;box-shadow:0 10px 24px rgba(15,23,42,.06)}
.thumb{aspect-ratio:16/9;width:100%;object-fit:cover;background:#e2e8f0;display:block}
.thumb-placeholder{aspect-ratio:16/9;background:linear-gradient(135deg,#e0f2fe,#fef3c7);display:flex;align-items:center;justify-content:center;color:#334155;font-weight:800}
.card-body{padding:16px;display:flex;flex-direction:column;gap:10px;flex:1}
.card h2{font-size:19px;line-height:1.25;margin:0;color:#172033}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:0;color:#64748b;font-size:13px}
.meta span{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:#f1f5f9}
.author{margin:0;color:#475569;font-size:14px}
.author a{text-decoration:underline;text-underline-offset:3px}
.excerpt{margin:0;color:#475569;font-size:14px;line-height:1.6}
.read{margin-top:auto;color:#5b4bc4;font-weight:800;font-size:14px}
.empty{background:#fff;border:1px solid #dbe3ef;border-radius:8px;padding:30px;text-align:center;color:#475569}
.empty h2{margin:0 0 8px;color:#172033}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:34px}.hero{grid-template-columns:1fr}.count{justify-self:start}}
@media(max-width:560px){.page{padding:22px 16px 44px}.grid{grid-template-columns:1fr}.topnav{align-items:flex-start}.navlinks{flex-direction:column;gap:8px}h1{font-size:30px}}
${PUBLIC_FOOTER_STYLES}
`;

function absoluteUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = baseUrl.replace(/\/$/, '');
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
}

function trimExcerpt(value: string | null | undefined, maxLength = 150): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function getStoryImage(story: PublicStoryListItem, apiBase: string): string | null {
  return absoluteUrl(story.scenes.find((scene) => scene.imageUrl)?.imageUrl, apiBase);
}

function getLanguageName(language: string, locale: PublicSeoLocale): string {
  const names: Record<string, { uk: string; en: string }> = {
    uk: { uk: 'Українська', en: 'Ukrainian' },
    en: { uk: 'Англійська', en: 'English' },
    es: { uk: 'Іспанська', en: 'Spanish' },
    ru: { uk: 'Російська', en: 'Russian' },
    de: { uk: 'Німецька', en: 'German' },
    fr: { uk: 'Французька', en: 'French' },
    pl: { uk: 'Польська', en: 'Polish' },
  };
  return names[language]?.[locale] ?? language.toUpperCase();
}

function renderAlternateLinks(webAppUrl: string, locale: PublicSeoLocale): string {
  const canonical = buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(locale));
  const alternates = PUBLIC_SEO_LOCALES.map((altLocale) => {
    const href = buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(altLocale));
    return `<link rel="alternate" hreflang="${altLocale}" href="${escapeHtml(href)}">`;
  });
  const xDefault = buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath('uk'));
  return [
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    ...alternates,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(xDefault)}">`,
  ].join('\n  ');
}

function renderStoryCard(
  story: PublicStoryListItem,
  locale: PublicSeoLocale,
  webAppUrl: string,
  apiBase: string,
  copy: typeof CATALOG_COPY[PublicSeoLocale]
): string {
  const storyUrl = buildAbsoluteRouteUrl(webAppUrl, `/stories/${encodeURIComponent(story.publishedSlug)}`);
  const authorUrl = buildAbsoluteRouteUrl(webAppUrl, `/authors/${encodeURIComponent(story.authorId)}`);
  const imageUrl = getStoryImage(story, apiBase);
  const readingTime = formatLandingDuration(locale, getReadingTimeMinutes(story.scenes));
  const age = formatLandingAgeGroup(locale, story.ageGroup);
  const language = getLanguageName(story.language, locale);
  const excerpt = trimExcerpt(story.scenes[0]?.text || '');

  return `<article class="card">
    <a href="${escapeHtml(storyUrl)}" aria-label="${escapeHtml(story.title)}">
      ${
        imageUrl
          ? `<img class="thumb" src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`
          : '<div class="thumb-placeholder">WonderTales</div>'
      }
    </a>
    <div class="card-body">
      <h2><a href="${escapeHtml(storyUrl)}">${escapeHtml(story.title)}</a></h2>
      <p class="meta">
        <span>${escapeHtml(age)}</span>
        <span>${escapeHtml(readingTime)}</span>
        <span>${escapeHtml(language)}</span>
      </p>
      <p class="author">${escapeHtml(copy.authorLabel)} <a href="${escapeHtml(authorUrl)}">${escapeHtml(story.authorDisplayName)}</a></p>
      ${excerpt ? `<p class="excerpt">${escapeHtml(excerpt)}</p>` : ''}
      <a class="read" href="${escapeHtml(storyUrl)}">${escapeHtml(copy.readStory)}</a>
    </div>
  </article>`;
}

function buildInitialCatalogStories(stories: PublicStoryListItem[]) {
  return stories.map((story) => {
    const coverScene = story.scenes.find((scene) => scene.imageUrl) ?? story.scenes[0];
    return {
      id: story.id,
      title: story.title,
      publishedSlug: story.publishedSlug,
      authorId: story.authorId,
      authorDisplayName: story.authorDisplayName,
      authorAvatarUrl: story.authorAvatarUrl ?? null,
      scenes: coverScene
        ? [{
            sceneId: coverScene.sceneId,
            imageUrl: coverScene.imageUrl ?? null,
          }]
        : [],
      hasAudio: story.hasAudio,
      ...(story.rating ? { rating: story.rating } : {}),
    };
  });
}

export function renderPublicStoriesCatalogHtml(params: {
  locale?: string | null;
  stories: PublicStoryListItem[];
  total: number;
}): string {
  const locale = normalizePublicSeoLocale(params.locale);
  const copy = CATALOG_COPY[locale];
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || 'https://wondertales.art';
  const apiBase = config.web?.apiPublicUrl?.replace(/\/$/, '') || webAppUrl;
  const webBundleUrl = getVersionedWebBundleUrl();
  const fullWebBundleUrl = webBundleUrl.startsWith('http')
    ? webBundleUrl
    : `${webAppUrl}${webBundleUrl.startsWith('/') ? '' : '/'}${webBundleUrl}`;
  const landingUrl = buildAbsoluteRouteUrl(webAppUrl, buildPublicLandingPath(locale));
  const pricingUrl = buildAbsoluteRouteUrl(webAppUrl, buildPublicPricingPath(locale));
  const initialCatalogJson = JSON.stringify({
    stories: buildInitialCatalogStories(params.stories),
    pagination: { limit: params.stories.length, offset: 0, total: params.total },
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(copy.title)}</title>
  <meta name="description" content="${escapeHtml(copy.description)}">
  <meta name="robots" content="index,follow">
  ${renderAlternateLinks(webAppUrl, locale)}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(copy.title)}">
  <meta property="og:description" content="${escapeHtml(copy.description)}">
  <meta property="og:url" content="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(locale)))}">
  ${PUBLIC_HEAD_ASSET_LINKS}
  <style>${CATALOG_STYLES}</style>
</head>
<body>
  <div id="root">
    <main class="page">
      <nav class="topnav" aria-label="WonderTales">
        <a class="brand" href="${escapeHtml(landingUrl)}">WonderTales</a>
        <div class="navlinks">
          <a href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(locale)))}">${escapeHtml(copy.navStories)}</a>
          <a href="${escapeHtml(pricingUrl)}">${escapeHtml(copy.navPricing)}</a>
        </div>
      </nav>
      <section class="hero">
        <div>
          <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
          <h1>${escapeHtml(copy.h1)}</h1>
          <p class="intro">${escapeHtml(copy.intro)}</p>
        </div>
        <p class="count">${escapeHtml(copy.storyCount(params.total))}</p>
      </section>
      ${
        params.stories.length > 0
          ? `<section class="grid">${params.stories.map((story) => renderStoryCard(story, locale, webAppUrl, apiBase, copy)).join('\n')}</section>`
          : `<section class="empty"><h2>${escapeHtml(copy.emptyTitle)}</h2><p>${escapeHtml(copy.emptyBody)}</p></section>`
      }
    </main>
    ${renderPublicPageFooter(webAppUrl, locale, buildPublicFooterLanguageLinks(webAppUrl, buildPublicStoriesPath))}
  </div>
  <script>window.__INITIAL_STORIES__ = ${initialCatalogJson};</script>
  <script src="${escapeHtml(fullWebBundleUrl)}" defer></script>
</body>
</html>`;
}
