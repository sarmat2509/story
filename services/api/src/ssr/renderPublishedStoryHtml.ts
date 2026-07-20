/**
 * Render published story as HTML for SSR
 * Uses shared buildStoryMeta, buildStoryJsonLd, renderHtmlDocument
 */

import { renderHtmlDocument, renderPublishedStoryLayout } from '@wondertales/shared';
import type { StoryPublicView } from '@wondertales/shared';
import { config } from '../config';
import { PUBLISHED_STORY_AUDIO_ENHANCEMENT_SCRIPT } from './publishedStoryAudioEnhancement';
import { getVersionedWebBundleUrl } from './webBundleUrl';

// SSR layout styles designed to match the React Native Web output as closely as possible,
// minimising layout shift (CLS) when the bundle hydrates.
// Key values mirror the app theme: drawer.widthCollapsed=73, header=56, spacing[6]=24, etc.
const LAYOUT_STYLES = `
*{box-sizing:border-box}
html,body{min-height:100%;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fff;color:#1e293b;margin:0;padding:0}
#root{min-height:100%;height:100%;display:flex;flex-direction:column}
#root>*{flex:1 1 auto;min-height:0}

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
.report-action{display:inline-flex;align-items:center;justify-content:center;width:100%;padding:8px 12px;border:1px solid #fecaca;border-radius:999px;background:#fff1f2;color:#be123c;font-size:13px;font-weight:700;text-decoration:none;transition:transform .18s ease,background .18s ease,border-color .18s ease}
.report-action:hover{background:#ffe4e6;transform:translateY(-1px)}
.report-action-mobile{display:none}

/* ── Scenes ── */
.scene{margin-bottom:24px}
/* Mirrors React Native Web <Image> output: outer wrapper + background-image div */
.scene-img-wrap{position:relative;overflow:hidden;border-radius:12px;aspect-ratio:16/9;width:100%;margin-bottom:12px}
.scene-img-bg{position:absolute;inset:0;background-size:cover;background-position:center;background-repeat:no-repeat}
/* Accessibility img (same as RNWeb's accessibilityImage — hidden visually) */
.scene-img-acc{position:absolute;opacity:0;width:1px;height:1px;overflow:hidden}
.scene-text{font-size:18px;line-height:31.5px;color:#1e293b;margin:0}

/* ── Comic and mixed-story pages ── */
.comic-page{width:100%;margin:0 auto 24px}
.comic-page-canvas{position:relative;width:100%;overflow:hidden;border-radius:12px;background:#e2e8f0;box-shadow:0 8px 24px rgba(15,23,42,.08);container-type:inline-size}
.comic-page-image{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.comic-bubble{position:absolute;z-index:2;display:flex;align-items:center;justify-content:center;padding:var(--comic-padding-y) var(--comic-padding-x);color:#111;font-size:var(--comic-font-size);font-weight:700;line-height:var(--comic-line-height);text-align:center;overflow-wrap:break-word;text-wrap:balance}
.comic-bubble span{display:block;width:100%;min-width:0;max-width:100%;flex-shrink:1}

/* ── Right sidebar ── */
.sidebar{width:360px;flex-shrink:0;align-self:flex-start;position:sticky;top:56px;max-height:calc(100vh - 56px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;border-left:1px solid #e2e8f0;padding:24px 24px 48px}
.sidebar-sticky{position:static}
.sidebar-widget{background:#f8fafc;padding:24px;border-radius:16px;margin-bottom:16px}

/* ── SSR audio player: mirrors the app AudioPlayer ── */
.story-audio-widget{background:#f4eefb;color:#1b1340}
.story-audio-widget-mobile{display:none}
.story-audio-title{margin:0 0 20px;font-size:18px;line-height:24px;font-weight:600;text-align:center;color:#1b1340}
.story-audio-native{width:100%;display:block}
.story-audio-custom{display:none}
.story-audio-widget[data-enhanced="true"] .story-audio-native{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.story-audio-widget[data-enhanced="true"] .story-audio-custom{display:block}
.story-audio-play{display:flex;width:64px;height:64px;margin:0 auto 16px;padding:0;align-items:center;justify-content:center;border:0;border-radius:999px;background:#7b66c7;color:#fff;cursor:pointer;box-shadow:0 5px 14px rgba(59,46,110,.2);transition:background .18s ease,transform .18s ease,box-shadow .18s ease}
.story-audio-play:hover{background:#5a45a3;transform:translateY(-1px);box-shadow:0 7px 18px rgba(59,46,110,.25)}
.story-audio-play:focus-visible,.story-audio-progress:focus-visible,.story-audio-speed:focus-visible,.story-audio-follow-input:focus-visible+.story-audio-switch{outline:3px solid rgba(123,102,199,.28);outline-offset:3px}
.story-audio-play-icon{display:block;width:0;height:0;margin-left:5px;border-top:15px solid transparent;border-bottom:15px solid transparent;border-left:23px solid #fff}
.story-audio-pause-icon{display:none;font-size:27px;font-weight:800;line-height:1;letter-spacing:-5px;margin-left:-4px}
.story-audio-widget[data-playing="true"] .story-audio-play-icon{display:none}
.story-audio-widget[data-playing="true"] .story-audio-pause-icon{display:block}
.story-audio-progress-row{display:flex;align-items:center;gap:8px}
.story-audio-time{min-width:40px;color:#574b7c;font-size:14px;font-variant-numeric:tabular-nums}
.story-audio-time:last-child{text-align:right}
.story-audio-progress,.story-audio-speed{min-width:0;flex:1;height:36px;margin:0;accent-color:#7b66c7;cursor:pointer}
.story-audio-speed-section,.story-audio-follow{margin-top:16px;padding-top:16px;border-top:1px solid #ece4f5}
.story-audio-speed-title{display:block;margin-bottom:12px;font-size:16px;font-weight:500;text-align:center;color:#1b1340}
.story-audio-speed-row{display:flex;align-items:center;gap:10px}
.story-audio-speed-icon{width:24px;font-size:19px;text-align:center;filter:saturate(.65)}
.story-audio-speed-value{min-width:34px;color:#574b7c;font-size:14px;font-variant-numeric:tabular-nums;text-align:right}
.story-audio-follow-row{display:flex;align-items:center;justify-content:center;gap:12px;cursor:pointer}
.story-audio-follow-input{position:absolute;opacity:0;pointer-events:none}
.story-audio-switch{position:relative;width:44px;height:26px;flex:0 0 auto;border-radius:999px;background:#cbd5e1;transition:background .18s ease}
.story-audio-switch:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.25);transition:transform .18s ease}
.story-audio-follow-input:checked+.story-audio-switch{background:#7b66c7}
.story-audio-follow-input:checked+.story-audio-switch:after{transform:translateX(18px)}
.story-audio-follow-input:disabled+.story-audio-switch{opacity:.55;cursor:wait}
.story-audio-follow-label{font-size:16px;font-weight:500;color:#1b1340}
.story-audio-follow-description{margin:8px 0 0;color:#574b7c;font-size:14px;line-height:20px;text-align:center}
.story-audio-status{min-height:0;margin:10px 0 0;color:#574b7c;font-size:13px;line-height:18px;text-align:center}
.story-audio-status:empty{display:none}
.story-audio-status-error{color:#b91c1c}
.story-audio-word{border-radius:4px;transition:background-color .12s ease,color .12s ease,box-shadow .12s ease}
.story-audio-word-active{background:#e9dffa;color:#3b2e6e;box-shadow:0 0 0 2px #e9dffa}

/* ── Mobile ── */
@media(max-width:1023px){
  .nav-rail{display:none}
  .nav-header{left:0}
  .page{margin-left:0}
  .layout{flex-direction:column}
  .sidebar{display:none}
  .main{padding:24px 24px 48px}
  .story-audio-widget-mobile{display:block;margin:0 0 24px}
  .report-action-mobile{display:inline-flex;width:auto;margin:-24px 0 24px}
}

/* Smooth handoff: brief fade-in when React replaces root content */
@keyframes ssr-in{from{opacity:.7}to{opacity:1}}
#root{animation:ssr-in .15s ease-out}
`;

export interface RenderParams {
  story: StoryPublicView;
  robots?: 'index,follow' | 'noindex,nofollow';
  authenticatedAppBundleUrl?: string;
  alignmentUrl?: string;
}

function resolveAlignmentUrl(story: StoryPublicView): string {
  try {
    const pathname = new URL(story.share.url).pathname;
    const publicStoryMatch = pathname.match(/^\/stories\/([^/]+)\/?$/);
    if (publicStoryMatch) {
      return `/api/v1/public/stories/${encodeURIComponent(decodeURIComponent(publicStoryMatch[1]))}/alignment`;
    }
    const unlistedMatch = pathname.match(/^\/u\/([^/]+)\/?$/);
    if (unlistedMatch) {
      return `/api/v1/public/u/${encodeURIComponent(decodeURIComponent(unlistedMatch[1]))}/alignment`;
    }
  } catch {
    return '';
  }
  return '';
}

export function renderPublishedStoryHtml(params: RenderParams): string {
  const { story, robots = 'index,follow' } = params;
  const apiBase = config.web?.apiPublicUrl?.replace(/\/$/, '') || '';
  const webAppUrl = config.web?.webAppUrl?.replace(/\/$/, '') || '';
  const webBundleUrl = params.authenticatedAppBundleUrl ?? getVersionedWebBundleUrl();

  // Resolve relative audio URL to absolute
  const storyWithAbsoluteAudio = { ...story };
  if (story.audio?.url && !story.audio.url.startsWith('http')) {
    storyWithAbsoluteAudio.audio = {
      ...story.audio,
      url: `${apiBase}${story.audio.url.startsWith('/') ? '' : '/'}${story.audio.url}`,
    };
  }

  const alignmentUrl = params.alignmentUrl ?? resolveAlignmentUrl(storyWithAbsoluteAudio);

  const bodyHtml = `<div id="root">${renderPublishedStoryLayout({
    story: storyWithAbsoluteAudio,
    apiBase,
    webAppUrl,
    alignmentUrl,
  })}</div>${storyWithAbsoluteAudio.audio?.url
    ? `<script data-published-story-audio>${PUBLISHED_STORY_AUDIO_ENHANCEMENT_SCRIPT}</script>`
    : ''}`;
  const fullWebBundleUrl = webBundleUrl.startsWith('http')
    ? webBundleUrl
    : `${webAppUrl}${webBundleUrl.startsWith('/') ? '' : '/'}${webBundleUrl}`;

  return renderHtmlDocument({
    story: storyWithAbsoluteAudio,
    baseUrl: apiBase,
    bodyHtml,
    robots,
    headStyles: LAYOUT_STYLES,
    authenticatedAppBundleUrl: fullWebBundleUrl,
  });
}
