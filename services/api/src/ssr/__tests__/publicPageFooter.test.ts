import assert from 'node:assert/strict';
import {
  PUBLIC_SEO_LOCALES,
  buildAbsoluteRouteUrl,
  buildPublicBlogIndexPath,
  buildPublicLandingPath,
  buildPublicPricingPath,
  buildPublicStoriesPath,
  buildPublicUpdatesPath,
} from '@wondertales/shared';
import {
  PUBLIC_HEADER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageHeader,
  renderPublicPageFooter,
} from '../publicPageFooter';

const footerLabels = {
  uk: ['Тарифи', 'Історії', 'Блог', 'Оновлення', 'Умови користування', 'Політика конфіденційності', 'Підтримка', 'Мова'],
  en: ['Pricing', 'Stories', 'Blog', 'Updates', 'Terms', 'Privacy', 'Support', 'Language'],
  ru: ['Тарифы', 'Истории', 'Блог', 'Обновления', 'Условия', 'Конфиденциальность', 'Поддержка', 'Язык'],
  es: ['Precios', 'Historias', 'Blog', 'Novedades', 'Términos', 'Privacidad', 'Soporte', 'Idioma'],
  de: ['Preise', 'Geschichten', 'Blog', 'Neuigkeiten', 'Nutzungsbedingungen', 'Datenschutz', 'Support', 'Sprache'],
  fr: ['Tarifs', 'Histoires', 'Blog', 'Nouveautés', 'Conditions', 'Confidentialité', 'Assistance', 'Langue'],
  pl: ['Cennik', 'Historie', 'Blog', 'Aktualności', 'Warunki', 'Prywatność', 'Pomoc', 'Język'],
} as const;

const headerLabels = {
  uk: ['Тарифи', 'Історії', 'Блог'],
  en: ['Pricing', 'Stories', 'Blog'],
  ru: ['Тарифы', 'Истории', 'Блог'],
  es: ['Precios', 'Historias', 'Blog'],
  de: ['Preise', 'Geschichten', 'Blog'],
  fr: ['Tarifs', 'Histoires', 'Blog'],
  pl: ['Cennik', 'Historie', 'Blog'],
} as const;

const footerHomeLabels = {
  uk: 'Головна',
  en: 'Home',
  ru: 'Главная',
  es: 'Inicio',
  de: 'Startseite',
  fr: 'Accueil',
  pl: 'Strona główna',
} as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const locale of PUBLIC_SEO_LOCALES) {
  const html = renderPublicPageFooter(
    'https://wondertales.art',
    locale,
    buildPublicFooterLanguageLinks('https://wondertales.art', buildPublicLandingPath),
    'pricing'
  );

  for (const label of footerLabels[locale]) {
    assert.match(html, new RegExp(escapeRegExp(label)));
  }
  assert.doesNotMatch(html, new RegExp(`>${escapeRegExp(footerHomeLabels[locale])}<`));

  const selectedHref = buildAbsoluteRouteUrl('https://wondertales.art', buildPublicLandingPath(locale));
  assert.match(html, new RegExp(`<option value="${escapeRegExp(selectedHref)}" selected>`));
  assert.match(
    html,
    new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicPricingPath(locale)))}" class="active" aria-current="page"`)
  );
  assert.match(html, new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicUpdatesPath(locale)))}"`));

  const headerHtml = renderPublicPageHeader('https://wondertales.art', locale, 'pricing');
  assert.match(headerHtml, /<header class="site-header" data-site-header>/);
  assert.match(headerHtml, /data-site-header-menu-toggle/);
  assert.match(headerHtml, /aria-expanded="false"/);
  assert.match(headerHtml, /aria-controls="site-header-mobile-nav"/);
  assert.match(headerHtml, /id="site-header-mobile-nav"/);
  assert.match(headerHtml, /site-header-menu-open/);
  assert.match(PUBLIC_HEADER_STYLES, /\.site-header-mobile-nav\{display:none;position:fixed/);
  assert.match(PUBLIC_HEADER_STYLES, /background:linear-gradient\(135deg,rgba\(255,253,250,\.76\) 0%,rgba\(238,234,248,\.68\) 52%,rgba\(255,227,210,\.70\) 100%\);backdrop-filter:blur\(10px\) saturate\(1\.18\)/);
  assert.doesNotMatch(PUBLIC_HEADER_STYLES, /\.site-header-mobile-nav::before/);
  assert.match(PUBLIC_HEADER_STYLES, /site-header-menu-open\{[^}]*backdrop-filter:blur\(14px\)/);
  assert.match(PUBLIC_HEADER_STYLES, /\.site-header-menu-toggle\{[^}]*transition:transform \.18s ease/);
  assert.match(PUBLIC_HEADER_STYLES, /\.site-header-menu-toggle:hover\{[^}]*transform:translateY\(-1px\)/);
  assert.match(headerHtml, /site-header-mobile-nav-open/);
  assert.match(headerHtml, /setMenuOpen\(!header\.classList\.contains\('site-header-menu-open'\)\)/);
  assert.match(headerHtml, /site-header-scrolled/);
  assert.match(headerHtml, /window\.scrollY > 0/);
  for (const label of headerLabels[locale]) {
    assert.match(headerHtml, new RegExp(`>${escapeRegExp(label)}<`));
  }
  assert.match(headerHtml, new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicPricingPath(locale)))}"`));
  assert.match(
    headerHtml,
    new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicPricingPath(locale)))}" class="active" aria-current="page"`)
  );
  assert.match(headerHtml, new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicStoriesPath(locale)))}"`));
  assert.match(headerHtml, new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicBlogIndexPath(locale)))}"`));
}

console.log('publicPageFooter tests passed');
