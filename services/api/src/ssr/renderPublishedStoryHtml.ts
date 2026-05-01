/**
 * Render published story as HTML for SSR
 * Uses shared buildStoryMeta, buildStoryJsonLd, renderHtmlDocument
 */

import { renderHtmlDocument, renderPublishedStoryLayout } from '@wondertales/shared';
import type { StoryPublicView } from '@wondertales/shared';
import { config } from '../config';

// SSR layout styles designed to match the React Native Web output as closely as possible,
// minimising layout shift (CLS) when the bundle hydrates.
// Key values mirror the app theme: drawer.widthCollapsed=73, header=56, spacing[6]=24, etc.
const LAYOUT_STYLES = `
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fff;color:#1e293b;margin:0;padding:0}

/* ── Nav rail (permanent icon-only drawer on desktop) ── */
.nav-rail{position:fixed;top:0;left:0;bottom:0;width:73px;background:#fff;border-right:1px solid #e2e8f0;z-index:100}

/* ── Nav header ── */
.nav-header{position:fixed;top:0;left:73px;right:0;height:56px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;padding:0 16px;gap:8px;z-index:100}
/* Placeholder for DrawerBurgerButton (headerLeft in React Navigation, ~44px) */
.nav-burger{width:44px;height:44px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:20px}
.nav-title{font-size:18px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}

/* ── Page wrapper ── */
.page{margin-left:73px;padding-top:56px;min-height:100vh}

/* ── Two-column layout ── */
.layout{display:flex;flex-direction:row;max-width:1400px;margin:0 auto}
.main{flex:1;padding:24px 24px 48px;min-width:0}
/* meta.marginBottom(16) + header.marginBottom(24) from React = 40px total */
.meta{font-size:14px;color:#64748b;margin-bottom:40px}
.author-link{color:#475569;text-decoration:underline;text-underline-offset:3px}

/* ── Scenes ── */
.scene{margin-bottom:24px}
/* Mirrors React Native Web <Image> output: outer wrapper + background-image div */
.scene-img-wrap{position:relative;overflow:hidden;border-radius:12px;aspect-ratio:16/9;width:100%;margin-bottom:12px}
.scene-img-bg{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat}
/* Accessibility img (same as RNWeb's accessibilityImage — hidden visually) */
.scene-img-acc{position:absolute;opacity:0;width:1px;height:1px;overflow:hidden}
.scene-text{font-size:18px;line-height:31.5px;color:#1e293b;margin:0}

/* ── Right sidebar ── */
.sidebar{width:360px;flex-shrink:0;border-left:1px solid #e2e8f0;padding:24px}
.sidebar-sticky{position:sticky;top:80px}
.sidebar-widget{background:#f8fafc;padding:24px;border-radius:16px;margin-bottom:16px}
audio{width:100%;display:block}

/* ── Mobile ── */
@media(max-width:1023px){
  .nav-rail{display:none}
  .nav-header{left:0}
  .page{margin-left:0}
  .layout{flex-direction:column}
  .sidebar{display:none}
  .main{padding:16px 16px 48px}
}

/* Smooth handoff: brief fade-in when React replaces root content */
@keyframes ssr-in{from{opacity:.7}to{opacity:1}}
#root{animation:ssr-in .15s ease-out}
`;

export interface RenderParams {
  story: StoryPublicView;
  useStaticBody?: boolean; // If true, render full story content for crawlers; else minimal div for SPA
  robots?: 'index,follow' | 'noindex,nofollow';
}

export function renderPublishedStoryHtml(params: RenderParams): string {
  const { story, useStaticBody = true, robots = 'index,follow' } = params;
  const apiBase = config.web?.apiPublicUrl?.replace(/\/$/, '') || '';
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || '';
  const webBundleUrl = config.web?.webBundleUrl || '/static/js/bundle.js';

  // Resolve relative audio URL to absolute
  const storyWithAbsoluteAudio = { ...story };
  if (story.audio?.url && !story.audio.url.startsWith('http')) {
    storyWithAbsoluteAudio.audio = {
      ...story.audio,
      url: `${apiBase}${story.audio.url.startsWith('/') ? '' : '/'}${story.audio.url}`,
    };
  }

  const bodyHtml = useStaticBody
    ? `<div id="root">${renderPublishedStoryLayout({
        story: storyWithAbsoluteAudio,
        apiBase,
        webAppUrl,
      })}</div>`
    : '<div id="root"></div>';

  const fullWebBundleUrl = webBundleUrl.startsWith('http')
    ? webBundleUrl
    : `${webAppUrl}${webBundleUrl.startsWith('/') ? '' : '/'}${webBundleUrl}`;

  return renderHtmlDocument({
    story: storyWithAbsoluteAudio,
    baseUrl: apiBase,
    webBundleUrl: fullWebBundleUrl,
    bodyHtml,
    robots,
    headStyles: useStaticBody ? LAYOUT_STYLES : undefined,
  });
}
