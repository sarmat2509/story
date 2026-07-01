import assert from 'node:assert/strict';
import { PUBLIC_SEO_LOCALES } from '@wondertales/shared';
import { renderBlogArticleHtml, renderBlogIndexHtml } from '../renderBlogHtml';
import { renderLandingHtml } from '../renderLandingHtml';
import { renderLegalHtml } from '../renderLegalHtml';
import { renderPricingHtml } from '../renderPricingHtml';
import { renderPublicPageHeader, type PublicPageNavId } from '../publicPageFooter';
import { renderPublicStoriesCatalogHtml } from '../renderPublicStoriesCatalogHtml';
import { renderSupportHtml } from '../renderSupportHtml';

function normalizeHeader(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}

function extractHeader(html: string): string {
  const match = html.match(/<header class="site-header" data-site-header>[\s\S]*?<\/header>/);
  assert.ok(match, 'page should render the shared public header');
  return normalizeHeader(match[0]);
}

void (async function main() {
  for (const locale of PUBLIC_SEO_LOCALES) {
    const blogArticleHtml = renderBlogArticleHtml({ locale, slug: 'adhd-story-attention' });
    assert.ok(blogArticleHtml, `blog article should render for ${locale}`);

    const pages = [
      ['landing', renderLandingHtml({ locale }), undefined],
      ['pricing', renderPricingHtml({ locale, plans: [] }), 'pricing'],
      ['stories', renderPublicStoriesCatalogHtml({ locale, stories: [], total: 0 }), 'stories'],
      ['blog index', renderBlogIndexHtml({ locale }), 'blog'],
      ['blog article', blogArticleHtml, 'blog'],
      ['support', renderSupportHtml({ locale }), 'support'],
      ['legal', await renderLegalHtml({ doc: 'terms', locale }), 'terms'],
    ] as const;

    for (const [name, html, currentPage] of pages) {
      const expectedHeader = extractHeader(
        renderPublicPageHeader('https://app.wondertales.com', locale, currentPage as PublicPageNavId | undefined)
      );
      assert.equal(extractHeader(html), expectedHeader, `${name} should use the shared public header for ${locale}`);
    }
  }

  console.log('publicPageHeader tests passed');
})();
