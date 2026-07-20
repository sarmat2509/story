/**
 * Render full HTML document for SSR published story
 */
import type {
  PublicGraphicNovelPage,
  PublicGraphicNovelTextOverlay,
  PublicStoryFormat,
  StoryPublicView,
} from './types';
import { buildStoryMeta } from './buildStoryMeta';
import { buildStoryJsonLd } from './buildStoryJsonLd';

export interface RenderHtmlDocumentParams {
  story: StoryPublicView;
  baseUrl: string;
  bodyHtml?: string;
  robots?: 'index,follow' | 'noindex,nofollow';
  headStyles?: string;
  authenticatedAppBundleUrl?: string;
}

const BASE_DOCUMENT_STYLES = `
html,body{height:100%;margin:0;padding:0}
body{min-height:100vh}
#root{min-height:100%;height:100%;display:flex;flex-direction:column}
#root>*{flex:1;min-height:100%}
`;

function publicStoryFormat(value: unknown): PublicStoryFormat {
  return value === 'graphic_novel' || value === 'mixed_story' ? value : 'story';
}

function sanitizeComicTextOverlay(value: any): PublicGraphicNovelTextOverlay | null {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) return null;
  const pageWidth = Number(value.pageSize?.width);
  const pageHeight = Number(value.pageSize?.height);
  if (!Number.isFinite(pageWidth) || pageWidth <= 0 || !Number.isFinite(pageHeight) || pageHeight <= 0) {
    return null;
  }
  const numberOr = (candidate: unknown, fallback: number) => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const items = value.items.flatMap((item: any, index: number) => {
    const kind = item?.kind;
    if (kind !== 'speech' && kind !== 'thought' && kind !== 'caption') return [];
    const text = String(item?.text ?? '').trim();
    if (!text) return [];
    return [{
      id: String(item?.id ?? `bubble-${index + 1}`),
      segmentId: String(item?.segmentId ?? `segment-${index + 1}`),
      pageNumber: numberOr(item?.pageNumber, numberOr(value.pageNumber, 1)),
      panelIndex: numberOr(item?.panelIndex, 1),
      bubbleIndex: numberOr(item?.bubbleIndex, index + 1),
      readingOrder: numberOr(item?.readingOrder, index + 1),
      kind,
      ...(item?.speaker != null ? { speaker: String(item.speaker) } : {}),
      text,
      rect: {
        x: numberOr(item?.rect?.x, 0),
        y: numberOr(item?.rect?.y, 0),
        width: numberOr(item?.rect?.width, 0),
        height: numberOr(item?.rect?.height, 0),
      },
      ...(item?.cssPercent
        ? {
            cssPercent: {
              left: String(item.cssPercent.left ?? ''),
              top: String(item.cssPercent.top ?? ''),
              width: String(item.cssPercent.width ?? ''),
              height: String(item.cssPercent.height ?? ''),
            },
          }
        : {}),
      ...(item?.tailTo
        ? { tailTo: { x: numberOr(item.tailTo.x, 0), y: numberOr(item.tailTo.y, 0) } }
        : {}),
      ...(item?.ariaLabel != null ? { ariaLabel: String(item.ariaLabel) } : {}),
    }];
  });
  const textStyle = value.textStyle;
  const sanitizedTextStyle = textStyle
    ? {
        fontSizePx: numberOr(textStyle.fontSizePx, 20),
        lineHeightPx: numberOr(textStyle.lineHeightPx, 23),
        paddingXPx: numberOr(textStyle.paddingXPx, 14),
        paddingYPx: numberOr(textStyle.paddingYPx, 6),
        targetPageWidthPx: numberOr(textStyle.targetPageWidthPx, pageWidth),
        targetPageHeightPx: numberOr(textStyle.targetPageHeightPx, pageHeight),
      }
    : undefined;
  return {
    mode: 'html_overlay',
    coordinateSpace: 'normalized_0_1',
    pageNumber: numberOr(value.pageNumber, 1),
    pageSize: { width: pageWidth, height: pageHeight },
    ...(sanitizedTextStyle ? { textStyle: sanitizedTextStyle } : {}),
    items,
  };
}

function sanitizeComicPage(page: any): PublicGraphicNovelPage {
  return {
    pageNumber: Number(page?.pageNumber ?? 0),
    pageRole: String(page?.pageRole ?? ''),
    status: String(page?.status ?? ''),
    imageUrl: page?.imageUrl == null ? null : String(page.imageUrl),
    textOverlay: sanitizeComicTextOverlay(page?.textOverlay),
  };
}

function sanitizeStoryPublicView(story: StoryPublicView): StoryPublicView {
  const source = story as StoryPublicView & Record<string, any>;
  const storyFormat = publicStoryFormat(source.storyFormat);
  const publicStory: StoryPublicView = {
    id: String(source.id),
    title: String(source.title ?? ''),
    fullText: String(source.fullText ?? ''),
    storyFormat,
    ...(typeof source.seoDescription === 'string' ? { seoDescription: source.seoDescription } : {}),
    scenes: Array.isArray(source.scenes)
      ? source.scenes.map((scene: any) => ({
          sceneId: Number(scene?.sceneId ?? 0),
          text: String(scene?.text ?? ''),
          ...(scene?.imageUrl != null ? { imageUrl: String(scene.imageUrl) } : {}),
          ...(scene?.mixedStoryBlockKind === 'prose' || scene?.mixedStoryBlockKind === 'comic'
            ? { mixedStoryBlockKind: scene.mixedStoryBlockKind }
            : {}),
          ...(Number.isFinite(Number(scene?.mixedStoryScreenOrder))
            ? { mixedStoryScreenOrder: Number(scene.mixedStoryScreenOrder) }
            : {}),
          ...(Number.isFinite(Number(scene?.graphicNovelPageNumber))
            ? { graphicNovelPageNumber: Number(scene.graphicNovelPageNumber) }
            : {}),
        }))
      : [],
    ...(storyFormat !== 'story' && Array.isArray(source.comicPages)
      ? { comicPages: source.comicPages.map(sanitizeComicPage) }
      : {}),
    ...(storyFormat === 'mixed_story' && Array.isArray(source.mixedStoryReadingOrder)
      ? {
          mixedStoryReadingOrder: source.mixedStoryReadingOrder.map((entry: any, index: number) => ({
            screenOrder: Number(entry?.screenOrder ?? index + 1),
            kind: entry?.kind === 'comic' ? 'comic' : 'prose',
            ...(Number.isFinite(Number(entry?.sceneId)) ? { sceneId: Number(entry.sceneId) } : {}),
            ...(Number.isFinite(Number(entry?.pageNumber)) ? { pageNumber: Number(entry.pageNumber) } : {}),
            sourceSceneIds: Array.isArray(entry?.sourceSceneIds)
              ? entry.sourceSceneIds.map(Number).filter(Number.isFinite)
              : [],
            textSegmentIds: Array.isArray(entry?.textSegmentIds)
              ? entry.textSegmentIds.map(String)
              : [],
          })),
        }
      : {}),
    ...(source.author
      ? {
          author: {
            id: String(source.author.id),
            displayName: String(source.author.displayName ?? ''),
            ...(source.author.avatarUrl != null ? { avatarUrl: String(source.author.avatarUrl) } : {}),
            ...(source.author.aboutMe != null ? { aboutMe: String(source.author.aboutMe) } : {}),
          },
        }
      : {}),
    authorDisplayName: String(source.authorDisplayName ?? 'Anonymous'),
    publishedAt: source.publishedAt == null ? null : String(source.publishedAt),
    ...(source.audio
      ? {
          audio: {
            ...(source.audio.url != null ? { url: String(source.audio.url) } : {}),
            ...(source.audio.alignment != null ? { alignment: source.audio.alignment } : {}),
            ...(source.audio.duration != null ? { duration: Number(source.audio.duration) } : {}),
          },
        }
      : {}),
    share: {
      url: String(source.share?.url ?? ''),
      ogImageUrl: String(source.share?.ogImageUrl ?? ''),
    },
    publicRenderVersion: Number(source.publicRenderVersion ?? 1),
    ...(source.rating
      ? {
          rating: {
            avg: Number(source.rating.avg ?? 0),
            count: Number(source.rating.count ?? 0),
          },
        }
      : {}),
  };

  return publicStory;
}

/**
 * Renders a complete public story document. Public SSR must not mount the SPA bundle:
 * guests keep normal document navigation, while signed-in web users can mount the app
 * on the same canonical URL via a tiny auth-state bootstrap.
 */
export function renderHtmlDocument(params: RenderHtmlDocumentParams): string {
  const {
    story,
    baseUrl,
    bodyHtml = '<div id="root"></div>',
    robots = 'index,follow',
    headStyles = '',
    authenticatedAppBundleUrl,
  } = params;
  const publicStory = sanitizeStoryPublicView(story);

  const meta = buildStoryMeta({
    title: publicStory.title,
    description: publicStory.seoDescription ?? (publicStory.fullText || '').slice(0, 200) + (publicStory.fullText?.length > 200 ? '...' : ''),
    ogImageUrl: publicStory.share.ogImageUrl,
    url: publicStory.share.url,
    robots,
  });

  const jsonLd = buildStoryJsonLd(publicStory, baseUrl);
  const authenticatedAppBootstrap = authenticatedAppBundleUrl
    ? `<script data-authenticated-app-bootstrap>(function(){try{var persisted=window.localStorage.getItem('auth-storage');if(!persisted)return;var auth=JSON.parse(persisted);var state=auth&&auth.state;if(state&&state.isAuthenticated===true&&typeof state.token==='string'&&state.token){var script=document.createElement('script');script.src=${JSON.stringify(authenticatedAppBundleUrl).replace(/</g, '\\u003c')};script.defer=true;document.body.appendChild(script);}}catch(_error){}})();</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  ${meta}
  <style>${BASE_DOCUMENT_STYLES}${headStyles || ''}</style>
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  ${bodyHtml}
  ${authenticatedAppBootstrap}
</body>
</html>`;
}
