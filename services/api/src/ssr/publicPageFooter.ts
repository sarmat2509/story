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
.site-footer a.active{color:#6d5bd0;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:5px}
.site-footer-language{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin:0 0 12px;font-size:13px;color:#64748b}
.site-footer-language span{font-weight:700}
.site-footer-language select{min-height:34px;border:1px solid rgba(148,163,184,.45);border-radius:8px;background:#fff;color:#334155;padding:0 10px;font:inherit;font-weight:600}
.site-footer .site-footer-note{margin:0;font-size:13px;color:#94a3b8}
@media(max-width:520px){.site-footer-language{flex-wrap:wrap}}
`;

export const PUBLIC_HEADER_STYLES = `
.site-header{position:sticky;top:0;z-index:50;width:100%;border-bottom:1px solid transparent;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;transition:background-color .18s ease,border-color .18s ease,backdrop-filter .18s ease,-webkit-backdrop-filter .18s ease,box-shadow .18s ease}
.site-header.site-header-scrolled{border-bottom-color:rgba(148,163,184,.28);background:rgba(255,255,255,.7);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(15,23,42,.06)}
.site-header-inner{width:min(100%,1180px);margin:0 auto;padding:14px clamp(16px,4vw,24px);display:flex;align-items:center;justify-content:space-between;gap:20px}
.site-header-brand{display:inline-flex;align-items:center;gap:10px;color:#172033;text-decoration:none;font-size:18px;font-weight:900;line-height:1}
.site-header-brand img{width:46px;height:46px;border-radius:14px;display:block;object-fit:cover;box-shadow:0 14px 28px rgba(18,27,44,.15)}
.site-header-menu-toggle{display:none}
.site-header-nav{display:flex;align-items:center;justify-content:flex-end;gap:40px;color:#475569;font-size:14px;font-weight:750}
.site-header-nav a{color:inherit;text-decoration:none;border-radius:999px;padding:12px 18px;margin:-12px -18px}
.site-header-nav a:hover{color:#6d5bd0;text-decoration:underline;text-underline-offset:4px}
.site-header-nav a.active{color:#6d5bd0;background:rgba(109,91,208,.10);text-decoration:none}
.site-header-mobile-nav{display:none}
.site-header.site-header-menu-open{border-bottom-color:rgba(148,163,184,.28);background:rgba(255,255,255,.7);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 10px 30px rgba(15,23,42,.06)}
@media(max-width:560px){.site-header-inner{position:relative;align-items:center;gap:14px}.site-header-brand img{width:36px;height:36px;border-radius:10px;box-shadow:0 10px 22px rgba(18,27,44,.12)}.site-header-menu-toggle{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border:1px solid rgba(116,102,166,.24);border-radius:999px;background:rgba(255,255,255,.72);color:#172033;padding:0;cursor:pointer;box-shadow:0 10px 24px rgba(18,27,44,.08);transition:transform .18s ease,background .18s ease,box-shadow .18s ease,border-color .18s ease}.site-header-menu-toggle:hover{background:#fff;transform:translateY(-1px);box-shadow:0 14px 30px rgba(18,27,44,.12)}.site-header-menu-icon,.site-header-menu-icon::before,.site-header-menu-icon::after{display:block;width:18px;height:2px;border-radius:999px;background:currentColor;transition:transform .16s ease,opacity .16s ease}.site-header-menu-icon{position:relative}.site-header-menu-icon::before,.site-header-menu-icon::after{content:"";position:absolute;left:0}.site-header-menu-icon::before{top:-6px}.site-header-menu-icon::after{top:6px}.site-header.site-header-menu-open .site-header-menu-icon{transform:rotate(45deg)}.site-header.site-header-menu-open .site-header-menu-icon::before{opacity:0}.site-header.site-header-menu-open .site-header-menu-icon::after{top:0;transform:rotate(-90deg)}.site-header-nav{display:none}.site-header-mobile-nav{display:none;position:fixed;top:78px;right:clamp(16px,4vw,24px);z-index:70;min-width:168px;flex-direction:column;align-items:stretch;gap:4px;padding:10px;border:1px solid rgba(116,102,166,.24);border-radius:18px;background:linear-gradient(135deg,rgba(255,253,250,.76) 0%,rgba(238,234,248,.68) 52%,rgba(255,227,210,.70) 100%);backdrop-filter:blur(10px) saturate(1.18);-webkit-backdrop-filter:blur(10px) saturate(1.18);box-shadow:0 18px 42px rgba(18,27,44,.18),inset 0 1px 0 rgba(255,255,255,.42);overflow:hidden}.site-header-mobile-nav.site-header-mobile-nav-open{display:flex}.site-header-mobile-nav a{color:#475569;text-decoration:none;border-radius:999px;margin:0;padding:10px 12px;text-align:right;font-size:14px;font-weight:750}.site-header-mobile-nav a:hover{color:#6d5bd0;text-decoration:underline;text-underline-offset:4px}.site-header-mobile-nav a.active{color:#6d5bd0;background:rgba(109,91,208,.10);text-decoration:none}}
`;

export interface PublicFooterLanguageLink {
  locale: PublicSeoLocale;
  label: string;
  href: string;
}

export type PublicPageNavId = 'pricing' | 'stories' | 'blog' | 'terms' | 'privacy' | 'support';

interface PublicPageNavLink {
  id: PublicPageNavId;
  href: string;
  label: string;
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

function renderPublicNavLink(link: PublicPageNavLink, currentPage?: PublicPageNavId): string {
  const active = link.id === currentPage;
  const classAttr = active ? ' class="active"' : '';
  const currentAttr = active ? ' aria-current="page"' : '';
  return `<a href="${escapeHtml(link.href)}"${classAttr}${currentAttr}>${escapeHtml(link.label)}</a>`;
}

export function renderPublicPageFooter(
  webAppUrl: string,
  locale?: string | null,
  languageLinks?: PublicFooterLanguageLink[],
  currentPage?: PublicPageNavId
): string {
  const normalizedLocale = normalizePublicSeoLocale(locale);
  const copy = PUBLIC_I18N[normalizedLocale].public_footer;
  const links = [
    { id: 'pricing', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicPricingPath(normalizedLocale)), label: copy.pricing },
    { id: 'stories', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(normalizedLocale)), label: copy.stories },
    { id: 'blog', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogIndexPath(normalizedLocale)), label: copy.blog },
    { id: 'terms', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath('terms', normalizedLocale)), label: copy.terms },
    { id: 'privacy', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath('privacy', normalizedLocale)), label: copy.privacy },
    { id: 'support', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicSupportPath(normalizedLocale)), label: copy.support },
  ] satisfies PublicPageNavLink[];

  return `
    <footer class="site-footer">
      <nav aria-label="${escapeHtml(copy.aria_label)}">
        ${links.map((link) => renderPublicNavLink(link, currentPage)).join('')}
      </nav>
      ${renderLanguageSwitcher(normalizedLocale, languageLinks)}
      <p class="site-footer-note">© ${new Date().getUTCFullYear()} WonderTales</p>
    </footer>`;
}

export function renderPublicPageHeader(
  webAppUrl: string,
  locale?: string | null,
  currentPage?: PublicPageNavId
): string {
  const normalizedLocale = normalizePublicSeoLocale(locale);
  const copy = PUBLIC_I18N[normalizedLocale].public_footer;
  const links = [
    { id: 'pricing', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicPricingPath(normalizedLocale)), label: copy.pricing },
    { id: 'stories', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(normalizedLocale)), label: copy.stories },
    { id: 'blog', href: buildAbsoluteRouteUrl(webAppUrl, buildPublicBlogIndexPath(normalizedLocale)), label: copy.blog },
  ] satisfies PublicPageNavLink[];

  return `
    <header class="site-header" data-site-header>
      <div class="site-header-inner">
        <a class="site-header-brand" href="${escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicLandingPath(normalizedLocale)))}" aria-label="WonderTales">
          <img src="/icon-192.png" alt="" width="46" height="46" />
          <span>WonderTales</span>
        </a>
        <button class="site-header-menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-header-mobile-nav" data-site-header-menu-toggle>
          <span class="site-header-menu-icon" aria-hidden="true"></span>
        </button>
        <nav class="site-header-nav" aria-label="WonderTales">
          ${links.map((link) => renderPublicNavLink(link, currentPage)).join('')}
        </nav>
      </div>
    </header>
    <nav class="site-header-mobile-nav" id="site-header-mobile-nav" aria-label="WonderTales">
      ${links.map((link) => renderPublicNavLink(link, currentPage)).join('')}
    </nav>
    <script>
(function(){
  var header = document.querySelector('[data-site-header]');
  if (!header) return;
  var toggle = header.querySelector('[data-site-header-menu-toggle]');
  var mobileNav = document.querySelector('#site-header-mobile-nav');
  var setMenuOpen = function(open){
    header.classList.toggle('site-header-menu-open', open);
    if (mobileNav) mobileNav.classList.toggle('site-header-mobile-nav-open', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  var updateHeader = function(){
    header.classList.toggle('site-header-scrolled', window.scrollY > 0);
  };
  if (toggle) {
    toggle.addEventListener('click', function(){
      setMenuOpen(!header.classList.contains('site-header-menu-open'));
    });
  }
  if (mobileNav) {
    mobileNav.addEventListener('click', function(event){
      if (event.target && event.target.closest && event.target.closest('a')) setMenuOpen(false);
    });
  }
  window.addEventListener('keydown', function(event){
    if (event.key === 'Escape') setMenuOpen(false);
  });
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });
}());
    </script>`;
}
