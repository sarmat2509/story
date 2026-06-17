import assert from 'node:assert';
import { buildSitemapXmlForStories } from '../sitemapService';

function countOccurrences(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
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
assert.match(xml, /<loc>https:\/\/wondertales\.art\/en\/stories<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/ru\/stories<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/es\/stories<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/de\/stories<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/fr\/stories<\/loc>/);
assert.match(xml, /<loc>https:\/\/wondertales\.art\/pl\/stories<\/loc>/);

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
