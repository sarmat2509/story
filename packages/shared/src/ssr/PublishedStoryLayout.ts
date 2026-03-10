/**
 * PublishedStoryLayout - HTML shell for SSR story content
 * Structure mirrors the React Native Web output to minimise layout shift (CLS):
 *   - .nav-rail   → permanent icon-only drawer (73 px)
 *   - .nav-header → top app bar (56 px)
 *   - .page > .layout > .main + .sidebar
 */
import type { StoryPublicView } from './types';
import { escapeHtml } from './escapeHtml';
import { getReadingTimeMinutes } from '../utils/readingTime';
import { emojiForAvg } from '../utils/ratingEmojis';

export interface PublishedStoryLayoutParams {
  story: StoryPublicView;
  apiBase: string;
  webAppUrl: string;
}

export function renderPublishedStoryLayout(params: PublishedStoryLayoutParams): string {
  const { story, apiBase } = params;

  const publishedAt = story.publishedAt
    ? new Date(story.publishedAt).toLocaleDateString('uk-UA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const scenes = story.scenes || [];
  const scenesHtml = scenes
    .map((s: { sceneId: number; text: string; imageUrl?: string | null }) => {
      const imgSrc = s.imageUrl
        ? String(s.imageUrl).startsWith('http') || String(s.imageUrl).startsWith('/')
          ? s.imageUrl  // absolute URL or root-relative — use as-is
          : `${apiBase.replace(/\/$/, '')}/${s.imageUrl}`  // bare relative path — prepend apiBase
        : '';
      // Mirrors React Native Web <Image> output: wrapper div + background-image div + hidden img
      const imgHtml = imgSrc
        ? `<div class="scene-img-wrap">` +
            `<div class="scene-img-bg" style="background-image:url('${escapeHtml(imgSrc)}')"></div>` +
            `<img class="scene-img-acc" src="${escapeHtml(imgSrc)}" alt="" loading="lazy">` +
          `</div>`
        : '';
      return `<div class="scene">${imgHtml}<p class="scene-text">${escapeHtml(s.text || '')}</p></div>`;
    })
    .join('\n');

  const audioUrl = story.audio?.url || '';

  const readingTimeMinutes = getReadingTimeMinutes(scenes);
  const readingTimeHtml = readingTimeMinutes > 0
    ? `<div class="sidebar-widget reading-time"><span class="reading-time-text">~${readingTimeMinutes} хв читання</span></div>`
    : '';

  const audioWidget = audioUrl
    ? `<div class="sidebar-widget"><audio controls src="${escapeHtml(audioUrl)}"></audio></div>`
    : '';

  const ratingHtml =
    story.rating && story.rating.count > 0
      ? `<div class="sidebar-widget rating-display"><span class="rating-text">${emojiForAvg(story.rating.avg)} ${story.rating.avg.toFixed(1)} (${story.rating.count})</span></div>`
      : '';

  const sidebarContent = [readingTimeHtml, audioWidget, ratingHtml].filter(Boolean).join('');
  const sidebar = sidebarContent
    ? `<aside class="sidebar"><div class="sidebar-sticky">${sidebarContent}</div></aside>`
    : '';

  return `
  <div class="nav-rail"></div>
  <div class="nav-header">
    <span class="nav-burger">&#9776;</span>
    <span class="nav-title">${escapeHtml(story.title)}</span>
  </div>
  <div class="page">
    <div class="layout">
      <div class="main">
        <p class="meta">${escapeHtml(story.authorDisplayName || 'Anonymous')} · ${escapeHtml(publishedAt)}</p>
        ${scenesHtml}
      </div>
      ${sidebar}
    </div>
  </div>`;
}
