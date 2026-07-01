import assert from 'node:assert/strict';
import { renderPublicStoriesCatalogHtml } from '../renderPublicStoriesCatalogHtml';
import type { PublicStoryListItem } from '../../services/publicStoryService';

const story: PublicStoryListItem = {
  id: 'story-1',
  title: 'Moonlit Garden',
  language: 'en',
  ageGroup: '4-5',
  authorId: '11111111-1111-4111-8111-111111111111',
  authorDisplayName: 'Ada',
  authorAvatarUrl: null,
  coverAssetId: '22222222-2222-4222-8222-222222222222',
  coverImageUrl: '/api/v1/assets/development/user/story/image/scene-1.jpg',
  coverThumbnailUrl: null,
  publishedAt: '2026-04-10T10:00:00.000Z',
  publishedSlug: 'moonlit-garden',
  scenes: [
    {
      sceneId: 1,
      text: 'A small child found a lantern in the moonlit garden.',
      imageUrl: '/api/v1/assets/development/user/story/image/scene-1.jpg',
    },
  ],
  audioMetadata: { totalDuration: 123, alignment: { words: ['heavy payload'] } } as any,
  hasAudio: false,
  scenarioCardId: null,
  shareUrl: 'https://wondertales.art/stories/moonlit-garden',
};

const ukHtml = renderPublicStoriesCatalogHtml({ locale: 'uk', stories: [story], total: 1 });
assert.match(ukHtml, /<html lang="uk">/);
assert.match(ukHtml, /<meta name="robots" content="index,follow">/);
assert.match(ukHtml, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/uk\/stories">/);
assert.match(ukHtml, /hreflang="en" href="https:\/\/app\.wondertales\.com\/stories"/);
assert.match(ukHtml, /<link rel="manifest" href="\/manifest\.json">/);
assert.match(ukHtml, /href="https:\/\/app\.wondertales\.com\/stories\/moonlit-garden"/);
assert.match(ukHtml, /href="https:\/\/app\.wondertales\.com\/authors\/11111111-1111-4111-8111-111111111111"/);
assert.match(ukHtml, /class="site-footer-language"/);
assert.match(ukHtml, /<option value="https:\/\/app\.wondertales\.com\/stories">English<\/option>/);
assert.match(ukHtml, /<option value="https:\/\/app\.wondertales\.com\/uk\/stories" selected>Українська<\/option>/);
assert.match(ukHtml, /window\.__INITIAL_STORIES__/);
assert.match(ukHtml, /A small child found a lantern in the moonlit garden\./);
assert.doesNotMatch(
  ukHtml.split('window.__INITIAL_STORIES__ = ')[1] ?? '',
  /A small child found a lantern/,
  'hydration payload should keep catalog cards lightweight'
);
assert.doesNotMatch(
  ukHtml.split('window.__INITIAL_STORIES__ = ')[1] ?? '',
  /heavy payload/,
  'hydration payload should not embed audio alignment metadata'
);
assert.doesNotMatch(ukHtml, /noindex/);

const enHtml = renderPublicStoriesCatalogHtml({ locale: 'en', stories: [story], total: 1 });
assert.match(enHtml, /<html lang="en">/);
assert.match(enHtml, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/stories">/);
assert.match(enHtml, /Published WonderTales stories/);
assert.match(enHtml, /<select aria-label="Language"/);
assert.match(enHtml, /<option value="https:\/\/app\.wondertales\.com\/stories" selected>English<\/option>/);
assert.match(enHtml, /<option value="https:\/\/app\.wondertales\.com\/uk\/stories">Українська<\/option>/);
assert.doesNotMatch(enHtml, /onchange=/);

const fallbackHtml = renderPublicStoriesCatalogHtml({
  locale: 'en',
  stories: [story],
  total: 3,
  fallbackStartIndex: 0,
});
assert.match(fallbackHtml, /More stories in other languages/);
assert.match(fallbackHtml, /Stories in English appear first/);

console.log('renderPublicStoriesCatalogHtml tests passed');
