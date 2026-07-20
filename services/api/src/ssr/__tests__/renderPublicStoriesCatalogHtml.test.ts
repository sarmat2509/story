import assert from 'node:assert/strict';
import { renderPublicStoriesCatalogHtml } from '../renderPublicStoriesCatalogHtml';
import type { PublicStoryListItem } from '@wondertales/shared';

const story: PublicStoryListItem = {
  id: 'story-1',
  title: 'Moonlit Garden',
  language: 'en',
  ageGroup: '4-5',
  storyFormat: 'story',
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
assert.match(ukHtml, /<link rel="manifest" href="\/manifest\.json(?:\?v=[^"]+)?">/);
assert.match(ukHtml, /href="https:\/\/app\.wondertales\.com\/stories\/moonlit-garden"/);
assert.match(ukHtml, /href="https:\/\/app\.wondertales\.com\/authors\/11111111-1111-4111-8111-111111111111"/);
assert.match(ukHtml, /class="site-footer-language"/);
assert.match(ukHtml, /\.read\{[^}]*transition:transform \.18s ease/);
assert.match(ukHtml, /\.read:hover\{[^}]*transform:translateY\(-1px\)/);
assert.match(ukHtml, /<option value="https:\/\/app\.wondertales\.com\/stories">English<\/option>/);
assert.match(ukHtml, /<option value="https:\/\/app\.wondertales\.com\/uk\/stories" selected>Українська<\/option>/);
assert.doesNotMatch(ukHtml, /window\.__INITIAL_STORIES__/);
assert.doesNotMatch(ukHtml, /<script\b[^>]*\bsrc=/i);
assert.match(ukHtml, /A small child found a lantern in the moonlit garden\./);
assert.match(ukHtml, /class="format-badge">Історія<\/span>/);
assert.doesNotMatch(ukHtml, /heavy payload/, 'static catalog should not embed audio alignment metadata');
assert.doesNotMatch(ukHtml, /noindex/);
assert.doesNotMatch(ukHtml, /Приватні, приховані/);

const enHtml = renderPublicStoriesCatalogHtml({ locale: 'en', stories: [story], total: 1 });
assert.match(enHtml, /<html lang="en">/);
assert.match(enHtml, /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/stories">/);
assert.match(enHtml, /Published WonderTales stories/);
assert.doesNotMatch(enHtml, /Private, hidden, and unlisted/);
assert.match(enHtml, /<select aria-label="Language"/);
assert.match(enHtml, /<option value="https:\/\/app\.wondertales\.com\/stories" selected>English<\/option>/);
assert.match(enHtml, /<option value="https:\/\/app\.wondertales\.com\/uk\/stories">Українська<\/option>/);
assert.doesNotMatch(enHtml, /onchange=/);
assert.match(enHtml, /<option value="1y">1 year<\/option>/);
assert.match(
  enHtml,
  /\.filter-field select\{[^}]*min-height:48px[^}]*border-radius:9999px[^}]*background:#f4eefb/,
  'SSR catalog selects should mirror the rounded app dropdown controls'
);

const ruMixedHtml = renderPublicStoriesCatalogHtml({
  locale: 'ru',
  stories: [{ ...story, storyFormat: 'mixed_story' }],
  total: 1,
});
assert.match(ruMixedHtml, /class="format-badge">История \+ комикс<\/span>/);
assert.doesNotMatch(ruMixedHtml, /персонализированн/i);
assert.doesNotMatch(ruMixedHtml, /Приватные, скрытые/);

const removedIntroSentences = {
  es: /Las historias privadas, ocultas y no listadas/,
  de: /Private, versteckte und nicht gelistete Geschichten/,
  fr: /Les histoires privées, masquées ou non répertoriées/,
  pl: /Historie prywatne, ukryte i niepubliczne/,
} as const;
for (const [locale, removedSentence] of Object.entries(removedIntroSentences)) {
  const html = renderPublicStoriesCatalogHtml({
    locale: locale as keyof typeof removedIntroSentences,
    stories: [story],
    total: 1,
  });
  assert.doesNotMatch(html, removedSentence, `${locale} catalog should omit the privacy explanation`);
}

const fallbackHtml = renderPublicStoriesCatalogHtml({
  locale: 'en',
  stories: [story],
  total: 3,
  fallbackStartIndex: 0,
});
assert.match(fallbackHtml, /More stories in other languages/);
assert.match(fallbackHtml, /Stories in English appear first/);
assert.match(
  fallbackHtml,
  /\.fallback-note\{[^}]*linear-gradient\(135deg,#8068d8 0%,#a86aa6 48%,#d86559 100%\)/,
  'other-language divider should reuse the parent-trust gradient palette'
);

const paginatedHtml = renderPublicStoriesCatalogHtml({
  locale: 'en',
  stories: [story],
  total: 60,
  page: 2,
  pageSize: 24,
});
assert.match(
  paginatedHtml,
  /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/stories\?page=2">/,
  'each unfiltered catalog page should have a self-referencing canonical'
);
assert.match(paginatedHtml, /<link rel="prev" href="https:\/\/app\.wondertales\.com\/stories">/);
assert.match(paginatedHtml, /<link rel="next" href="https:\/\/app\.wondertales\.com\/stories\?page=3">/);
assert.match(paginatedHtml, /aria-current="page"[^>]*>2<\/span>/);
assert.match(paginatedHtml, /href="https:\/\/app\.wondertales\.com\/stories\?page=3"/);
assert.match(paginatedHtml, /<meta name="robots" content="index,follow">/);

const filteredHtml = renderPublicStoriesCatalogHtml({
  locale: 'uk',
  stories: [story],
  total: 1,
  page: 1,
  pageSize: 24,
  filters: { language: 'en', ageGroup: '4-5', readingTime: 'short', hasAudio: true },
});
assert.match(filteredHtml, /<form class="filters" method="get"/);
assert.match(filteredHtml, /name="language"/);
assert.match(filteredHtml, /value="en" selected/);
assert.match(filteredHtml, /name="age"/);
assert.match(filteredHtml, /value="4-5" selected/);
assert.match(filteredHtml, /name="reading"/);
assert.match(filteredHtml, /value="short" selected/);
assert.match(filteredHtml, /name="audio" value="1" checked/);
assert.match(filteredHtml, /<meta name="robots" content="noindex,follow">/);
assert.match(
  filteredHtml,
  /<link rel="canonical" href="https:\/\/app\.wondertales\.com\/uk\/stories\?language=en&amp;age=4-5&amp;reading=short&amp;audio=1">/
);
assert.doesNotMatch(filteredHtml, /hreflang=/, 'filtered facet URLs should not create hreflang clusters');

const invalidPageHtml = renderPublicStoriesCatalogHtml({
  locale: 'en',
  stories: [],
  total: 1,
  page: 4,
  pageSize: 24,
  invalidPage: true,
});
assert.match(invalidPageHtml, /This page does not exist/);
assert.match(invalidPageHtml, /<meta name="robots" content="noindex,follow">/);

console.log('renderPublicStoriesCatalogHtml tests passed');
