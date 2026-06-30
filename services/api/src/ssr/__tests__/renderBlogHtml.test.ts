import assert from 'node:assert/strict';
import {
  PUBLIC_SEO_LOCALES,
  APP_ROUTE_PATHS,
  buildLocalizedAppPath,
  buildPublicBlogArticlePath,
  buildPublicBlogIndexPath,
  escapeHtml,
} from '@wondertales/shared';
import { getBlogArticle, getBlogSlugs } from '../blogContent';
import { renderBlogArticleHtml, renderBlogIndexHtml } from '../renderBlogHtml';

function hrefForPath(path: string): RegExp {
  return new RegExp(`href="https://[^"]+${path.replace(/\//g, '\\/')}"`);
}

function structuredDataTypes(html: string): string[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]) as { '@type'?: string; '@graph'?: Array<{ '@type'?: string }> });

  return scripts.flatMap((script) =>
    script['@graph']?.map((entry) => entry['@type']).filter((type): type is string => !!type) ?? [
      script['@type'],
    ].filter((type): type is string => !!type)
  );
}

for (const locale of PUBLIC_SEO_LOCALES) {
  const indexHtml = renderBlogIndexHtml({ locale });
  assert.match(indexHtml, /<meta name="robots" content="index,follow">/);
  assert.match(indexHtml, /<script type="application\/ld\+json">/);
  assert.deepEqual(
    ['Organization', 'WebSite', 'CollectionPage', 'Blog', 'ItemList', 'BreadcrumbList'].every((type) =>
      structuredDataTypes(indexHtml).includes(type)
    ),
    true,
    `blog index should include complete schema graph for ${locale}`
  );
  assert.match(indexHtml, new RegExp(`<html lang="${locale}">`));
  assert.match(indexHtml, hrefForPath(buildPublicBlogIndexPath(locale)));
  assert.match(indexHtml, hrefForPath(buildPublicBlogArticlePath('adhd-story-attention', locale)));
  assert.match(indexHtml, /class="article-read-time"/);
  assert.match(indexHtml, />7 min<\/span>/);
  assert.match(indexHtml, /hreflang="x-default"/);

  const articleHtml = renderBlogArticleHtml({ locale, slug: 'adhd-story-attention' });
  const article = getBlogArticle('adhd-story-attention', locale);
  assert.ok(articleHtml, `article should render for ${locale}`);
  assert.ok(article, `article data should exist for ${locale}`);
  assert.match(articleHtml, /<meta property="og:type" content="article">/);
  assert.match(articleHtml, /<h2>/);
  assert.match(articleHtml, /<blockquote>/);
  assert.match(articleHtml, /class="insight-grid"/);
  assert.match(articleHtml, /class="decision-table"/);
  assert.match(articleHtml, /class="step-block"/);
  assert.doesNotMatch(articleHtml, /<section class="sources">/);
  assert.doesNotMatch(articleHtml, /russellbarkley\.org/);
  assert.match(articleHtml, /Russell A\. Barkley/);
  const quoteIndex = articleHtml.indexOf('<figure class="quote-card">');
  const firstResearchParagraphIndex = articleHtml.indexOf(escapeHtml(article.sections[1].paragraphs[0]));
  const secondResearchParagraphIndex = articleHtml.indexOf(escapeHtml(article.sections[1].paragraphs[1]));
  assert.ok(
    firstResearchParagraphIndex !== -1 &&
      secondResearchParagraphIndex !== -1 &&
      firstResearchParagraphIndex < quoteIndex &&
      quoteIndex < secondResearchParagraphIndex,
    `quote should be placed between research paragraphs for ${locale}`
  );
  assert.doesNotMatch(articleHtml, /Visual direction|Візуальна ідея|Dirección visual/);
  assert.deepEqual(
    ['Organization', 'WebSite', 'ImageObject', 'WebPage', 'BlogPosting', 'BreadcrumbList'].every((type) =>
      structuredDataTypes(articleHtml).includes(type)
    ),
    true,
    `blog article should include complete schema graph for ${locale}`
  );
  assert.match(articleHtml, hrefForPath(buildPublicBlogArticlePath('adhd-story-attention', locale)));
  assert.match(articleHtml, hrefForPath(buildLocalizedAppPath(APP_ROUTE_PATHS.wizard, locale)));
  assert.match(articleHtml, /hreflang="x-default"/);
}

const safeScaryHtml = renderBlogArticleHtml({ locale: 'uk', slug: 'safe-scary-stories' });
assert.ok(safeScaryHtml, 'safe scary article should render');
assert.match(
  safeScaryHtml,
  /href="https:\/\/[^"]+\/wizard\?theme=scary_stories"/
);
assert.match(safeScaryHtml, /Створити страшну історію/);

const blogSlugs = getBlogSlugs();
assert.equal(blogSlugs.length, 14);
assert.deepEqual(blogSlugs.slice(0, 4), [
  'ten-year-old-reading-comprehension',
  'text-display-reading-comfort',
  'rewarded-story-quizzes',
  'comic-stories-reading-bridge',
]);
const blogDates = blogSlugs.map((slug) => getBlogArticle(slug, 'en')!.updatedAt);
assert.deepEqual(
  blogDates,
  [...blogDates].sort((a, b) => b.localeCompare(a)),
  'blog articles should be ordered from newest to oldest'
);
for (const slug of [
  'ten-year-old-reading-comprehension',
  'rewarded-story-quizzes',
  'comic-stories-reading-bridge',
  'text-display-reading-comfort',
]) {
  for (const locale of PUBLIC_SEO_LOCALES) {
    const articleHtml = renderBlogArticleHtml({ locale, slug });
    assert.ok(articleHtml, `${slug} should render for ${locale}`);
    assert.match(articleHtml, /class="insight-grid"/, `${slug} should render insight cards for ${locale}`);
    assert.match(articleHtml, /class="decision-table"/, `${slug} should render decision table for ${locale}`);
    assert.match(articleHtml, /class="step-block"/, `${slug} should render step block for ${locale}`);
  }
}
for (const slug of blogSlugs) {
  const englishArticle = getBlogArticle(slug, 'en');
  assert.ok(englishArticle, `english article data should exist for ${slug}`);
  for (const locale of PUBLIC_SEO_LOCALES) {
    const localizedArticle = getBlogArticle(slug, locale);
    assert.ok(localizedArticle, `article data should exist for ${slug} in ${locale}`);
    if (locale !== 'en') {
      assert.notEqual(
        localizedArticle.quote.text,
        englishArticle.quote.text,
        `quote should be localized for ${slug} in ${locale}`
      );
    }
  }
}
assert.equal(renderBlogArticleHtml({ locale: 'en', slug: 'missing-article' }), null);

console.log('renderBlogHtml tests passed');
