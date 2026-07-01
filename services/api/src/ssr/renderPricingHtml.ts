import { config } from '../config';
import {
  DEFAULT_BILLING_CURRENCY,
  normalizeBillingCurrency,
  type BillingCurrency,
  type PresentedPlan,
} from '../services/planPresentationService';
import { getPlansI18n } from '../utils/i18nLoader';
import {
  PUBLIC_SEO_LOCALES,
  buildPlanDescription,
  getPlanDisplayName,
  normalizeLandingLocale,
  type LandingLocale,
} from './landingContent';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import {
  PUBLIC_FOOTER_STYLES,
  PUBLIC_HEADER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageHeader,
  renderPublicPageFooter,
} from './publicPageFooter';
import { renderPricingStructuredData } from './publicStructuredData';
import {
  buildPublicAppEntryPath,
  buildPublicPricingPath,
  buildPricingFaqItems,
  formatPricingPrice,
  getCombinedPricingUsageHighlight,
  getPricingFeatureLabel,
  interpolatePricingTemplate,
  isPricingFeatureAvailable,
  sortPricingFeatureEntries,
  type PricingTranslate,
} from '@wondertales/shared';

const PRICING_STYLES = `
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fffdfa;color:#1e293b;line-height:1.6;overflow-x:hidden}
a{text-decoration:none}
.page{min-height:100vh;background-color:#fbf8ff;background-image:radial-gradient(circle at 8% 12%,rgba(255,121,82,.10),transparent 26%),radial-gradient(circle at 92% 8%,rgba(126,103,210,.13),transparent 28%),linear-gradient(180deg,#fffdfa 0%,#fbf8ff 100%);background-position:top center,top center,top center;background-size:100% 100vh,100% 100vh,100% 100vh;background-repeat:no-repeat,no-repeat,no-repeat}
.wrap{width:min(100%,1200px);margin:0 auto;padding:32px clamp(16px,4vw,24px) 72px}
.hero{text-align:center;margin:0 auto 36px;max-width:760px;padding:4px 0 0}
.hero h1{margin:0 0 14px;font-size:clamp(32px,5vw,52px);font-weight:700;line-height:1.12;letter-spacing:0;color:#1e293b;text-wrap:balance}
.hero p{margin:0 auto;font-size:clamp(16px,2.1vw,18px);line-height:1.6;color:#475569;max-width:680px;text-wrap:balance}
.currency-toggle{display:inline-flex;align-items:center;gap:4px;margin-top:18px;padding:4px;border-radius:12px;border:1px solid rgba(139,124,184,.24);background:rgba(255,255,255,.76)}
.currency-toggle a{display:inline-flex;align-items:center;justify-content:center;min-width:84px;min-height:38px;padding:0 14px;border-radius:9px;color:#475569;font-size:14px;font-weight:800}
.currency-toggle a.active{background:#8b7cb8;color:#fff;box-shadow:0 8px 20px rgba(139,124,184,.18)}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;align-items:start}
.card{position:relative;display:flex;flex-direction:column;min-height:100%;background:rgba(255,255,255,.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(139,124,184,.2);border-radius:16px;padding:24px;box-shadow:0 12px 30px rgba(15,23,42,.07)}
.card-featured{border-color:rgba(139,124,184,.56);box-shadow:0 18px 42px rgba(139,124,184,.18)}
.name{font-size:clamp(24px,2.8vw,28px);font-weight:700;line-height:1.12;letter-spacing:0;color:#1e293b}
.desc{margin-top:10px;min-height:48px;font-size:15px;line-height:1.6;color:#64748b}
.price-row{display:flex;align-items:flex-end;gap:8px;margin-top:18px}
.price{font-size:clamp(34px,4vw,40px);font-weight:800;line-height:1;letter-spacing:0;color:#1e293b}
.period{font-size:15px;color:#64748b;padding-bottom:4px}
.highlights{display:grid;gap:10px;margin-top:18px}
.highlight{display:flex;align-items:center;justify-content:center;text-align:center;padding:13px 15px;border-radius:12px;background:rgba(139,124,184,.12);border:1px solid rgba(139,124,184,.16);color:#5f4f94;font-size:14px;font-weight:700}
.features{display:grid;gap:12px;margin-top:22px;flex:1}
.feature{display:flex;align-items:flex-start;gap:10px}
.feature-icon{display:inline-flex;align-items:center;justify-content:center;width:20px;min-width:20px;height:20px;margin-top:1px;border-radius:50%;font-size:12px;line-height:1;color:#fff;background:#8b7cb8}
.feature-icon-disabled{background:#e2e8f0;color:#94a3b8}
.feature-text{font-size:15px;line-height:1.55;color:#334155}
.feature-text.disabled{color:#94a3b8}
.btn{display:flex;align-items:center;justify-content:center;min-height:46px;margin-top:24px;padding:0 18px;border-radius:999px;background:#8b7cb8;color:#fff;font-size:15px;font-weight:700;box-shadow:0 8px 20px rgba(139,124,184,.22);transition:transform .18s ease,background .18s ease,box-shadow .18s ease}
.btn:hover{background:#7a6ba8;transform:translateY(-1px);box-shadow:0 12px 26px rgba(139,124,184,.26)}
.btn-disabled{display:flex;align-items:center;justify-content:center;min-height:46px;margin-top:24px;padding:0 18px;border-radius:999px;background:rgba(255,255,255,.62);border:1px solid rgba(148,163,184,.36);color:#64748b;font-size:15px;font-weight:700}
.pricing-faq{max-width:920px;margin:36px auto 0;display:grid;gap:12px}
.pricing-faq h2{margin:0 0 4px;text-align:center;font-size:22px;line-height:1.2;color:#1e293b;letter-spacing:0}
.pricing-faq details{border:1px solid rgba(139,124,184,.18);border-radius:12px;background:rgba(255,255,255,.88);box-shadow:0 12px 28px rgba(15,23,42,.045)}
.pricing-faq summary{position:relative;cursor:pointer;padding:16px 46px 16px 18px;font-size:15px;font-weight:800;color:#1e293b;list-style:none}
.pricing-faq summary::-webkit-details-marker{display:none}
.pricing-faq summary::after{content:"+";position:absolute;right:18px;top:50%;transform:translateY(-50%);font-size:22px;line-height:1;color:#8b7cb8}
.pricing-faq details[open] summary::after{content:"-"}
.pricing-faq summary:focus-visible{outline:3px solid rgba(139,124,184,.35);outline-offset:3px;border-radius:10px}
.pricing-faq p{margin:0;padding:0 18px 16px;font-size:15px;line-height:1.6;color:#475569}
@media (max-width: 1180px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width: 760px){.wrap{padding:28px 16px 56px}.currency-toggle{width:100%;max-width:280px}.currency-toggle a{flex:1;min-width:0}.grid{grid-template-columns:1fr;gap:16px}.card{padding:20px;border-radius:12px}.desc{min-height:0}}
${PUBLIC_HEADER_STYLES}
${PUBLIC_FOOTER_STYLES}
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getPricingPath(locale?: string | null): string {
  return buildPublicPricingPath(locale);
}

function getPricingUrl(webAppUrl: string, locale?: string | null): string {
  const base = webAppUrl.replace(/\/$/, '');
  const path = getPricingPath(locale);
  return base ? `${base}${path}` : path;
}

function getWizardPath(locale?: string | null): string {
  return buildPublicAppEntryPath('/wizard', normalizeLandingLocale(locale));
}

function getWizardUrl(webAppUrl: string, locale?: string | null): string {
  const base = webAppUrl.replace(/\/$/, '');
  const path = getWizardPath(locale);
  return base ? `${base}${path}` : path;
}

function buildPricingAlternateLinks(webAppUrl: string): string {
  const defaultUrl = escapeHtml(getPricingUrl(webAppUrl));
  const alternates = PUBLIC_SEO_LOCALES.map((locale) => (
    `<link rel="alternate" hreflang="${locale}" href="${escapeHtml(getPricingUrl(webAppUrl, locale))}">`
  ));
  alternates.push(`<link rel="alternate" hreflang="x-default" href="${defaultUrl}">`);
  return alternates.join('\n  ');
}

function readPlansI18nValue(plansI18n: any, key: string): string | undefined {
  return key
    .split('.')
    .reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), plansI18n);
}

function buildPricingTranslate(plansI18n: any): PricingTranslate {
  return (key, params = {}, defaultValue = '') => {
    const template = readPlansI18nValue(plansI18n, key) || defaultValue;
    return interpolatePricingTemplate(template, params);
  };
}

const FALLBACK_PLAN_LIMITS = [
  {
    slug: 'free',
    priceMonthly: 0,
    sortOrder: 1,
    stories: 3,
    audio: 1,
    comics: 0,
    images: 1,
    children: 1,
    series: false,
    premiumVoices: false,
    pdf: false,
    video: false,
  },
  {
    slug: 'silver',
    priceMonthly: 899,
    sortOrder: 2,
    stories: 10,
    audio: 5,
    comics: 0,
    images: 1,
    children: 1,
    series: false,
    premiumVoices: false,
    pdf: true,
    video: false,
  },
  {
    slug: 'golden',
    priceMonthly: 2599,
    sortOrder: 3,
    stories: 20,
    audio: 10,
    comics: 5,
    images: 3,
    children: null,
    series: true,
    premiumVoices: false,
    pdf: true,
    video: false,
  },
  {
    slug: 'fairyworld',
    priceMonthly: 5999,
    sortOrder: 4,
    stories: 30,
    audio: 15,
    comics: 15,
    images: 5,
    children: null,
    series: true,
    premiumVoices: true,
    pdf: true,
    video: true,
  },
] as const;

function buildFallbackFeatures(input: typeof FALLBACK_PLAN_LIMITS[number]): PresentedPlan['features'] {
  return {
    stories_per_month: { name: 'Stories Per Month', value: { limit: input.stories }, category: 'stories' },
    audio_stories_per_month: { name: 'Audio Stories Per Month', value: { limit: input.audio }, category: 'media' },
    graphic_novels_per_month: { name: 'Graphic Novels Per Month', value: { limit: input.comics }, category: 'media' },
    images_per_story: { name: 'Images Per Story', value: { limit: input.images }, category: 'media' },
    child_profiles_limit: { name: 'Child Profiles Limit', value: { limit: input.children }, category: 'premium' },
    premium_voices: { name: 'Premium Voice Selection', value: { enabled: input.premiumVoices }, category: 'media' },
    series_enabled: { name: 'Story Series', value: { enabled: input.series }, category: 'stories' },
    follow_narrator: {
      name: 'Follow the narrator',
      value: { enabled: input.slug !== 'free' },
      category: 'media',
    },
    share_enabled: { name: 'Share Story Links', value: { enabled: true }, category: 'export' },
    story_from_drawing: {
      name: 'Story From Child Drawing',
      value: { enabled: input.slug !== 'free' },
      category: 'premium',
    },
    image_quality: {
      name: 'Image Quality',
      value: {
        selected: input.slug === 'free' ? 'low' : input.slug === 'silver' ? 'medium' : 'high',
      },
      category: 'media',
    },
  };
}

export function buildFallbackPricingPlans(
  locale: LandingLocale,
  billingCurrency: BillingCurrency = DEFAULT_BILLING_CURRENCY
): PresentedPlan[] {
  return FALLBACK_PLAN_LIMITS.map((plan) => ({
    id: `fallback-${plan.slug}`,
    slug: plan.slug,
    name: getPlanDisplayName(locale, plan.slug, plan.slug),
    description: buildPlanDescription(locale, plan.slug, plan.stories, plan.audio, plan.images),
    priceMonthly:
      billingCurrency === 'USD'
        ? plan.slug === 'silver'
          ? 999
          : plan.slug === 'golden'
            ? 2999
            : plan.slug === 'fairyworld'
              ? 6999
              : 0
        : plan.priceMonthly,
    pricingCurrency: billingCurrency,
    prices: {
      EUR: {
        priceMonthly: plan.priceMonthly,
        pricingCurrency: 'EUR',
        stripePriceConfigured: plan.priceMonthly === 0,
      },
      USD: {
        priceMonthly:
          plan.slug === 'silver'
            ? 999
            : plan.slug === 'golden'
              ? 2999
              : plan.slug === 'fairyworld'
                ? 6999
                : 0,
        pricingCurrency: 'USD',
        stripePriceConfigured: plan.priceMonthly === 0,
      },
    },
    stripePriceConfigured: plan.priceMonthly === 0,
    sortOrder: plan.sortOrder,
    features: buildFallbackFeatures(plan),
  }));
}

export function renderPricingHtml(params: {
  locale?: string | null;
  plans?: PresentedPlan[];
  paymentsEnabled?: boolean;
  billingCurrency?: string | null;
}): string {
  const locale = normalizeLandingLocale(params.locale);
  const billingCurrency = normalizeBillingCurrency(params.billingCurrency);
  const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '');
  const pricingUrl = getPricingUrl(webAppUrl, locale);
  const plansI18n = getPlansI18n(locale);
  const translatePricing = buildPricingTranslate(plansI18n);
  const title = plansI18n.title || 'Pricing Plans';
  const subtitle = plansI18n.subtitle || '';
  const faqTitle = plansI18n.bundles?.faq_title || plansI18n.faq_title || 'FAQ';
  const faqItems = buildPricingFaqItems({ translate: translatePricing });
  const alternateLinks = buildPricingAlternateLinks(webAppUrl);
  const paymentsEnabled = params.paymentsEnabled ?? true;

  const sourcePlans = params.plans && params.plans.length > 0
    ? params.plans
    : buildFallbackPricingPlans(locale, billingCurrency);
  const plans = sourcePlans.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const structuredData = renderPricingStructuredData({
    pricingUrl,
    title,
    subtitle,
    locale,
    plans,
  });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(`${title} — WonderTales`)}</title>
  <meta name="description" content="${escapeHtml(subtitle)}">
  <meta property="og:title" content="${escapeHtml(`${title} — WonderTales`)}">
  <meta property="og:description" content="${escapeHtml(subtitle)}">
  <meta property="og:url" content="${escapeHtml(pricingUrl)}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(`${title} — WonderTales`)}">
  <meta name="twitter:description" content="${escapeHtml(subtitle)}">
  ${PUBLIC_HEAD_ASSET_LINKS}
  <link rel="canonical" href="${escapeHtml(pricingUrl)}">
  ${alternateLinks}
  ${structuredData}
  <style>${PRICING_STYLES}</style>
</head>
<body>
  <div class="page">
    ${renderPublicPageHeader(webAppUrl, locale, 'pricing')}
    <div class="wrap">
      <header class="hero">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
        <div class="currency-toggle" aria-label="Billing currency">
          ${(['EUR', 'USD'] as BillingCurrency[]).map((currency) => {
            const href = `${getPricingPath(locale)}?currency=${currency}`;
            return `<a href="${escapeHtml(href)}" class="${billingCurrency === currency ? 'active' : ''}" aria-current="${billingCurrency === currency ? 'true' : 'false'}">${currency === 'EUR' ? '€ EUR' : '$ USD'}</a>`;
          }).join('')}
        </div>
      </header>
      <section class="grid">
        ${plans.map((plan) => {
          const usageHighlight = getCombinedPricingUsageHighlight(locale, translatePricing, plan.features);
          const isPaidPlan = plan.priceMonthly > 0;
          const featureRows = sortPricingFeatureEntries(plan.features).map(([slug, feature]) => {
            const available = isPricingFeatureAvailable(feature);
            const iconClass = available ? 'feature-icon' : 'feature-icon feature-icon-disabled';
            return `<div class="feature"><span class="${iconClass}">${available ? '✓' : '✕'}</span><span class="feature-text${available ? '' : ' disabled'}">${escapeHtml(getPricingFeatureLabel(locale, translatePricing, slug, feature))}</span></div>`;
          }).join('');
          const action = !paymentsEnabled && isPaidPlan
            ? `<span class="btn-disabled">${escapeHtml(plansI18n.payments_disabled_button || 'Payments coming soon')}</span>`
            : `<a class="btn" href="${escapeHtml(getWizardUrl(webAppUrl, locale))}">${escapeHtml(plansI18n.subscribe_button)}</a>`;

          return `
          <article class="card${plan.slug === 'golden' ? ' card-featured' : ''}">
            <div class="name">${escapeHtml(plan.name)}</div>
            ${plan.description ? `<div class="desc">${escapeHtml(plan.description)}</div>` : ''}
            <div class="price-row">
              <div class="price">${escapeHtml(formatPricingPrice(locale, plan.priceMonthly, plan.pricingCurrency, plansI18n.free))}</div>
              ${plan.priceMonthly > 0 ? `<div class="period">/${escapeHtml(plansI18n.per_month)}</div>` : ''}
            </div>
            ${usageHighlight ? `<div class="highlights"><div class="highlight"><span>${escapeHtml(usageHighlight)}</span></div></div>` : ''}
            <div class="features">${featureRows}</div>
            ${action}
          </article>`;
        }).join('')}
      </section>
      <section class="pricing-faq" aria-label="${escapeHtml(faqTitle)}">
        <h2>${escapeHtml(faqTitle)}</h2>
        ${!paymentsEnabled ? `<details open><summary>${escapeHtml(plansI18n.payments_disabled_button || 'Payments coming soon')}</summary><p>${escapeHtml(plansI18n.payments_disabled_notice || 'Paid checkout is not enabled yet. Free access remains available.')}</p></details>` : ''}
        ${faqItems.map((item) => `
        <details>
          <summary>${escapeHtml(item.title)}</summary>
          <p>${escapeHtml(item.answer)}</p>
        </details>`).join('')}
      </section>
    </div>
    ${renderPublicPageFooter(webAppUrl, locale, buildPublicFooterLanguageLinks(webAppUrl, buildPublicPricingPath), 'pricing')}
  </div>
</body>
</html>`;
}
