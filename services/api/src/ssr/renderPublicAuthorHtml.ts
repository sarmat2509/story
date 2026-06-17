import { escapeHtml, getReadingTimeMinutes } from '@wondertales/shared';
import type { PublicAuthorView } from '@wondertales/shared';
import type { PublicStoryListItem } from '../services/publicStoryService';
import { config } from '../config';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import { getVersionedWebBundleUrl } from './webBundleUrl';

const AUTHOR_STYLES = `
*{box-sizing:border-box}
html,body{min-height:100%;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f8fafc;color:#1e293b;margin:0}
#root{min-height:100%;height:100%;display:flex;flex-direction:column}
#root>*{flex:1 1 auto;min-height:0}
a{color:inherit;text-decoration:none}
.page{max-width:1120px;margin:0 auto;padding:32px 20px 56px}
.topnav{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;color:#475569}
.brand{font-weight:800;color:#7c3aed}
.hero{display:flex;gap:24px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;margin-bottom:28px}
.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;background:#ede9fe;display:flex;align-items:center;justify-content:center;color:#7c3aed;font-size:40px;font-weight:800;flex-shrink:0}
h1{font-size:36px;line-height:1.1;margin:0 0 8px}
.count{color:#64748b;margin:0 0 12px}
.about{font-size:16px;line-height:1.6;margin:0;color:#334155}
.section-title{font-size:24px;margin:0 0 16px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;min-height:100%}
.thumb{aspect-ratio:16/9;background:#e2e8f0;object-fit:cover;width:100%}
.thumb-placeholder{aspect-ratio:16/9;background:linear-gradient(135deg,#fef3c7,#ddd6fe);display:flex;align-items:center;justify-content:center;color:#7c3aed;font-weight:700}
.card-body{padding:16px}
.card h2{font-size:18px;line-height:1.25;margin:0 0 10px}
.meta{font-size:14px;color:#64748b;margin:0}
@media(max-width:800px){.hero{align-items:flex-start}.grid{grid-template-columns:1fr 1fr}h1{font-size:30px}}
@media(max-width:560px){.page{padding:24px 16px 44px}.hero{flex-direction:column}.grid{grid-template-columns:1fr}}
`;

function trimDescription(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function absoluteUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = baseUrl.replace(/\/$/, '');
  return `${base}${value.startsWith('/') ? '' : '/'}${value}`;
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function renderStoryCard(story: PublicStoryListItem, webAppUrl: string, apiBase: string): string {
  const storyUrl = `${webAppUrl.replace(/\/$/, '')}/stories/${encodeURIComponent(story.publishedSlug)}`;
  const imageUrl = absoluteUrl(story.scenes.find((scene) => scene.imageUrl)?.imageUrl, apiBase);
  const readingTime = getReadingTimeMinutes(story.scenes);
  const metaParts = [formatDate(story.publishedAt)];
  if (readingTime > 0) metaParts.push(`~${readingTime} хв`);

  return `<a class="card" href="${escapeHtml(storyUrl)}">
    ${
      imageUrl
        ? `<img class="thumb" src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`
        : '<div class="thumb-placeholder">WonderTales</div>'
    }
    <div class="card-body">
      <h2>${escapeHtml(story.title)}</h2>
      <p class="meta">${escapeHtml(metaParts.filter(Boolean).join(' · '))}</p>
    </div>
  </a>`;
}

export function renderPublicAuthorHtml(params: {
  author: PublicAuthorView;
  stories: PublicStoryListItem[];
  total: number;
}): string {
  const { author, stories, total } = params;
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || 'https://wondertales.art';
  const apiBase = config.web?.apiPublicUrl?.replace(/\/$/, '') || webAppUrl;
  const webBundleUrl = getVersionedWebBundleUrl();
  const fullWebBundleUrl = webBundleUrl.startsWith('http')
    ? webBundleUrl
    : `${webAppUrl}${webBundleUrl.startsWith('/') ? '' : '/'}${webBundleUrl}`;
  const authorUrl = `${webAppUrl}/authors/${encodeURIComponent(author.id)}`;
  const avatarUrl = absoluteUrl(author.avatarUrl, apiBase);
  const description = trimDescription(
    author.aboutMe || `${author.displayName} has ${total} published stories on WonderTales.`
  );
  const initial = author.displayName.trim().charAt(0).toUpperCase() || 'A';
  const initialAuthorJson = JSON.stringify({ author, stories, pagination: { total } }).replace(
    /</g,
    '\\u003c'
  );

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(author.displayName)} — WonderTales</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(authorUrl)}">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${escapeHtml(author.displayName)} — WonderTales">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(authorUrl)}">
  ${avatarUrl ? `<meta property="og:image" content="${escapeHtml(avatarUrl)}">` : ''}
  ${PUBLIC_HEAD_ASSET_LINKS}
  <style>${AUTHOR_STYLES}</style>
</head>
<body>
  <div id="root">
    <main class="page">
      <nav class="topnav" aria-label="WonderTales">
        <a class="brand" href="${escapeHtml(webAppUrl)}/">WonderTales</a>
        <a href="${escapeHtml(webAppUrl)}/pricing">Pricing</a>
      </nav>
      <section class="hero">
        ${
          avatarUrl
            ? `<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="">`
            : `<div class="avatar" aria-hidden="true">${escapeHtml(initial)}</div>`
        }
        <div>
          <h1>${escapeHtml(author.displayName)}</h1>
          <p class="count">${escapeHtml(String(total))} published stories</p>
          ${author.aboutMe ? `<p class="about">${escapeHtml(author.aboutMe)}</p>` : ''}
        </div>
      </section>
      <h2 class="section-title">Stories by this author</h2>
      <section class="grid">
        ${stories.map((story) => renderStoryCard(story, webAppUrl, apiBase)).join('\n')}
      </section>
    </main>
  </div>
  <script>window.__INITIAL_AUTHOR__ = ${initialAuthorJson};</script>
  <script src="${escapeHtml(fullWebBundleUrl)}" defer></script>
</body>
</html>`;
}
