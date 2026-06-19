import assert from 'node:assert/strict';
import {
  PUBLIC_SEO_LOCALES,
  buildAbsoluteRouteUrl,
  buildPublicLandingPath,
} from '@wondertales/shared';
import {
  buildPublicFooterLanguageLinks,
  renderPublicPageFooter,
} from '../publicPageFooter';

const footerLabels = {
  uk: ['Головна', 'Тарифи', 'Історії', 'Блог', 'Умови користування', 'Політика конфіденційності', 'Підтримка', 'Мова'],
  en: ['Home', 'Pricing', 'Stories', 'Blog', 'Terms', 'Privacy', 'Support', 'Language'],
  ru: ['Главная', 'Тарифы', 'Истории', 'Блог', 'Условия', 'Конфиденциальность', 'Поддержка', 'Язык'],
  es: ['Inicio', 'Precios', 'Cuentos', 'Blog', 'Términos', 'Privacidad', 'Soporte', 'Idioma'],
  de: ['Startseite', 'Preise', 'Geschichten', 'Blog', 'Nutzungsbedingungen', 'Datenschutz', 'Support', 'Sprache'],
  fr: ['Accueil', 'Tarifs', 'Histoires', 'Blog', 'Conditions', 'Confidentialité', 'Assistance', 'Langue'],
  pl: ['Strona główna', 'Cennik', 'Historie', 'Blog', 'Warunki', 'Prywatność', 'Pomoc', 'Język'],
} as const;

for (const locale of PUBLIC_SEO_LOCALES) {
  const html = renderPublicPageFooter(
    'https://wondertales.art',
    locale,
    buildPublicFooterLanguageLinks('https://wondertales.art', buildPublicLandingPath)
  );

  for (const label of footerLabels[locale]) {
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const selectedHref = buildAbsoluteRouteUrl('https://wondertales.art', buildPublicLandingPath(locale));
  assert.match(html, new RegExp(`<option value="${selectedHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" selected>`));
}

console.log('publicPageFooter tests passed');
