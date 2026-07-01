import assert from 'node:assert/strict';
import {
  PUBLIC_SEO_LOCALES,
  buildAbsoluteRouteUrl,
  buildPublicBlogIndexPath,
  buildPublicLandingPath,
  buildPublicPricingPath,
  buildPublicStoriesPath,
} from '@wondertales/shared';
import {
  buildPublicFooterLanguageLinks,
  renderPublicPageHeader,
  renderPublicPageFooter,
} from '../publicPageFooter';

const footerLabels = {
  uk: ['Тарифи', 'Історії', 'Блог', 'Умови користування', 'Політика конфіденційності', 'Підтримка', 'Мова'],
  en: ['Pricing', 'Stories', 'Blog', 'Terms', 'Privacy', 'Support', 'Language'],
  ru: ['Тарифы', 'Истории', 'Блог', 'Условия', 'Конфиденциальность', 'Поддержка', 'Язык'],
  es: ['Precios', 'Cuentos', 'Blog', 'Términos', 'Privacidad', 'Soporte', 'Idioma'],
  de: ['Preise', 'Geschichten', 'Blog', 'Nutzungsbedingungen', 'Datenschutz', 'Support', 'Sprache'],
  fr: ['Tarifs', 'Histoires', 'Blog', 'Conditions', 'Confidentialité', 'Assistance', 'Langue'],
  pl: ['Cennik', 'Historie', 'Blog', 'Warunki', 'Prywatność', 'Pomoc', 'Język'],
} as const;

const headerLabels = {
  uk: ['Тарифи', 'Історії', 'Блог'],
  en: ['Pricing', 'Stories', 'Blog'],
  ru: ['Тарифы', 'Истории', 'Блог'],
  es: ['Precios', 'Cuentos', 'Blog'],
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
    buildPublicFooterLanguageLinks('https://wondertales.art', buildPublicLandingPath)
  );

  for (const label of footerLabels[locale]) {
    assert.match(html, new RegExp(escapeRegExp(label)));
  }
  assert.doesNotMatch(html, new RegExp(`>${escapeRegExp(footerHomeLabels[locale])}<`));

  const selectedHref = buildAbsoluteRouteUrl('https://wondertales.art', buildPublicLandingPath(locale));
  assert.match(html, new RegExp(`<option value="${escapeRegExp(selectedHref)}" selected>`));

  const headerHtml = renderPublicPageHeader('https://wondertales.art', locale);
  assert.match(headerHtml, /<header class="site-header" data-site-header>/);
  assert.match(headerHtml, /site-header-scrolled/);
  assert.match(headerHtml, /window\.scrollY > 0/);
  for (const label of headerLabels[locale]) {
    assert.match(headerHtml, new RegExp(`>${escapeRegExp(label)}<`));
  }
  assert.match(headerHtml, new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicPricingPath(locale)))}"`));
  assert.match(headerHtml, new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicStoriesPath(locale)))}"`));
  assert.match(headerHtml, new RegExp(`href="${escapeRegExp(buildAbsoluteRouteUrl('https://wondertales.art', buildPublicBlogIndexPath(locale)))}"`));
}

console.log('publicPageFooter tests passed');
