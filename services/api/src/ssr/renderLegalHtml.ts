/**
 * Render Terms of Service and Privacy Policy as static HTML
 * Served at /ssr/legal/terms and /ssr/legal/privacy
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { marked } from 'marked';
import {
  buildAbsoluteRouteUrl,
  DEFAULT_PUBLIC_SEO_LOCALE,
  buildPublicLegalPath,
  PUBLIC_SEO_LOCALES,
  type PublicSeoLocale,
} from '@wondertales/shared';
import { config } from '../config';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import {
  PUBLIC_FOOTER_STYLES,
  PUBLIC_HEADER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageHeader,
  renderPublicPageFooter,
} from './publicPageFooter';

const LEGAL_DIR = join(__dirname, '../legal');

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const LEGAL_STYLES = `
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:0;line-height:1.6;color:#1e293b;background:#f8fafc}
.legal-wrapper{min-height:100vh;display:flex;flex-direction:column}
.legal-content{flex:1;max-width:800px;margin:0 auto;padding:32px 24px 64px;width:100%}
.legal-content h1{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 24px}
.legal-content h2{font-size:20px;font-weight:600;color:#1e293b;margin:32px 0 16px}
.legal-content p{margin:0 0 16px;color:#475569}
.legal-content ul, .legal-content ol{margin:0 0 16px;padding-left:24px;color:#475569}
.legal-content li{margin-bottom:8px}
.legal-content a{color:#0ea5e9;text-decoration:none}
.legal-content a:hover{text-decoration:underline}
${PUBLIC_HEADER_STYLES}
${PUBLIC_FOOTER_STYLES}
`;

export interface RenderLegalOptions {
  doc: 'terms' | 'privacy';
  locale: string;
}

const PUBLIC_LEGAL_LOCALES = PUBLIC_SEO_LOCALES;
type PublicLegalLocale = PublicSeoLocale;

const LEGAL_COPY: Record<PublicLegalLocale, {
  termsTitle: string;
  termsDescription: string;
  privacyTitle: string;
  privacyDescription: string;
  backToSite: string;
}> = {
  uk: {
    termsTitle: 'Умови користування — WonderTales',
    termsDescription: 'Умови користування сервісом WonderTales',
    privacyTitle: 'Політика приватності — WonderTales',
    privacyDescription: 'Як WonderTales збирає та використовує персональні дані',
    backToSite: '← На головну',
  },
  en: {
    termsTitle: 'Terms of Service — WonderTales',
    termsDescription: 'Terms of use of the WonderTales service',
    privacyTitle: 'Privacy Policy — WonderTales',
    privacyDescription: 'How WonderTales collects and uses personal data',
    backToSite: '← Back to site',
  },
  ru: {
    termsTitle: 'Условия использования — WonderTales',
    termsDescription: 'Условия использования сервиса WonderTales',
    privacyTitle: 'Политика конфиденциальности — WonderTales',
    privacyDescription: 'Как WonderTales собирает и использует персональные данные',
    backToSite: '← На главную',
  },
  es: {
    termsTitle: 'Términos de servicio — WonderTales',
    termsDescription: 'Términos de uso del servicio WonderTales',
    privacyTitle: 'Política de privacidad — WonderTales',
    privacyDescription: 'Cómo WonderTales recopila y utiliza datos personales',
    backToSite: '← Volver al sitio',
  },
  de: {
    termsTitle: 'Nutzungsbedingungen — WonderTales',
    termsDescription: 'Nutzungsbedingungen des WonderTales-Dienstes',
    privacyTitle: 'Datenschutzerklärung — WonderTales',
    privacyDescription: 'Wie WonderTales personenbezogene Daten erhebt und verwendet',
    backToSite: '← Zur Startseite',
  },
  fr: {
    termsTitle: "Conditions d'utilisation — WonderTales",
    termsDescription: "Conditions d'utilisation du service WonderTales",
    privacyTitle: 'Politique de confidentialité — WonderTales',
    privacyDescription: 'Comment WonderTales collecte et utilise les données personnelles',
    backToSite: '← Retour au site',
  },
  pl: {
    termsTitle: 'Regulamin — WonderTales',
    termsDescription: 'Warunki korzystania z usługi WonderTales',
    privacyTitle: 'Polityka prywatności — WonderTales',
    privacyDescription: 'Jak WonderTales zbiera i wykorzystuje dane osobowe',
    backToSite: '← Strona główna',
  },
};

export function resolveLegalLocale(locale?: string | null): PublicLegalLocale {
  const normalized = locale?.slice(0, 2).toLowerCase();
  if (!normalized) {
    return DEFAULT_PUBLIC_SEO_LOCALE;
  }

  return (PUBLIC_LEGAL_LOCALES as readonly string[]).includes(normalized)
    ? (normalized as PublicLegalLocale)
    : 'en';
}

async function loadMarkdown(doc: 'terms' | 'privacy', locale: string): Promise<string> {
  const resolved = resolveLegalLocale(locale);
  const path = join(LEGAL_DIR, doc, `${resolved}.md`);
  try {
    return await readFile(path, 'utf-8');
  } catch {
    if (resolved !== 'en') {
      try {
        return await readFile(join(LEGAL_DIR, doc, 'en.md'), 'utf-8');
      } catch {
        // Fallback to minimal content
      }
    }
  }
  return doc === 'terms'
    ? '# Terms of Service\n\nContent not available.'
    : '# Privacy Policy\n\nContent not available.';
}

function buildLegalAlternateLinks(webAppUrl: string, doc: 'terms' | 'privacy'): string {
  const defaultUrl = escapeHtml(buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath(doc)));
  const alternates = PUBLIC_LEGAL_LOCALES.map((locale) => {
    const href = buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath(doc, locale));
    return `<link rel="alternate" hreflang="${locale}" href="${escapeHtml(href)}">`;
  });
  alternates.push(`<link rel="alternate" hreflang="x-default" href="${defaultUrl}">`);
  return alternates.join('\n  ');
}

export async function renderLegalHtml(options: RenderLegalOptions): Promise<string> {
  const { doc, locale } = options;
  const resolvedLocale = resolveLegalLocale(locale);
  const copy = LEGAL_COPY[resolvedLocale];
  const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '') || '';
  const legalUrl = buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath(doc, resolvedLocale));

  const markdown = await loadMarkdown(doc, resolvedLocale);
  const bodyHtml = (await marked.parse(markdown)) as string;
  const currentPage = doc === 'terms' ? 'terms' : 'privacy';

  const title = doc === 'terms' ? copy.termsTitle : copy.privacyTitle;
  const description = doc === 'terms' ? copy.termsDescription : copy.privacyDescription;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(resolvedLocale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  ${PUBLIC_HEAD_ASSET_LINKS}
  <link rel="canonical" href="${escapeHtml(legalUrl)}">
  ${buildLegalAlternateLinks(webAppUrl, doc)}
  <style>${LEGAL_STYLES}</style>
</head>
<body>
  <div class="legal-wrapper">
    ${renderPublicPageHeader(webAppUrl, resolvedLocale, currentPage)}
    <main class="legal-content">
      ${bodyHtml}
    </main>
    ${renderPublicPageFooter(
      webAppUrl,
      resolvedLocale,
      buildLegalFooterLanguageLinks(webAppUrl, doc),
      currentPage
    )}
  </div>
</body>
</html>`;
}

function buildLegalFooterLanguageLinks(webAppUrl: string, doc: 'terms' | 'privacy') {
  return buildPublicFooterLanguageLinks(webAppUrl, (locale) => buildPublicLegalPath(doc, locale));
}
