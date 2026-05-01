import { config } from '../config';
import { PUBLIC_FOOTER_STYLES, renderPublicPageFooter } from './publicPageFooter';

const SUPPORT_STYLES = `
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6}
.support-page{min-height:100vh;display:flex;flex-direction:column}
.support-wrap{width:100%;max-width:820px;margin:0 auto;padding:32px 24px 56px;flex:1}
.support-nav{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:48px}
.support-brand{font-size:20px;font-weight:800;color:#111827;text-decoration:none}
.support-nav a{color:#64748b;text-decoration:none;font-size:14px;font-weight:600}
.support-nav a:hover{color:#0ea5e9;text-decoration:underline}
.support-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;box-shadow:0 18px 40px rgba(15,23,42,.06)}
.support-card h1{margin:0 0 12px;font-size:36px;line-height:1.1;color:#0f172a}
.support-card p{margin:0 0 18px;color:#475569}
.support-card h2{margin:32px 0 12px;font-size:20px;color:#0f172a}
.support-list{margin:0 0 24px;padding-left:22px;color:#475569}
.support-list li{margin-bottom:8px}
.support-email{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;background:#111827;color:#fff;text-decoration:none;font-weight:700}
.support-email:hover{opacity:.92}
.support-small{font-size:14px;color:#64748b}
${PUBLIC_FOOTER_STYLES}
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

export function renderSupportHtml(): string {
  const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '');
  const supportEmail = config.web?.supportEmail || 'support@wondertales.art';
  const supportUrl = buildUrl(webAppUrl, '/support');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <title>Support — WonderTales</title>
  <meta name="description" content="Contact WonderTales support for account, billing, safety, privacy, and data requests.">
  <link rel="canonical" href="${escapeHtml(supportUrl)}">
  <style>${SUPPORT_STYLES}</style>
</head>
<body>
  <div class="support-page">
    <main class="support-wrap">
      <nav class="support-nav" aria-label="Support navigation">
        <a class="support-brand" href="${escapeHtml(buildUrl(webAppUrl, '/'))}">WonderTales</a>
        <a href="${escapeHtml(buildUrl(webAppUrl, '/pricing'))}">Pricing</a>
      </nav>
      <section class="support-card">
        <h1>Support</h1>
        <p>We can help with account access, billing, child privacy, story safety, public sharing, refunds, cancellation, and data deletion requests.</p>
        <a class="support-email" href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>

        <h2>What to include</h2>
        <ul class="support-list">
          <li>Your account email, if you have one.</li>
          <li>The story URL or title, if the request is about a story.</li>
          <li>A short description of what happened and what you need changed.</li>
        </ul>

        <p class="support-small">Please do not send passwords, payment card numbers, or sensitive identity documents by email.</p>
      </section>
    </main>
    ${renderPublicPageFooter(webAppUrl)}
  </div>
</body>
</html>`;
}
