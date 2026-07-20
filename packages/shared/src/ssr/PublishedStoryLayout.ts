/**
 * PublishedStoryLayout - HTML shell for SSR story content
 * Structure mirrors the React Native Web output to minimise layout shift (CLS):
 *   - .nav-rail   → permanent icon-only drawer (73 px)
 *   - .nav-header → top app bar (56 px)
 *   - .page > .layout > .main + .sidebar
 */
import type {
  PublicGraphicNovelPage,
  PublicGraphicNovelTextOverlayItem,
  PublicStoryScene,
  StoryPublicView,
} from './types';
import { escapeHtml } from './escapeHtml';
import { getReadingTimeMinutes } from '../utils/readingTime';
import { emojiForAvg } from '../utils/ratingEmojis';
import {
  graphicNovelTextStyleContainerUnit,
  resolveGraphicNovelTextStyle,
} from '../utils/graphicNovelTextStyle';

export interface PublishedStoryLayoutParams {
  story: StoryPublicView;
  apiBase: string;
  webAppUrl: string;
}

function assetUrl(value: string | null | undefined, apiBase: string): string {
  if (!value) return '';
  if (value.startsWith('http') || value.startsWith('/')) return value;
  return `${apiBase.replace(/\/$/, '')}/${value}`;
}

function percent(value: number): string {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return `${Number((normalized * 100).toFixed(3))}%`;
}

function renderComicBubble(item: PublicGraphicNovelTextOverlayItem): string {
  const rect = item.rect;
  const style = [
    `left:${percent(rect.x)}`,
    `top:${percent(rect.y)}`,
    `width:${percent(rect.width)}`,
    `height:${percent(rect.height)}`,
  ].join(';');
  return `<div class="comic-bubble comic-bubble-${escapeHtml(item.kind)}" style="${style}"` +
    `${item.ariaLabel ? ` aria-label="${escapeHtml(item.ariaLabel)}"` : ''}>` +
    `<span>${escapeHtml(item.text)}</span></div>`;
}

function renderComicPage(page: PublicGraphicNovelPage, apiBase: string): string {
  const imageUrl = assetUrl(page.imageUrl, apiBase);
  if (!imageUrl) return '';
  const width = page.textOverlay?.pageSize.width || 1024;
  const height = page.textOverlay?.pageSize.height || 1536;
  const textStyle = resolveGraphicNovelTextStyle(page.textOverlay?.textStyle, { width, height });
  const canvasStyle = [
    `aspect-ratio:${width}/${height}`,
    `--comic-font-size:${graphicNovelTextStyleContainerUnit(textStyle.fontSizePx, textStyle.targetPageWidthPx)}`,
    `--comic-line-height:${graphicNovelTextStyleContainerUnit(textStyle.lineHeightPx, textStyle.targetPageWidthPx)}`,
    `--comic-padding-x:${graphicNovelTextStyleContainerUnit(textStyle.paddingXPx, textStyle.targetPageWidthPx)}`,
    `--comic-padding-y:${graphicNovelTextStyleContainerUnit(textStyle.paddingYPx, textStyle.targetPageWidthPx)}`,
  ].join(';');
  const bubbles = (page.textOverlay?.items || [])
    .slice()
    .sort((a, b) => a.readingOrder - b.readingOrder)
    .map(renderComicBubble)
    .join('');
  return `<figure class="comic-page" data-page-number="${page.pageNumber}">` +
    `<div class="comic-page-canvas" style="${canvasStyle}">` +
    `<img class="comic-page-image" src="${escapeHtml(imageUrl)}" alt="" loading="lazy">` +
    `${bubbles}</div></figure>`;
}

function renderProseScene(scene: PublicStoryScene, apiBase: string): string {
  const imgSrc = assetUrl(scene.imageUrl, apiBase);
  const imgHtml = imgSrc
    ? `<div class="scene-img-wrap">` +
        `<div class="scene-img-bg" style="background-image:url('${escapeHtml(imgSrc)}')"></div>` +
        `<img class="scene-img-acc" src="${escapeHtml(imgSrc)}" alt="" loading="lazy">` +
      `</div>`
    : '';
  return `<div class="scene">${imgHtml}<p class="scene-text">${escapeHtml(scene.text || '')}</p></div>`;
}

function renderStoryContent(story: StoryPublicView, apiBase: string): string {
  const scenes = story.scenes || [];
  const pages = story.comicPages || [];
  if (story.storyFormat === 'graphic_novel') {
    return pages.map((page) => renderComicPage(page, apiBase)).filter(Boolean).join('\n');
  }
  if (story.storyFormat !== 'mixed_story') {
    return scenes.map((scene) => renderProseScene(scene, apiBase)).join('\n');
  }

  const order = story.mixedStoryReadingOrder || [];
  if (order.length === 0) {
    return scenes
      .slice()
      .sort((a, b) => (a.mixedStoryScreenOrder || 0) - (b.mixedStoryScreenOrder || 0))
      .map((scene) => {
        if (scene.mixedStoryBlockKind === 'comic' && scene.graphicNovelPageNumber) {
          const page = pages.find((candidate) => candidate.pageNumber === scene.graphicNovelPageNumber);
          return page ? renderComicPage(page, apiBase) : '';
        }
        return renderProseScene(scene, apiBase);
      })
      .filter(Boolean)
      .join('\n');
  }

  return order
    .slice()
    .sort((a, b) => a.screenOrder - b.screenOrder)
    .map((entry) => {
      if (entry.kind === 'comic') {
        const page = pages.find((candidate) => candidate.pageNumber === entry.pageNumber);
        return page ? renderComicPage(page, apiBase) : '';
      }
      const sourceSceneId = entry.sceneId ?? entry.sourceSceneIds[0];
      const scene = scenes.find((candidate) => candidate.sceneId === sourceSceneId)
        ?? scenes.find((candidate) => candidate.mixedStoryScreenOrder === entry.screenOrder);
      return scene ? renderProseScene(scene, apiBase) : '';
    })
    .filter(Boolean)
    .join('\n');
}

export function renderPublishedStoryLayout(params: PublishedStoryLayoutParams): string {
  const { story, apiBase, webAppUrl } = params;

  const publishedAt = story.publishedAt
    ? new Date(story.publishedAt).toLocaleDateString('uk-UA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const scenes = story.scenes || [];
  const scenesHtml = renderStoryContent(story, apiBase);

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
  const authorName = escapeHtml(story.authorDisplayName || 'Anonymous');
  const authorHref = story.author?.id
    ? `${webAppUrl.replace(/\/$/, '')}/authors/${encodeURIComponent(story.author.id)}`
    : null;
  const authorHtml = authorHref
    ? `<a class="author-link" href="${escapeHtml(authorHref)}">${authorName}</a>`
    : authorName;
  const reportHref = `${webAppUrl.replace(/\/$/, '')}/support?topic=unsafe_content&url=${encodeURIComponent(story.share.url)}`;

  return `
  <div class="nav-rail"></div>
  <div class="nav-header">
    <span class="nav-burger">&#9776;</span>
    <span class="nav-title">${escapeHtml(story.title)}</span>
  </div>
  <div class="page">
    <div class="layout">
      <div class="main">
        <p class="meta">${authorHtml} · ${escapeHtml(publishedAt)}</p>
        <a class="report-action" href="${escapeHtml(reportHref)}" data-report-story-id="${escapeHtml(story.id)}">Report generated content</a>
        ${scenesHtml}
      </div>
      ${sidebar}
    </div>
  </div>`;
}
