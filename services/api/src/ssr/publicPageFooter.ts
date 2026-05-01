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

function buildUrl(webAppUrl: string, path: string): string {
  const base = webAppUrl.replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export function renderPublicPageFooter(webAppUrl: string): string {
  const links = [
    { href: buildUrl(webAppUrl, '/'), label: 'Home' },
    { href: buildUrl(webAppUrl, '/pricing'), label: 'Pricing' },
    { href: buildUrl(webAppUrl, '/stories'), label: 'Stories' },
    { href: buildUrl(webAppUrl, '/terms'), label: 'Terms' },
    { href: buildUrl(webAppUrl, '/privacy'), label: 'Privacy' },
    { href: buildUrl(webAppUrl, '/support'), label: 'Support' },
  ];

  return `
    <footer class="site-footer">
      <nav aria-label="Footer">
        ${links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}
      </nav>
      <p class="site-footer-note">© ${new Date().getUTCFullYear()} WonderTales</p>
    </footer>`;
}
