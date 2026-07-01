import assert from 'node:assert';
import {
  PUBLIC_SEO_LOCALES,
  buildPublicBlogArticlePath,
  buildPublicBlogIndexPath,
} from '@wondertales/shared';
import { buildSitemapXmlForStories } from '../sitemapService';
import { getBlogSlugs } from '../../ssr/blogContent';

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const authorA = '11111111-1111-4111-8111-111111111111';
const authorB = '22222222-2222-4222-8222-222222222222';
const draftOnlyAuthor = '33333333-3333-4333-8333-333333333333';

const xml = buildSitemapXmlForStories(
  [
    {
      publishedSlug: 'public-one',
      publishedAt: '2026-04-10T10:00:00.000Z',
      userId: authorA,
    },
    {
      publishedSlug: 'public-two',
      publishedAt: '2026-04-12T10:00:00.000Z',
      userId: authorA,
    },
    {
      publishedSlug: 'public-three',
      publishedAt: '2026-03-01T10:00:00.000Z',
      userId: authorB,
    },
    {
      publishedSlug: null,
      publishedAt: '2026-04-30T10:00:00.000Z',
      userId: draftOnlyAuthor,
    },
  ] as any,
  'https://wondertales.art/'
);

assert.match(xml, /<loc>https:\/\/wondertales\.art\/stories\/public-one<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/stories\/public-two<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/stories<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/blog<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/support<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/blog\/adhd-story-attention<\/loc>/);
assert.doesNotMatch(xml, /<loc>https:\/\/wondertales\.art\/en\//);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/uk\/stories<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/uk\/support<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/uk\/blog\/adhd-story-attention<\/loc>/);

for (const locale of PUBLIC_SEO_LOCALES) {
  const indexUrl = `https://wondertales.art${buildPublicBlogIndexPath(locale)}`;
  assert.match(xml, new RegExp(`<loc>${escapeRegExp(indexUrl)}</loc>`), `sitemap should include blog index for ${locale}`);

  for (const slug of getBlogSlugs()) {
    const articleUrl = `https://wondertales.art${buildPublicBlogArticlePath(slug, locale)}`;
    assert.match(
      xml,
      new RegExp(`<loc>${escapeRegExp(articleUrl)}</loc>`),
      `sitemap should include blog article ${slug} for ${locale}`
    );
  }
}

assert.strictEqual(
  countOccurrences(xml, '<loc>https://wondertales.art/blog'),
  getBlogSlugs().length + 1,
  'default locale sitemap should include one blog index and every default blog article'
);

assert.strictEqual(
  countOccurrences(xml, `<loc>https://wondertales.art/authors/${authorA}</loc>`),
  1,
  'sitemap should include each eligible author once'
);
assert.match(
  xml,
  new RegExp(`<loc>https://wondertales\\.art/authors/${authorA}</loc>\\n    <lastmod>2026-04-12</lastmod>`),
  'author lastmod should use the newest public story date'
);
assert.match(xml, new RegExp(`<loc>https://wondertales\\.art/authors/${authorB}</loc>`));
assert.doesNotMatch(
  xml,
  new RegExp(`<loc>https://wondertales\\.art/authors/${draftOnlyAuthor}</loc>`),
  'authors without public story URLs must stay out of sitemap'
);

console.log('sitemapService tests passed');
