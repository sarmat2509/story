import type { PublicAuthorView, PublicStoryListItem } from '@wondertales/shared';
import type { LandingContent } from './landingContent';
import { versionPublicIconAsset } from './publicAssetUrls';

export type JsonLdNode = Record<string, unknown>;

interface PricingStructuredPlan {
  name: string;
  description?: string | null;
  priceMonthly: number;
  pricingCurrency: string;
}

interface PublicPageStructuredDataParams {
  webAppUrl: string;
  pageUrl: string;
  pageType: string | string[];
  name: string;
  description: string;
  locale: string;
  mainEntityId?: string;
  imageUrl?: string | null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedSiteUrl(webAppUrl: string): string {
  return webAppUrl.replace(/\/$/, '') || 'https://wondertales.art';
}

function organizationId(webAppUrl: string): string {
  return `${normalizedSiteUrl(webAppUrl)}/#organization`;
}

function websiteId(webAppUrl: string): string {
  return `${normalizedSiteUrl(webAppUrl)}/#website`;
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function renderStructuredDataGraph(nodes: JsonLdNode[]): string {
  return `<script type="application/ld+json">${safeJsonLd({
    '@context': 'https://schema.org',
    '@graph': nodes,
  })}</script>`;
}

export function buildPublicSiteNodes(params: PublicPageStructuredDataParams): JsonLdNode[] {
  const siteUrl = normalizedSiteUrl(params.webAppUrl);
  const pageId = `${params.pageUrl}#webpage`;
  const logoUrl = `${siteUrl}${versionPublicIconAsset('/icon-512.png')}`;

  return [
    {
      '@type': 'Organization',
      '@id': organizationId(siteUrl),
      name: 'WonderTales',
      url: `${siteUrl}/`,
      logo: {
        '@type': 'ImageObject',
        '@id': `${siteUrl}/#logo`,
        url: logoUrl,
        contentUrl: logoUrl,
        caption: 'WonderTales',
      },
    },
    {
      '@type': 'WebSite',
      '@id': websiteId(siteUrl),
      name: 'WonderTales',
      url: `${siteUrl}/`,
      publisher: { '@id': organizationId(siteUrl) },
    },
    {
      '@type': params.pageType,
      '@id': pageId,
      url: params.pageUrl,
      name: params.name,
      description: params.description,
      inLanguage: params.locale,
      isPartOf: { '@id': websiteId(siteUrl) },
      ...(params.mainEntityId ? { mainEntity: { '@id': params.mainEntityId } } : {}),
      ...(params.imageUrl
        ? { primaryImageOfPage: { '@id': `${params.pageUrl}#primaryimage` } }
        : {}),
    },
    ...(params.imageUrl
      ? [
          {
            '@type': 'ImageObject',
            '@id': `${params.pageUrl}#primaryimage`,
            url: params.imageUrl,
            contentUrl: params.imageUrl,
          },
        ]
      : []),
  ];
}

export function buildBreadcrumbNode(params: {
  pageUrl: string;
  items: Array<{ name: string; url: string }>;
}): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${params.pageUrl}#breadcrumb`,
    itemListElement: params.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function formatSchemaPrice(priceMonthly: number, currency: string): string {
  if (priceMonthly === 0) return '0';
  const amount = ['EUR', 'UAH', 'USD'].includes(currency) ? priceMonthly / 100 : priceMonthly;
  return amount.toFixed(currency === 'UAH' ? 0 : 2);
}

function storySchemaType(storyFormat: PublicStoryListItem['storyFormat']): string {
  return storyFormat === 'graphic_novel' ? 'ComicStory' : 'CreativeWork';
}

export function renderLandingStructuredData(params: {
  webAppUrl: string;
  content: LandingContent;
  landingUrl: string;
  pricingUrl: string;
  ogImageUrl: string;
}): string {
  const { webAppUrl, content, landingUrl, pricingUrl, ogImageUrl } = params;
  const appId = `${landingUrl}#application`;
  const faqId = `${landingUrl}#faq`;
  const siteUrl = normalizedSiteUrl(webAppUrl);
  const nodes = buildPublicSiteNodes({
    webAppUrl: siteUrl,
    pageUrl: landingUrl,
    pageType: 'WebPage',
    name: content.metaTitle,
    description: content.metaDescription,
    locale: content.htmlLang,
    mainEntityId: appId,
    imageUrl: ogImageUrl,
  });

  nodes.push(
    {
      '@type': 'SoftwareApplication',
      '@id': appId,
      name: 'WonderTales',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      url: landingUrl,
      image: { '@id': `${landingUrl}#primaryimage` },
      description: content.metaDescription,
      inLanguage: content.htmlLang,
      isAccessibleForFree: true,
      publisher: { '@id': organizationId(siteUrl) },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        url: pricingUrl,
      },
    },
    {
      '@type': 'FAQPage',
      '@id': faqId,
      url: landingUrl,
      inLanguage: content.htmlLang,
      mainEntity: content.faq.items.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: stripHtml(item.a.split('/pricing').join(pricingUrl)),
        },
      })),
    }
  );

  return renderStructuredDataGraph(nodes);
}

export function renderPricingStructuredData(params: {
  webAppUrl: string;
  pricingUrl: string;
  title: string;
  subtitle: string;
  locale: string;
  plans: PricingStructuredPlan[];
}): string {
  const { webAppUrl, pricingUrl, title, subtitle, locale, plans } = params;
  const appId = `${pricingUrl}#application`;
  const nodes = buildPublicSiteNodes({
    webAppUrl,
    pageUrl: pricingUrl,
    pageType: 'WebPage',
    name: `${title} — WonderTales`,
    description: subtitle,
    locale,
    mainEntityId: appId,
  });
  nodes.push({
    '@type': 'SoftwareApplication',
    '@id': appId,
    name: 'WonderTales',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    description: subtitle,
    url: pricingUrl,
    inLanguage: locale,
    publisher: { '@id': organizationId(webAppUrl) },
    offers: plans.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      description: plan.description || undefined,
      price: formatSchemaPrice(plan.priceMonthly, plan.pricingCurrency),
      priceCurrency: plan.pricingCurrency,
      availability: 'https://schema.org/InStock',
      url: pricingUrl,
    })),
  });
  return renderStructuredDataGraph(nodes);
}

export function renderStoriesCatalogStructuredData(params: {
  webAppUrl: string;
  pageUrl: string;
  title: string;
  description: string;
  locale: string;
  stories: PublicStoryListItem[];
}): string {
  const collectionId = `${params.pageUrl}#collection`;
  const nodes = buildPublicSiteNodes({
    webAppUrl: params.webAppUrl,
    pageUrl: params.pageUrl,
    pageType: 'CollectionPage',
    name: params.title,
    description: params.description,
    locale: params.locale,
    mainEntityId: collectionId,
  });
  nodes.push(
    {
      '@type': 'ItemList',
      '@id': collectionId,
      numberOfItems: params.stories.length,
      itemListElement: params.stories.map((story, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': storySchemaType(story.storyFormat),
          '@id': `${story.shareUrl}#story`,
          url: story.shareUrl,
          name: story.title,
          inLanguage: story.language,
          datePublished: story.publishedAt || undefined,
          author: {
            '@type': 'Person',
            name: story.authorDisplayName,
            url: `${normalizedSiteUrl(params.webAppUrl)}/authors/${encodeURIComponent(story.authorId)}`,
          },
          ...(story.coverImageUrl ? { image: story.coverImageUrl } : {}),
        },
      })),
    },
    buildBreadcrumbNode({
      pageUrl: params.pageUrl,
      items: [
        { name: 'WonderTales', url: `${normalizedSiteUrl(params.webAppUrl)}/` },
        { name: params.title, url: params.pageUrl },
      ],
    })
  );
  return renderStructuredDataGraph(nodes);
}

export function renderAuthorStructuredData(params: {
  webAppUrl: string;
  authorUrl: string;
  description: string;
  author: PublicAuthorView;
  avatarUrl?: string | null;
  stories: PublicStoryListItem[];
}): string {
  const authorId = `${params.authorUrl}#person`;
  const nodes = buildPublicSiteNodes({
    webAppUrl: params.webAppUrl,
    pageUrl: params.authorUrl,
    pageType: 'ProfilePage',
    name: `${params.author.displayName} — WonderTales`,
    description: params.description,
    locale: 'uk',
    mainEntityId: authorId,
    imageUrl: params.avatarUrl,
  });
  nodes.push(
    {
      '@type': 'Person',
      '@id': authorId,
      identifier: params.author.id,
      name: params.author.displayName,
      description: params.author.aboutMe || params.description,
      url: params.authorUrl,
      ...(params.avatarUrl ? { image: params.avatarUrl } : {}),
    },
    {
      '@type': 'ItemList',
      '@id': `${params.authorUrl}#stories`,
      numberOfItems: params.stories.length,
      itemListElement: params.stories.map((story, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': storySchemaType(story.storyFormat),
          '@id': `${story.shareUrl}#story`,
          url: story.shareUrl,
          name: story.title,
          author: { '@id': authorId },
          datePublished: story.publishedAt || undefined,
        },
      })),
    },
    buildBreadcrumbNode({
      pageUrl: params.authorUrl,
      items: [
        { name: 'WonderTales', url: `${normalizedSiteUrl(params.webAppUrl)}/` },
        { name: params.author.displayName, url: params.authorUrl },
      ],
    })
  );
  return renderStructuredDataGraph(nodes);
}

export function renderSimplePageStructuredData(
  params: PublicPageStructuredDataParams & {
    breadcrumbs?: Array<{ name: string; url: string }>;
    extraNodes?: JsonLdNode[];
  }
): string {
  const nodes = buildPublicSiteNodes(params);
  if (params.breadcrumbs && params.breadcrumbs.length >= 2) {
    nodes.push(buildBreadcrumbNode({ pageUrl: params.pageUrl, items: params.breadcrumbs }));
  }
  nodes.push(...(params.extraNodes ?? []));
  return renderStructuredDataGraph(nodes);
}
