import assert from 'node:assert/strict';
import type { PublicStoryListItem, StoryPublicView } from '@wondertales/shared';
import type { PublishedAppRelease } from '../../repositories/AppReleaseRepository';
import { renderAppUpdatesHtml } from '../renderAppUpdatesHtml';
import { renderBlogArticleHtml, renderBlogIndexHtml } from '../renderBlogHtml';
import { renderLandingHtml } from '../renderLandingHtml';
import { renderLegalHtml } from '../renderLegalHtml';
import { renderPricingHtml } from '../renderPricingHtml';
import { renderPublicAuthorHtml } from '../renderPublicAuthorHtml';
import { renderPublicStoriesCatalogHtml } from '../renderPublicStoriesCatalogHtml';
import { renderPublishedStoryHtml } from '../renderPublishedStoryHtml';
import { renderSupportHtml } from '../renderSupportHtml';
import { safeJsonLd } from '../publicStructuredData';

type JsonLdNode = Record<string, unknown>;

function extractGraph(html: string): JsonLdNode[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, 'each SSR page should emit one JSON-LD script');
  const document = JSON.parse(scripts[0][1]) as Record<string, unknown>;
  assert.equal(document['@context'], 'https://schema.org');
  assert.ok(Array.isArray(document['@graph']), 'structured data should use a connected @graph');
  return document['@graph'] as JsonLdNode[];
}

function hasType(graph: JsonLdNode[], expected: string): boolean {
  return graph.some((node) => {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    return types.includes(expected);
  });
}

function assertPageGraph(html: string, pageTypes: string[]): JsonLdNode[] {
  const graph = extractGraph(html);
  for (const type of ['Organization', 'WebSite', ...pageTypes]) {
    assert.ok(hasType(graph, type), `expected ${type} in SSR structured data graph`);
  }
  return graph;
}

const storyListItem: PublicStoryListItem = {
  id: 'story-1',
  title: 'The Moonlit Garden',
  language: 'en',
  ageGroup: '6-8',
  storyFormat: 'story',
  authorId: 'author-1',
  authorDisplayName: 'Ava Author',
  authorAvatarUrl: null,
  coverAssetId: null,
  coverImageUrl: null,
  coverThumbnailUrl: null,
  publishedAt: '2026-05-01T00:00:00.000Z',
  publishedSlug: 'moonlit-garden',
  scenes: [{ sceneId: 1, text: 'A child found a singing flower.' }],
  hasAudio: false,
  scenarioCardId: null,
  shareUrl: 'https://app.wondertales.com/stories/moonlit-garden',
};

const story: StoryPublicView = {
  id: storyListItem.id,
  title: storyListItem.title,
  fullText: storyListItem.scenes[0].text,
  storyFormat: 'story',
  language: 'en',
  ageGroup: '6-8',
  scenes: storyListItem.scenes,
  author: { id: 'author-1', displayName: 'Ava Author' },
  authorDisplayName: 'Ava Author',
  publishedAt: storyListItem.publishedAt,
  share: {
    url: storyListItem.shareUrl,
    ogImageUrl: 'https://app.wondertales.com/story-card.png',
  },
  publicRenderVersion: 1,
};

const release: PublishedAppRelease = {
  id: 'a0000000-0000-4000-8000-000000000714',
  version: null,
  releaseDate: '2026-07-14',
  publishedAt: new Date('2026-07-14T12:00:00Z'),
  updatedAt: new Date('2026-07-14T12:00:00Z'),
  contentRevision: 1,
  locale: 'en',
  title: 'Public release title',
  changes: [{ id: 'one', kind: 'new', title: 'Public feature', description: 'Summary' }],
};

void (async function main() {
  assertPageGraph(renderLandingHtml({ locale: 'en' }), [
    'WebPage',
    'SoftwareApplication',
    'FAQPage',
  ]);
  assertPageGraph(renderPricingHtml({ locale: 'en' }), ['WebPage', 'SoftwareApplication']);
  assertPageGraph(
    renderPublicStoriesCatalogHtml({ locale: 'en', stories: [storyListItem], total: 1 }),
    ['CollectionPage', 'ItemList', 'BreadcrumbList']
  );
  assertPageGraph(
    renderPublicAuthorHtml({
      author: { id: 'author-1', displayName: 'Ava Author' },
      stories: [storyListItem],
      total: 1,
    }),
    ['ProfilePage', 'Person', 'ItemList', 'BreadcrumbList']
  );
  assertPageGraph(renderSupportHtml({ locale: 'en' }), [
    'ContactPage',
    'ContactPoint',
    'BreadcrumbList',
  ]);
  assertPageGraph(await renderLegalHtml({ doc: 'terms', locale: 'en' }), [
    'WebPage',
    'DigitalDocument',
    'BreadcrumbList',
  ]);
  assertPageGraph(await renderLegalHtml({ doc: 'privacy', locale: 'en' }), [
    'WebPage',
    'DigitalDocument',
    'BreadcrumbList',
  ]);
  assertPageGraph(renderAppUpdatesHtml({ locale: 'en', releases: [release] }), [
    'CollectionPage',
    'ItemList',
    'BreadcrumbList',
  ]);
  assertPageGraph(renderBlogIndexHtml({ locale: 'en' }), [
    'CollectionPage',
    'Blog',
    'ItemList',
    'BreadcrumbList',
  ]);
  const blogArticle = renderBlogArticleHtml({ locale: 'en', slug: 'adhd-story-attention' });
  assert.ok(blogArticle);
  assertPageGraph(blogArticle, ['WebPage', 'BlogPosting', 'BreadcrumbList']);
  const storyGraph = assertPageGraph(renderPublishedStoryHtml({ story }), [
    'WebPage',
    'CreativeWork',
    'BreadcrumbList',
  ]);
  const creativeWork = storyGraph.find((node) => node['@type'] === 'CreativeWork');
  const storyAuthor = creativeWork?.author as Record<string, unknown> | undefined;
  assert.equal(creativeWork?.inLanguage, 'en');
  assert.equal(creativeWork?.typicalAgeRange, '6-8');
  assert.equal(storyAuthor?.url, 'https://app.wondertales.com/authors/author-1');

  assert.equal(
    safeJsonLd({ title: '</script><script>alert(1)</script>' }).includes('</script>'),
    false
  );
  console.log('SSR structured data coverage tests passed');
})();
