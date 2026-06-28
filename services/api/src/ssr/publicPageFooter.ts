import {
  buildAbsoluteRouteUrl,
  buildPublicBlogIndexPath,
  buildPublicLandingPath,
  buildPublicLegalPath,
  buildPublicPricingPath,
  buildPublicStoriesPath,
  buildPublicSupportPath,
  normalizePublicSeoLocale,
  PUBLIC_SEO_LOCALES,
  type PublicSeoLocale,
} from '@wondertales/shared';
import deTranslations from '@wondertales/shared/i18n/de.json';
import enTranslations from '@wondertales/shared/i18n/en.json';
import esTranslations from '@wondertales/shared/i18n/es.json';
import frTranslations from '@wondertales/shared/i18n/fr.json';
import plTranslations from '@wondertales/shared/i18n/pl.json';
import ruTranslations from '@wondertales/shared/i18n/ru.json';
import ukTranslations from '@wondertales/shared/i18n/uk.json';

export const PUBLIC_FOOTER_STYLES = `
.site-footer{border-top:1px solid rgba(148,163,184,.35);padding:28px 24px;text-align:center;color:#64748b;background:rgba(255,255,255,.88)}
.site-footer nav{display:flex;flex-wrap:wrap;justify-content:center;gap:16px 24px;margin-bottom:12px}
.site-footer a{color:#475569;text-decoration:none;font-size:14px;font-weight:600}
.site-footer a:hover{color:#0ea5e9;text-decoration:underline}
.site-footer-language{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin:0 0 12px;font-size:13px;color:#64748b}
.site-footer-language span{font-weight:700}
.site-footer-language select{min-height:34px;border:1px solid rgba(148,163,184,.45);border-radius:8px;background:#fff;color:#334155;padding:0 10px;font:inherit;font-weight:600}
.site-footer .site-footer-note{margin:0;font-size:13px;color:#94a3b8}
@media(max-width:520px){.site-footer-language{flex-wrap:wrap}}
`;

export interface PublicFooterLanguageLink {
  locale: PublicSeoLocale;
  label: string;
  href: string;
}

interface PublicFooterCopy {
  aria_label: string;
  language: string;
  home: string;
  pricing: string;
  stories: string;
  blog: string;
  terms: string;
  privacy: string;
  support: string;
}

interface PublicI18nBundle {
  language_names: Record<PublicSeoLocale, string>;
  public_footer: PublicFooterCopy;
}

const PUBLIC_I18N: Record<PublicSeoLocale, PublicI18nBundle> = {
  uk: ukTranslations,
  en: enTranslations,
  ru: ruTranslations,
  es: esTranslations,
  de: deTranslations,
  fr: frTranslations,
  pl: plTranslations,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildPublicFooterLanguageLinks(
  webAppUrl: string,
  buildPath: (locale: PublicSeoLocale) => string
): PublicFooterLanguageLink[] {
  return PUBLIC_SEO_LOCALES.map((locale) => ({
    locale,
    label: PUBLIC_I18N[locale].language_names[locale],
    href: buildAbsoluteRouteUrl(webAppUrl, buildPath(locale)),
  }));
}

function renderLanguageSwitcher(
  currentLocale: PublicSeoLocale,
  languageLinks?: PublicFooterLanguageLink[]
): string {
  if (!languageLinks || languageLinks.length < 2) {
    return '';
  }

  const label = PUBLIC_I18N[currentLocale].public_footer.language;
  const options = languageLinks.map((link) => {
    const selected = link.locale === currentLocale ? ' selected' : '';
    return `<option value="${escapeHtml(link.href)}"${selected}>${escapeHtml(link.label)}</option>`;
  }).join('');

  return `
      <label class="site-footer-language">
        <span>${escapeHtml(label)}</span>
        <select aria-label="${escapeHtml(label)}" id="public-language-switcher" name="public-language-switcher" data-public-language-switcher>${options}</select>
      </label>
      <script>
(function(){
  var select = document.querySelector('[data-public-language-switcher]');
  if (!select) return;
  select.addEventListener('change', function(){
    if (select.value) window.location.assign(select.value);
  });
}());
      </script>`;
}

export function renderPublicPageFooter(
  webAppUrl: string,
  locale?: string | null,
  languageLinks?: PublicFooterLanguageLink[]
): string {
  const normalizedLocale = normalizePublicSeoLocale(locale);
  const copy = PUBLIC_I18N[normalizedLocale].public_footer;
  const links = [
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicLandingPath(normalizedLocale)), label: copy.home },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicPricingPath(normalizedLocale)), label: copy.pricing },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(normalizedLocale)), label: copy.stories },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogIndexPath(normalizedLocale)), label: copy.blog },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath('terms', normalizedLocale)), label: copy.terms },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath('privacy', normalizedLocale)), label: copy.privacy },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicSupportPath(normalizedLocale)), label: copy.support },
  ];

  return `
    <footer class="site-footer">
      <nav aria-label="${escapeHtml(copy.aria_label)}">
        ${links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}
      </nav>
      ${renderLanguageSwitcher(normalizedLocale, languageLinks)}
      <p class="site-footer-note">© ${new Date().getUTCFullYear()} WonderTales</p>
    </footer>`;
}
