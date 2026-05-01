/**
 * Render Terms of Service and Privacy Policy as static HTML
 * Served at /ssr/legal/terms and /ssr/legal/privacy
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { marked } from 'marked';
import { DEFAULT_LOCALE, isValidLocale } from '@wondertales/shared';
import { config } from '../config';
import { PUBLIC_FOOTER_STYLES, renderPublicPageFooter } from './publicPageFooter';

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
.legal-header{background:#fff;border-bottom:1px solid #e2e8f0;padding:16px 24px}
.legal-header-inner{max-width:800px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
.legal-brand{font-size:18px;font-weight:600;color:#1e293b;text-decoration:none}
.legal-brand:hover{color:#0ea5e9}
.legal-back{font-size:14px;color:#64748b;text-decoration:none}
.legal-back:hover{color:#0ea5e9}
.legal-content{flex:1;max-width:800px;margin:0 auto;padding:32px 24px 64px;width:100%}
.legal-content h1{font-size:28px;font-weight:700;color:#1e293b;margin:0 0 24px}
.legal-content h2{font-size:20px;font-weight:600;color:#1e293b;margin:32px 0 16px}
.legal-content p{margin:0 0 16px;color:#475569}
.legal-content ul, .legal-content ol{margin:0 0 16px;padding-left:24px;color:#475569}
.legal-content li{margin-bottom:8px}
.legal-content a{color:#0ea5e9;text-decoration:none}
.legal-content a:hover{text-decoration:underline}
${PUBLIC_FOOTER_STYLES}
`;

export interface RenderLegalOptions {
  doc: 'terms' | 'privacy';
  locale: string;
}

function resolveLocale(locale: string): string {
  const normalized = locale?.slice(0, 2)?.toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

async function loadMarkdown(doc: 'terms' | 'privacy', locale: string): Promise<string> {
  const resolved = resolveLocale(locale);
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

export async function renderLegalHtml(options: RenderLegalOptions): Promise<string> {
  const { doc, locale } = options;
  const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '') || '';
  const safeAppUrl = escapeHtml(webAppUrl);

  const markdown = await loadMarkdown(doc, locale);
  const bodyHtml = (await marked.parse(markdown)) as string;

  const title = doc === 'terms' ? 'Terms of Service — WonderTales' : 'Privacy Policy — WonderTales';
  const description =
    doc === 'terms'
      ? 'Terms of use of the WonderTales service'
      : 'How WonderTales collects and uses personal data';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(resolveLocale(locale))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <style>${LEGAL_STYLES}</style>
</head>
<body>
  <div class="legal-wrapper">
    <header class="legal-header">
      <div class="legal-header-inner">
        <a href="${safeAppUrl}" class="legal-brand">WonderTales</a>
        <a href="${safeAppUrl}" class="legal-back">← Back to app</a>
      </div>
    </header>
    <main class="legal-content">
      ${bodyHtml}
    </main>
    ${renderPublicPageFooter(webAppUrl)}
  </div>
</body>
</html>`;
}
