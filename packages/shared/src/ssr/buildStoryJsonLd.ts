/** Build a connected Schema.org graph for a published WonderTales story. */
import type { StoryPublicView } from './types';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function durationIso8601(seconds: number | undefined): string | undefined {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return undefined;
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${remainingSeconds || (!hours && !minutes) ? `${remainingSeconds}S` : ''}`;
}

function storyType(story: StoryPublicView): string {
  return story.storyFormat === 'graphic_novel' ? 'ComicStory' : 'CreativeWork';
}

export function buildStoryJsonLd(
  story: StoryPublicView,
  baseUrl: string,
  siteUrl = baseUrl
): string {
  const site = trimTrailingSlash(siteUrl);
  const pageUrl = story.share.url;
  const storyId = `${pageUrl}#story`;
  const authorUrl = story.author?.id
    ? `${site}/authors/${encodeURIComponent(story.author.id)}`
    : undefined;
  const audioUrl = story.audio?.url
    ? story.audio.url.startsWith('http')
      ? story.audio.url
      : `${trimTrailingSlash(baseUrl)}${story.audio.url.startsWith('/') ? '' : '/'}${story.audio.url}`
    : undefined;
  const audioDuration = durationIso8601(story.audio?.duration);
  const description = story.seoDescription || story.fullText.slice(0, 200);
  const graph: Array<Record<string, unknown>> = [
    {
      '@type': 'Organization',
      '@id': `${site}/#organization`,
      name: 'WonderTales',
      url: `${site}/`,
    },
    {
      '@type': 'WebSite',
      '@id': `${site}/#website`,
      name: 'WonderTales',
      url: `${site}/`,
      publisher: { '@id': `${site}/#organization` },
    },
    {
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: `${story.title} — WonderTales`,
      description,
      inLanguage: story.language || 'uk',
      isPartOf: { '@id': `${site}/#website` },
      primaryImageOfPage: { '@id': `${pageUrl}#primaryimage` },
      mainEntity: { '@id': storyId },
    },
    {
      '@type': 'ImageObject',
      '@id': `${pageUrl}#primaryimage`,
      url: story.share.ogImageUrl,
      contentUrl: story.share.ogImageUrl,
    },
    {
      '@type': storyType(story),
      '@id': storyId,
      name: story.title,
      headline: story.title,
      description,
      url: pageUrl,
      mainEntityOfPage: { '@id': `${pageUrl}#webpage` },
      author: authorUrl
        ? {
            '@type': 'Person',
            '@id': `${authorUrl}#person`,
            name: story.authorDisplayName || 'Anonymous',
            url: authorUrl,
          }
        : { '@type': 'Person', name: story.authorDisplayName || 'Anonymous' },
      publisher: { '@id': `${site}/#organization` },
      datePublished: story.publishedAt || undefined,
      image: { '@id': `${pageUrl}#primaryimage` },
      inLanguage: story.language || 'uk',
      isFamilyFriendly: true,
      ...(story.ageGroup ? { typicalAgeRange: story.ageGroup } : {}),
      ...(story.rating
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(story.rating.avg.toFixed(2)),
              ratingCount: story.rating.count,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
      ...(audioUrl
        ? {
            encoding: {
              '@type': 'AudioObject',
              contentUrl: audioUrl,
              ...(audioDuration ? { duration: audioDuration } : {}),
            },
          }
        : {}),
    },
  ];

  if (/\/stories\/[^/?#]+/.test(pageUrl)) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${pageUrl}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'WonderTales', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: 'Stories', item: `${site}/stories` },
        { '@type': 'ListItem', position: 3, name: story.title, item: pageUrl },
      ],
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
    /</g,
    '\\u003c'
  );
}
