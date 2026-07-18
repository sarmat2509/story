import { escapeHtml, getReadingTimeMinutes } from '@wondertales/shared';
import {
  PUBLIC_SEO_LOCALES,
  buildAbsoluteRouteUrl,
  buildPublicStoriesPath,
  normalizePublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';
import type { PublicStoryFormat, PublicStoryListItem } from '@wondertales/shared';
import { config } from '../config';
import { formatLandingAgeGroup, formatLandingDuration } from './landingContent';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import {
  PUBLIC_FOOTER_STYLES,
  PUBLIC_HEADER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageHeader,
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
  fallbackTitle: string;
  fallbackBody: string;
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
    fallbackTitle: 'Більше історій іншими мовами',
    fallbackBody: 'Спершу показуємо історії українською. Нижче — свіжі публічні історії іншими мовами.',
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
    fallbackTitle: 'More stories in other languages',
    fallbackBody: 'Stories in English appear first. Below are recent public stories in other languages.',
  },
  ru: {
    title: 'Опубликованные детские истории - WonderTales',
    description: 'Публичный каталог детских историй WonderTales с иллюстрациями, временем чтения и безопасным семейным контекстом.',
    navStories: 'Истории',
    navPricing: 'Тарифы',
    eyebrow: 'Публичная библиотека',
    h1: 'Опубликованные истории WonderTales',
    intro: 'Подборка историй, которые семьи открыли для публичного просмотра. Приватные, скрытые и unlisted истории здесь не появляются.',
    storyCount: (count) => `${count} историй в каталоге`,
    readStory: 'Читать историю',
    authorLabel: 'Автор',
    emptyTitle: 'Публичных историй пока нет',
    emptyBody: 'Истории появятся здесь, когда семьи опубликуют их в публичном каталоге.',
    fallbackTitle: 'Еще истории на других языках',
    fallbackBody: 'Сначала показаны истории на русском. Ниже — свежие публичные истории на других языках.',
  },
  es: {
    title: 'Historias infantiles publicados - WonderTales',
    description: 'Un catálogo público de historias infantiles de WonderTales con ilustraciones, tiempo de lectura y controles seguros para familias.',
    navStories: 'Historias',
    navPricing: 'Precios',
    eyebrow: 'Biblioteca pública',
    h1: 'Historias publicados de WonderTales',
    intro: 'Una selección de historias que las familias han decidido compartir públicamente. Las historias privadas, ocultas y no listadas no aparecen aquí.',
    storyCount: (count) => `${count} historias en el catálogo`,
    readStory: 'Leer historia',
    authorLabel: 'Autor',
    emptyTitle: 'Aún no hay historias públicos',
    emptyBody: 'Las historias aparecerán aquí cuando las familias las publiquen en el catálogo público.',
    fallbackTitle: 'Más historias en otros idiomas',
    fallbackBody: 'Primero mostramos historias en español. Abajo encontrarás historias públicos recientes en otros idiomas.',
  },
  de: {
    title: 'Veröffentlichte Kindergeschichten - WonderTales',
    description: 'Ein öffentlicher Katalog von WonderTales-Kindergeschichten mit Illustrationen, Lesezeit und sicheren Familienfreigaben.',
    navStories: 'Geschichten',
    navPricing: 'Preise',
    eyebrow: 'Öffentliche Bibliothek',
    h1: 'Veröffentlichte WonderTales-Geschichten',
    intro: 'Eine Sammlung von Geschichten, die Familien bewusst öffentlich freigegeben haben. Private, versteckte und nicht gelistete Geschichten erscheinen hier nicht.',
    storyCount: (count) => `${count} Geschichten im Katalog`,
    readStory: 'Geschichte lesen',
    authorLabel: 'Autor',
    emptyTitle: 'Noch keine öffentlichen Geschichten',
    emptyBody: 'Geschichten erscheinen hier, sobald Familien sie im öffentlichen Katalog veröffentlichen.',
    fallbackTitle: 'Mehr Geschichten in anderen Sprachen',
    fallbackBody: 'Zuerst zeigen wir deutsche Geschichten. Danach folgen aktuelle öffentliche Geschichten in anderen Sprachen.',
  },
  fr: {
    title: 'Histoires pour enfants publiées - WonderTales',
    description: 'Un catalogue public d’histoires WonderTales pour enfants avec illustrations, temps de lecture et partage familial sécurisé.',
    navStories: 'Histoires',
    navPricing: 'Tarifs',
    eyebrow: 'Bibliothèque publique',
    h1: 'Histoires WonderTales publiées',
    intro: 'Une sélection d’histoires que les familles ont choisi de rendre publiques. Les histoires privées, masquées ou non répertoriées n’apparaissent pas ici.',
    storyCount: (count) => `${count} histoires dans le catalogue`,
    readStory: 'Lire l’histoire',
    authorLabel: 'Auteur',
    emptyTitle: 'Aucune histoire publique pour le moment',
    emptyBody: 'Les histoires apparaîtront ici lorsque les familles les publieront dans le catalogue public.',
    fallbackTitle: 'Plus d’histoires dans d’autres langues',
    fallbackBody: 'Les histoires en français apparaissent d’abord. Ensuite, vous trouverez des histoires publiques récentes dans d’autres langues.',
  },
  pl: {
    title: 'Opublikowane historie dla dzieci - WonderTales',
    description: 'Publiczny katalog historii WonderTales dla dzieci z ilustracjami, czasem czytania i bezpiecznym udostępnianiem rodzinnym.',
    navStories: 'Historie',
    navPricing: 'Cennik',
    eyebrow: 'Biblioteka publiczna',
    h1: 'Opublikowane historie WonderTales',
    intro: 'Zbiór historii, które rodziny świadomie udostępniły publicznie. Historie prywatne, ukryte i niepubliczne nie pojawiają się tutaj.',
    storyCount: (count) => `${count} historii w katalogu`,
    readStory: 'Czytaj historię',
    authorLabel: 'Autor',
    emptyTitle: 'Nie ma jeszcze publicznych historii',
    emptyBody: 'Historie pojawią się tutaj, gdy rodziny opublikują je w publicznym katalogu.',
    fallbackTitle: 'Więcej historii w innych językach',
    fallbackBody: 'Najpierw pokazujemy historie po polsku. Niżej znajdziesz najnowsze publiczne historie w innych językach.',
  },
};

const FORMAT_LABELS: Record<PublicSeoLocale, Record<PublicStoryFormat, string>> = {
  uk: { story: 'Історія', graphic_novel: 'Комікс', mixed_story: 'Історія + комікс' },
  en: { story: 'Story', graphic_novel: 'Comic', mixed_story: 'Story + comic' },
  ru: { story: 'История', graphic_novel: 'Комикс', mixed_story: 'История + комикс' },
  es: { story: 'Historia', graphic_novel: 'Cómic', mixed_story: 'Historia + cómic' },
  de: { story: 'Geschichte', graphic_novel: 'Comic', mixed_story: 'Geschichte + Comic' },
  fr: { story: 'Histoire', graphic_novel: 'BD', mixed_story: 'Histoire + BD' },
  pl: { story: 'Historia', graphic_novel: 'Komiks', mixed_story: 'Historia + komiks' },
};

const CATALOG_STYLES = `
*{box-sizing:border-box}
html,body{min-height:100%}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;color:#172033}
#root{min-height:100vh;display:flex;flex-direction:column}
a{color:inherit;text-decoration:none}
.page{width:100%;max-width:1180px;margin:0 auto;padding:28px 20px 56px;flex:1 0 auto}
.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;margin-bottom:28px}
.eyebrow{margin:0 0 8px;color:#6d5bd0;font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
h1{font-size:42px;line-height:1.08;margin:0 0 14px;letter-spacing:0}
.intro{max-width:720px;margin:0;color:#475569;font-size:17px;line-height:1.65}
.count{margin:0;padding:10px 14px;border:1px solid #dbe3ef;border-radius:999px;background:#fff;color:#334155;font-size:14px;font-weight:700;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.fallback-note{grid-column:1/-1;padding:18px 20px;border:1px solid #dbe3ef;border-radius:8px;background:#fff;color:#475569}
.fallback-note h2{margin:0 0 6px;font-size:20px;line-height:1.25;color:#172033}
.fallback-note p{margin:0;font-size:14px;line-height:1.6}
.card{background:#fff;border:1px solid #dbe3ef;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;min-height:100%;box-shadow:0 10px 24px rgba(15,23,42,.06)}
.thumb{aspect-ratio:16/9;width:100%;object-fit:cover;background:#e2e8f0;display:block}
.thumb-placeholder{aspect-ratio:16/9;background:linear-gradient(135deg,#e0f2fe,#fef3c7);display:flex;align-items:center;justify-content:center;color:#334155;font-weight:800}
.card-body{padding:16px;display:flex;flex-direction:column;gap:10px;flex:1}
.badges{display:flex;flex-wrap:wrap;gap:6px}
.format-badge{display:inline-flex;align-items:center;width:max-content;padding:5px 9px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:12px;font-weight:800}
.card h2{font-size:19px;line-height:1.25;margin:0;color:#172033}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:0;color:#64748b;font-size:13px}
.meta span{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:#f1f5f9}
.author{margin:0;color:#475569;font-size:14px}
.author a{text-decoration:underline;text-underline-offset:3px}
.excerpt{margin:0;color:#475569;font-size:14px;line-height:1.6}
.read{display:inline-flex;margin-top:auto;color:#5b4bc4;font-weight:800;font-size:14px;transition:transform .18s ease,color .18s ease}
.read:hover{color:#463bb1;transform:translateY(-1px)}
.empty{background:#fff;border:1px solid #dbe3ef;border-radius:8px;padding:30px;text-align:center;color:#475569}
.empty h2{margin:0 0 8px;color:#172033}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:34px}.hero{grid-template-columns:1fr}.count{justify-self:start}}
@media(max-width:560px){.page{padding:22px 16px 44px}.grid{grid-template-columns:1fr}h1{font-size:30px}}
${PUBLIC_HEADER_STYLES}
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
  return absoluteUrl(
    story.coverImageUrl ?? story.scenes.find((scene) => scene.imageUrl)?.imageUrl,
    apiBase
  );
}

function getLanguageName(language: string, locale: PublicSeoLocale): string {
  const names: Record<string, Record<PublicSeoLocale, string>> = {
    uk: { uk: 'Українська', en: 'Ukrainian', ru: 'Украинский', es: 'Ucraniano', de: 'Ukrainisch', fr: 'Ukrainien', pl: 'Ukraiński' },
    en: { uk: 'Англійська', en: 'English', ru: 'Английский', es: 'Inglés', de: 'Englisch', fr: 'Anglais', pl: 'Angielski' },
    es: { uk: 'Іспанська', en: 'Spanish', ru: 'Испанский', es: 'Español', de: 'Spanisch', fr: 'Espagnol', pl: 'Hiszpański' },
    ru: { uk: 'Російська', en: 'Russian', ru: 'Русский', es: 'Ruso', de: 'Russisch', fr: 'Russe', pl: 'Rosyjski' },
    de: { uk: 'Німецька', en: 'German', ru: 'Немецкий', es: 'Alemán', de: 'Deutsch', fr: 'Allemand', pl: 'Niemiecki' },
    fr: { uk: 'Французька', en: 'French', ru: 'Французский', es: 'Francés', de: 'Französisch', fr: 'Français', pl: 'Francuski' },
    pl: { uk: 'Польська', en: 'Polish', ru: 'Польский', es: 'Polaco', de: 'Polnisch', fr: 'Polonais', pl: 'Polski' },
  };
  return names[language]?.[locale] ?? language.toUpperCase();
}

function renderAlternateLinks(webAppUrl: string, locale: PublicSeoLocale): string {
  const canonical = buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(locale));
  const alternates = PUBLIC_SEO_LOCALES.map((altLocale) => {
    const href = buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(altLocale));
    return `<link rel="alternate" hreflang="${altLocale}" href="${escapeHtml(href)}">`;
  });
  const xDefault = buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath());
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
      <div class="badges"><span class="format-badge">${escapeHtml(FORMAT_LABELS[locale][story.storyFormat ?? 'story'])}</span></div>
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
      storyFormat: story.storyFormat,
      authorId: story.authorId,
      authorDisplayName: story.authorDisplayName,
      authorAvatarUrl: story.authorAvatarUrl ?? null,
      coverImageUrl: story.coverImageUrl,
      coverThumbnailUrl: story.coverThumbnailUrl,
      scenes: coverScene
        ? [{
            sceneId: coverScene.sceneId,
            imageUrl: story.coverImageUrl ?? coverScene.imageUrl ?? null,
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
  fallbackStartIndex?: number | null;
}): string {
  const locale = normalizePublicSeoLocale(params.locale);
  const copy = CATALOG_COPY[locale];
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || 'https://wondertales.art';
  const apiBase = config.web?.apiPublicUrl?.replace(/\/$/, '') || webAppUrl;
  const webBundleUrl = getVersionedWebBundleUrl();
  const fullWebBundleUrl = webBundleUrl.startsWith('http')
    ? webBundleUrl
    : `${webAppUrl}${webBundleUrl.startsWith('/') ? '' : '/'}${webBundleUrl}`;
  const initialCatalogJson = JSON.stringify({
    stories: buildInitialCatalogStories(params.stories),
    pagination: { limit: params.stories.length, offset: 0, total: params.total },
  }).replace(/</g, '\\u003c');
  const fallbackStartIndex =
    typeof params.fallbackStartIndex === 'number' &&
    params.fallbackStartIndex >= 0 &&
    params.fallbackStartIndex < params.stories.length
      ? params.fallbackStartIndex
      : null;
  const storyCards = params.stories.map((story, index) => {
    const fallbackNote = fallbackStartIndex === index
      ? `<div class="fallback-note"><h2>${escapeHtml(copy.fallbackTitle)}</h2><p>${escapeHtml(copy.fallbackBody)}</p></div>`
      : '';
    return `${fallbackNote}${renderStoryCard(story, locale, webAppUrl, apiBase, copy)}`;
  }).join('\n');

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
    ${renderPublicPageHeader(webAppUrl, locale, 'stories')}
    <main class="page">
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
          ? `<section class="grid">${storyCards}</section>`
          : `<section class="empty"><h2>${escapeHtml(copy.emptyTitle)}</h2><p>${escapeHtml(copy.emptyBody)}</p></section>`
      }
    </main>
    ${renderPublicPageFooter(webAppUrl, locale, buildPublicFooterLanguageLinks(webAppUrl, buildPublicStoriesPath), 'stories')}
  </div>
  <script>window.__INITIAL_STORIES__ = ${initialCatalogJson};</script>
  <script src="${escapeHtml(fullWebBundleUrl)}" defer></script>
</body>
</html>`;
}
