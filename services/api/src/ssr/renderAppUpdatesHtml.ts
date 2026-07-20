import {
  DEFAULT_PUBLIC_SEO_LOCALE,
  PUBLIC_SEO_LOCALES,
  buildAbsoluteRouteUrl,
  buildPublicAppEntryPath,
  buildPublicUpdatesPath,
  escapeHtml,
  normalizePublicSeoLocale,
  type PublicSeoLocale,
} from '@wondertales/shared';
import { config } from '../config';
import type { PublishedAppRelease } from '../repositories/AppReleaseRepository';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import { renderSimplePageStructuredData } from './publicStructuredData';
import {
  PUBLIC_FOOTER_STYLES,
  PUBLIC_HEADER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageFooter,
  renderPublicPageHeader,
} from './publicPageFooter';

interface UpdatesCopy {
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  newLabel: string;
  improvedLabel: string;
  fixedLabel: string;
  readMore: string;
  openApp: string;
  empty: string;
}

const COPY: Record<PublicSeoLocale, UpdatesCopy> = {
  en: {
    title: 'What’s new in WonderTales — product updates',
    description:
      'WonderTales release notes: new storytelling features and useful improvements for families, listed by date.',
    eyebrow: 'WonderTales updates',
    h1: 'What’s new',
    intro:
      'A simple timeline of the changes that make family story time more personal, creative and comfortable.',
    newLabel: 'New',
    improvedLabel: 'Improved',
    fixedLabel: 'Fixed',
    readMore: 'Read more',
    openApp: 'Try it',
    empty: 'No published updates yet.',
  },
  uk: {
    title: 'Що нового у WonderTales — оновлення продукту',
    description:
      'Історія оновлень WonderTales: нові можливості для казок і корисні поліпшення для родин за датами.',
    eyebrow: 'Оновлення WonderTales',
    h1: 'Що нового',
    intro:
      'Проста хронологія змін, які роблять родинний час із казками особистішим, творчішим і зручнішим.',
    newLabel: 'Нове',
    improvedLabel: 'Поліпшено',
    fixedLabel: 'Виправлено',
    readMore: 'Докладніше',
    openApp: 'Спробувати',
    empty: 'Опублікованих оновлень поки немає.',
  },
  ru: {
    title: 'Что нового в WonderTales — обновления продукта',
    description:
      'История обновлений WonderTales: новые возможности для сказок и полезные улучшения для семей по датам.',
    eyebrow: 'Обновления WonderTales',
    h1: 'Что нового',
    intro:
      'Простая хронология изменений, которые делают семейное время со сказками более личным, творческим и удобным.',
    newLabel: 'Новое',
    improvedLabel: 'Улучшено',
    fixedLabel: 'Исправлено',
    readMore: 'Подробнее',
    openApp: 'Попробовать',
    empty: 'Опубликованных обновлений пока нет.',
  },
  es: {
    title: 'Novedades de WonderTales — actualizaciones del producto',
    description:
      'Notas de las versiones de WonderTales: nuevas funciones para crear cuentos y mejoras útiles para las familias, por fecha.',
    eyebrow: 'Novedades de WonderTales',
    h1: 'Qué hay de nuevo',
    intro:
      'Una cronología sencilla de los cambios que hacen que el momento de los cuentos sea más personal, creativo y cómodo.',
    newLabel: 'Nuevo',
    improvedLabel: 'Mejorado',
    fixedLabel: 'Corregido',
    readMore: 'Leer más',
    openApp: 'Probar',
    empty: 'Todavía no hay novedades publicadas.',
  },
  de: {
    title: 'Neu bei WonderTales — Produktupdates',
    description:
      'WonderTales-Versionshinweise: neue Funktionen für Geschichten und hilfreiche Verbesserungen für Familien nach Datum.',
    eyebrow: 'WonderTales-Updates',
    h1: 'Was ist neu?',
    intro:
      'Eine übersichtliche Zeitleiste mit Änderungen, die gemeinsame Geschichten persönlicher, kreativer und angenehmer machen.',
    newLabel: 'Neu',
    improvedLabel: 'Verbessert',
    fixedLabel: 'Behoben',
    readMore: 'Mehr erfahren',
    openApp: 'Ausprobieren',
    empty: 'Noch keine veröffentlichten Updates.',
  },
  fr: {
    title: 'Nouveautés WonderTales — mises à jour du produit',
    description:
      'Notes de version WonderTales : nouvelles fonctions de création et améliorations utiles aux familles, classées par date.',
    eyebrow: 'Nouveautés WonderTales',
    h1: 'Quoi de neuf ?',
    intro:
      'Une chronologie simple des changements qui rendent les histoires en famille plus personnelles, créatives et confortables.',
    newLabel: 'Nouveau',
    improvedLabel: 'Amélioré',
    fixedLabel: 'Corrigé',
    readMore: 'En savoir plus',
    openApp: 'Essayer',
    empty: 'Aucune nouveauté publiée pour le moment.',
  },
  pl: {
    title: 'Nowości w WonderTales — aktualizacje produktu',
    description:
      'Informacje o wydaniach WonderTales: nowe funkcje opowieści i przydatne ulepszenia dla rodzin uporządkowane według dat.',
    eyebrow: 'Aktualizacje WonderTales',
    h1: 'Co nowego',
    intro:
      'Prosta oś zmian, dzięki którym rodzinny czas z opowieściami jest bardziej osobisty, twórczy i wygodny.',
    newLabel: 'Nowość',
    improvedLabel: 'Ulepszono',
    fixedLabel: 'Naprawiono',
    readMore: 'Czytaj więcej',
    openApp: 'Wypróbuj',
    empty: 'Nie ma jeszcze opublikowanych aktualizacji.',
  },
};

const STYLES = `
*{box-sizing:border-box}html,body{min-height:100%}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fbf8ff;color:#17122d;line-height:1.55}.updates-page{min-height:100vh;display:flex;flex-direction:column;background:radial-gradient(circle at 8% 6%,rgba(255,121,82,.11),transparent 28%),radial-gradient(circle at 92% 8%,rgba(126,103,210,.14),transparent 30%),linear-gradient(180deg,#fffdfa,#fbf8ff)}.updates-wrap{width:min(100%,920px);margin:0 auto;padding:72px 24px 90px;flex:1}.updates-hero{text-align:center;margin:0 auto 66px;max-width:760px}.eyebrow{display:inline-flex;margin:0 0 18px;padding:8px 13px;border-radius:999px;background:#f1ecfc;color:#6c57c7;font-size:13px;font-weight:850}h1{margin:0 0 20px;font-size:clamp(44px,8vw,72px);line-height:1;letter-spacing:-.045em}.lead{margin:0;color:#655f7d;font-size:20px;line-height:1.7}.release-list{position:relative;display:grid;gap:34px}.release-list:before{content:'';position:absolute;left:116px;top:16px;bottom:16px;width:2px;background:linear-gradient(#7d67d2,rgba(125,103,210,.12))}.release{display:grid;grid-template-columns:90px minmax(0,1fr);gap:52px;position:relative}.release-date{padding-top:25px;text-align:right;color:#756d89;font-size:14px;font-weight:850}.release-dot{position:absolute;left:109px;top:30px;width:16px;height:16px;border:4px solid #fbf8ff;border-radius:50%;background:#7d67d2;box-shadow:0 0 0 2px rgba(125,103,210,.25)}.release-card{padding:30px;border:1px solid rgba(125,103,210,.14);border-radius:30px;background:rgba(255,255,255,.92);box-shadow:0 24px 64px rgba(31,24,67,.10)}.release-card h2{margin:0 0 22px;font-size:29px;line-height:1.16;letter-spacing:-.02em}.change-list{display:grid;gap:20px}.change{padding-top:20px;border-top:1px solid rgba(125,103,210,.13)}.change:first-child{padding-top:0;border-top:0}.change-label{display:inline-flex;margin:0 0 7px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.change-label-new{color:#3c6e2d;background:#edf7e8}.change-label-improved{color:#6650bd;background:#f1edff}.change-label-fixed{color:#9a4b2f;background:#fff0e8}.change h3{margin:0 0 7px;font-size:19px}.change p{margin:0;color:#625b77;font-size:16px;line-height:1.65}.change-links{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}.change-links a{color:#6c57c7;font-size:14px;font-weight:850;text-decoration:none}.change-links a:hover{text-decoration:underline}.empty{text-align:center;padding:40px;border-radius:26px;background:#fff;color:#655f7d}@media(max-width:680px){.updates-wrap{padding:48px 16px 60px}.updates-hero{margin-bottom:44px}.release-list:before{left:7px}.release{grid-template-columns:1fr;gap:10px;padding-left:28px}.release-date{text-align:left;padding:0}.release-dot{left:0;top:5px}.release-card{padding:23px;border-radius:25px}.release-card h2{font-size:25px}}
${PUBLIC_HEADER_STYLES}${PUBLIC_FOOTER_STYLES}`;

function renderAlternates(webAppUrl: string, locale: PublicSeoLocale): string {
  const links = PUBLIC_SEO_LOCALES.map(
    (alternate) =>
      `<link rel="alternate" hreflang="${alternate}" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicUpdatesPath(alternate)))}">`
  );
  return [
    `<link rel="canonical" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicUpdatesPath(locale)))}">`,
    ...links,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicUpdatesPath(DEFAULT_PUBLIC_SEO_LOCALE)))}">`,
  ].join('\n  ');
}

function formatDate(value: string, locale: PublicSeoLocale): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00Z`));
}

function renderRelease(
  release: PublishedAppRelease,
  copy: UpdatesCopy,
  locale: PublicSeoLocale,
  webAppUrl: string
): string {
  const labelByKind = { new: copy.newLabel, improved: copy.improvedLabel, fixed: copy.fixedLabel };
  const changes = release.changes
    .map((change) => {
      const links = [
        change.blogUrl
          ? `<a href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, change.blogUrl))}">${escapeHtml(copy.readMore)} →</a>`
          : '',
        change.appUrl
          ? `<a href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicAppEntryPath(change.appUrl, locale)))}">${escapeHtml(copy.openApp)} →</a>`
          : '',
      ]
        .filter(Boolean)
        .join('');
      return `<article class="change"><span class="change-label change-label-${change.kind}">${escapeHtml(labelByKind[change.kind])}</span><h3>${escapeHtml(change.title)}</h3><p>${escapeHtml(change.description)}</p>${links ? `<div class="change-links">${links}</div>` : ''}</article>`;
    })
    .join('');
  return `<section class="release"><time class="release-date" datetime="${escapeHtml(release.releaseDate)}">${escapeHtml(formatDate(release.releaseDate, locale))}</time><span class="release-dot" aria-hidden="true"></span><div class="release-card"><h2>${escapeHtml(release.title)}</h2><div class="change-list">${changes}</div></div></section>`;
}

export function renderAppUpdatesHtml(params: {
  locale?: string | null;
  releases: PublishedAppRelease[];
}): string {
  const locale = normalizePublicSeoLocale(params.locale);
  const copy = COPY[locale];
  const webAppUrl = (config.web?.webAppUrl || 'https://wondertales.art').replace(/\/$/, '');
  const canonical = buildAbsoluteRouteUrl(webAppUrl, buildPublicUpdatesPath(locale));
  const languageLinks = buildPublicFooterLanguageLinks(webAppUrl, buildPublicUpdatesPath);
  const releasesId = `${canonical}#releases`;
  const structuredData = renderSimplePageStructuredData({
    webAppUrl,
    pageUrl: canonical,
    pageType: 'CollectionPage',
    name: copy.h1,
    description: copy.description,
    locale,
    mainEntityId: releasesId,
    breadcrumbs: [
      { name: 'WonderTales', url: `${webAppUrl}/` },
      { name: copy.h1, url: canonical },
    ],
    extraNodes: [{
      '@type': 'ItemList',
      '@id': releasesId,
      numberOfItems: params.releases.length,
      itemListElement: params.releases.map((release, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'CreativeWork',
          name: release.title,
          datePublished: release.releaseDate,
          url: canonical,
          about: {
            '@type': 'SoftwareApplication',
            name: 'WonderTales',
            applicationCategory: 'EducationalApplication',
          },
        },
      })),
    }],
  });
  const timeline =
    params.releases.length > 0
      ? params.releases.map((release) => renderRelease(release, copy, locale, webAppUrl)).join('')
      : `<p class="empty">${escapeHtml(copy.empty)}</p>`;

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title><meta name="description" content="${escapeHtml(copy.description)}"><meta name="robots" content="index,follow"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(copy.title)}"><meta property="og:description" content="${escapeHtml(copy.description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${renderAlternates(webAppUrl, locale)}${PUBLIC_HEAD_ASSET_LINKS}${structuredData}<style>${STYLES}</style></head><body><div class="updates-page">${renderPublicPageHeader(webAppUrl, locale, 'updates')}<main class="updates-wrap"><header class="updates-hero"><p class="eyebrow">${escapeHtml(copy.eyebrow)}</p><h1>${escapeHtml(copy.h1)}</h1><p class="lead">${escapeHtml(copy.intro)}</p></header><div class="release-list">${timeline}</div></main>${renderPublicPageFooter(webAppUrl, locale, languageLinks, 'updates')}</div></body></html>`;
}
