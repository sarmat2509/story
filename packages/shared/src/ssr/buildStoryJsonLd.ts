/**
 * Build JSON-LD Article schema with optional AudioObject for published story
 */
import type { StoryPublicView } from './types';

export function buildStoryJsonLd(story: StoryPublicView, baseUrl: string): string {
  const article: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: story.title,
    author: {
      '@type': 'Person',
      name: story.authorDisplayName || 'Anonymous',
    },
    datePublished: story.publishedAt || undefined,
    image: story.share.ogImageUrl,
    url: story.share.url,
  };

  if (story.audio?.url) {
    const audioUrl = story.audio.url.startsWith('http')
      ? story.audio.url
      : `${baseUrl.replace(/\/$/, '')}${story.audio.url}`;
    article.associatedMedia = {
      '@type': 'AudioObject',
      contentUrl: audioUrl,
    };
  }

  return JSON.stringify(article);
}
