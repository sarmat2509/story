import type { LandingContent } from './landingContent';

interface PricingStructuredPlan {
  name: string;
  description?: string | null;
  priceMonthly: number;
  pricingCurrency: string;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function renderJsonLdScript(data: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function formatSchemaPrice(priceMonthly: number, currency: string): string {
  if (priceMonthly === 0) {
    return '0';
  }

  const amount = ['EUR', 'UAH', 'USD'].includes(currency) ? priceMonthly / 100 : priceMonthly;
  return amount.toFixed(currency === 'UAH' ? 0 : 2);
}

export function renderLandingStructuredData(params: {
  content: LandingContent;
  landingUrl: string;
  pricingUrl: string;
  ogImageUrl: string;
}): string {
  const { content, landingUrl, pricingUrl, ogImageUrl } = params;
  const softwareApplication = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'WonderTales',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    url: landingUrl,
    image: ogImageUrl,
    description: content.metaDescription,
    inLanguage: content.htmlLang,
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      url: pricingUrl,
    },
  };

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: content.htmlLang,
    mainEntity: content.faq.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: stripHtml(item.a.split('/pricing').join(pricingUrl)),
      },
    })),
  };

  return [softwareApplication, faqPage].map(renderJsonLdScript).join('\n  ');
}

export function renderPricingStructuredData(params: {
  pricingUrl: string;
  title: string;
  subtitle: string;
  locale: string;
  plans: PricingStructuredPlan[];
}): string {
  const { pricingUrl, title, subtitle, locale, plans } = params;
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'WonderTales',
    brand: {
      '@type': 'Brand',
      name: 'WonderTales',
    },
    category: 'SoftwareApplication',
    description: subtitle,
    url: pricingUrl,
    inLanguage: locale,
    offers: {
      '@type': 'OfferCatalog',
      name: title,
      url: pricingUrl,
      itemListElement: plans.map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        description: plan.description || undefined,
        price: formatSchemaPrice(plan.priceMonthly, plan.pricingCurrency),
        priceCurrency: plan.pricingCurrency,
        availability: 'https://schema.org/InStock',
        url: pricingUrl,
      })),
    },
  };

  return renderJsonLdScript(product);
}
