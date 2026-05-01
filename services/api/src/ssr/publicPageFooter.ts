import {
  buildAbsoluteRouteUrl,
  buildPublicLandingPath,
  buildPublicLegalPath,
  buildPublicPricingPath,
  buildPublicStoriesPath,
  normalizePublicSeoLocale,
} from '@wondertales/shared';

export const PUBLIC_FOOTER_STYLES = `
.site-footer{border-top:1px solid rgba(148,163,184,.35);padding:28px 24px;text-align:center;color:#64748b;background:rgba(255,255,255,.88)}
.site-footer nav{display:flex;flex-wrap:wrap;justify-content:center;gap:16px 24px;margin-bottom:12px}
.site-footer a{color:#475569;text-decoration:none;font-size:14px;font-weight:600}
.site-footer a:hover{color:#0ea5e9;text-decoration:underline}
.site-footer .site-footer-note{margin:0;font-size:13px;color:#94a3b8}
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderPublicPageFooter(webAppUrl: string, locale?: string | null): string {
  const normalizedLocale = normalizePublicSeoLocale(locale);
  const links = [
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicLandingPath(normalizedLocale)), label: 'Home' },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicPricingPath(normalizedLocale)), label: 'Pricing' },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicStoriesPath(normalizedLocale)), label: 'Stories' },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath('terms', normalizedLocale)), label: 'Terms' },
    { href: buildAbsoluteRouteUrl(webAppUrl, buildPublicLegalPath('privacy', normalizedLocale)), label: 'Privacy' },
    { href: buildAbsoluteRouteUrl(webAppUrl, '/support'), label: 'Support' },
  ];

  return `
    <footer class="site-footer">
      <nav aria-label="Footer">
        ${links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}
      </nav>
      <p class="site-footer-note">© ${new Date().getUTCFullYear()} WonderTales</p>
    </footer>`;
}
