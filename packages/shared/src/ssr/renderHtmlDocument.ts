/**
 * Render full HTML document for SSR published story
 */
import type { StoryPublicView } from './types';
import { buildStoryMeta } from './buildStoryMeta';
import { buildStoryJsonLd } from './buildStoryJsonLd';

export interface RenderHtmlDocumentParams {
  story: StoryPublicView;
  baseUrl: string;
  webBundleUrl: string;
  bodyHtml?: string;
  robots?: 'index,follow' | 'noindex,nofollow';
  headStyles?: string;
}

const BASE_DOCUMENT_STYLES = `
html,body{height:100%;margin:0;padding:0}
body{min-height:100vh}
#root{min-height:100%;height:100%;display:flex;flex-direction:column}
#root>*{flex:1;min-height:100%}
`;

function sanitizeStoryPublicView(story: StoryPublicView): StoryPublicView {
  const source = story as StoryPublicView & Record<string, any>;
  const publicStory: StoryPublicView = {
    id: String(source.id),
    title: String(source.title ?? ''),
    fullText: String(source.fullText ?? ''),
    ...(typeof source.seoDescription === 'string' ? { seoDescription: source.seoDescription } : {}),
    scenes: Array.isArray(source.scenes)
      ? source.scenes.map((scene: any) => ({
          sceneId: Number(scene?.sceneId ?? 0),
          text: String(scene?.text ?? ''),
          ...(scene?.imageUrl != null ? { imageUrl: String(scene.imageUrl) } : {}),
        }))
      : [],
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
 * Renders HTML shell with meta, JSON-LD, body placeholder, and __INITIAL_STORY__ script.
 * Body is typically empty or minimal for SPA hydration.
 */
export function renderHtmlDocument(params: RenderHtmlDocumentParams): string {
  const {
    story,
    baseUrl,
    webBundleUrl,
    bodyHtml = '<div id="root"></div>',
    robots = 'index,follow',
    headStyles = '',
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
  const initialStoryJson = JSON.stringify(publicStory).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  ${meta}
  <style>${BASE_DOCUMENT_STYLES}${headStyles || ''}</style>
  <script type="application/ld+json">${jsonLd}</script>
</head>
<body>
  ${bodyHtml}
  <script>window.__INITIAL_STORY__ = ${initialStoryJson};</script>
  <script src="${webBundleUrl}" defer></script>
</body>
</html>`;
}
