import { config } from '../config';
import type { PresentedPlan } from '../services/planPresentationService';
import { getPlansI18n } from '../utils/i18nLoader';
import { PUBLIC_SEO_LOCALES, normalizeLandingLocale, type LandingLocale } from './landingContent';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import {
  PUBLIC_FOOTER_STYLES,
  buildPublicFooterLanguageLinks,
  renderPublicPageFooter,
} from './publicPageFooter';
import { renderPricingStructuredData } from './publicStructuredData';
import {
  buildPublicPricingPath,
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
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#111827}
a{text-decoration:none}
.page{min-height:100vh}
.wrap{max-width:1240px;margin:0 auto;padding:24px}
.nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 0 28px}
.brand{font-size:20px;font-weight:800;color:#111827}
.nav-link{font-size:14px;color:#6b7280}
.hero{text-align:center;margin:0 auto 34px;max-width:760px}
.hero h1{margin:0 0 12px;font-size:clamp(32px,5vw,52px);line-height:1.05;letter-spacing:-0.04em}
.hero p{margin:0;font-size:18px;line-height:1.65;color:#6b7280}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;align-items:start}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:28px;padding:28px;box-shadow:0 18px 40px rgba(15,23,42,.06)}
.name{font-size:28px;font-weight:800;line-height:1.1;letter-spacing:-0.03em;color:#111827}
.desc{margin-top:10px;min-height:48px;font-size:15px;line-height:1.6;color:#6b7280}
.price-row{display:flex;align-items:flex-end;gap:8px;margin-top:18px}
.price{font-size:38px;font-weight:800;line-height:1;letter-spacing:-0.04em;color:#111827}
.period{font-size:15px;color:#6b7280;padding-bottom:4px}
.highlights{display:grid;gap:10px;margin-top:18px}
.highlight{display:flex;align-items:center;gap:10px;padding:14px 16px;border-radius:18px;background:#eef6ff;color:#1d4ed8;font-size:14px;font-weight:700}
.dot{width:10px;height:10px;border-radius:50%;background:#4f46e5;flex:0 0 auto}
.features{display:grid;gap:12px;margin-top:22px}
.feature{display:flex;align-items:flex-start;gap:10px}
.feature-icon{font-size:16px;line-height:1.2}
.feature-text{font-size:15px;line-height:1.55;color:#374151}
.feature-text.disabled{color:#9ca3af}
.btn{display:flex;align-items:center;justify-content:center;min-height:46px;margin-top:22px;padding:0 18px;border-radius:999px;background:#111827;color:#fff;font-size:15px;font-weight:700}
.btn:hover{opacity:.92}
.btn-disabled{display:flex;align-items:center;justify-content:center;min-height:46px;margin-top:22px;padding:0 18px;border-radius:999px;background:#e5e7eb;color:#6b7280;font-size:15px;font-weight:700}
.billing-note{max-width:920px;margin:36px auto 0;padding:22px 24px;border:1px solid #e5e7eb;border-radius:18px;background:#fff;color:#374151;box-shadow:0 14px 32px rgba(15,23,42,.05)}
.billing-note h2{margin:0 0 12px;font-size:22px;line-height:1.2;color:#111827}
.billing-note p{margin:8px 0 0;font-size:15px;line-height:1.6}
@media (max-width: 1180px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width: 680px){.wrap{padding:18px}.nav{flex-direction:column;align-items:flex-start}.grid{grid-template-columns:1fr}.desc{min-height:0}}
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

function getWelcomePath(locale?: string | null): string {
  const normalized = normalizeLandingLocale(locale);
  return normalized === 'uk' ? '/welcome' : `/${normalized}/welcome`;
}

function getWelcomeUrl(webAppUrl: string, locale?: string | null): string {
  const base = webAppUrl.replace(/\/$/, '');
  const path = getWelcomePath(locale);
  return base ? `${base}${path}` : path;
}

function buildPricingAlternateLinks(webAppUrl: string): string {
  const defaultUrl = escapeHtml(getPricingUrl(webAppUrl, 'uk'));
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

export function renderPricingHtml(params: {
  locale?: string | null;
  plans?: PresentedPlan[];
  paymentsEnabled?: boolean;
}): string {
  const locale = normalizeLandingLocale(params.locale);
  const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '');
  const pricingUrl = getPricingUrl(webAppUrl, locale);
  const plansI18n = getPlansI18n(locale);
  const translatePricing = buildPricingTranslate(plansI18n);
  const title = plansI18n.title || 'Pricing Plans';
  const subtitle = plansI18n.subtitle || '';
  const alternateLinks = buildPricingAlternateLinks(webAppUrl);
  const paymentsEnabled = params.paymentsEnabled ?? true;

  const plans = (params.plans || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
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
    <div class="wrap">
      <nav class="nav">
        <a class="brand" href="${escapeHtml(webAppUrl || '/')}">WonderTales</a>
        <a class="nav-link" href="${escapeHtml(webAppUrl + (locale === 'uk' ? '/' : `/${locale}/`))}">WonderTales</a>
      </nav>
      <header class="hero">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </header>
      <section class="grid">
        ${plans.map((plan) => {
          const usageHighlight = getCombinedPricingUsageHighlight(locale, translatePricing, plan.features);
          const isPaidPlan = plan.priceMonthly > 0;
          const featureRows = sortPricingFeatureEntries(plan.features).map(([slug, feature]) => {
            const available = isPricingFeatureAvailable(feature);
            return `<div class="feature"><span class="feature-icon">${available ? '✓' : '✕'}</span><span class="feature-text${available ? '' : ' disabled'}">${escapeHtml(getPricingFeatureLabel(locale, translatePricing, slug, feature))}</span></div>`;
          }).join('');
          const action = !paymentsEnabled && isPaidPlan
            ? `<span class="btn-disabled">${escapeHtml(plansI18n.payments_disabled_button || 'Payments coming soon')}</span>`
            : `<a class="btn" href="${escapeHtml(getWelcomeUrl(webAppUrl, locale))}">${escapeHtml(plansI18n.subscribe_button)}</a>`;

          return `
          <article class="card">
            <div class="name">${escapeHtml(plan.name)}</div>
            ${plan.description ? `<div class="desc">${escapeHtml(plan.description)}</div>` : ''}
            <div class="price-row">
              <div class="price">${escapeHtml(formatPricingPrice(locale, plan.priceMonthly, plan.pricingCurrency, plansI18n.free))}</div>
              ${plan.priceMonthly > 0 ? `<div class="period">/${escapeHtml(plansI18n.per_month)}</div>` : ''}
            </div>
            ${usageHighlight ? `<div class="highlights"><div class="highlight"><span class="dot"></span><span>${escapeHtml(usageHighlight)}</span></div></div>` : ''}
            <div class="features">${featureRows}</div>
            ${action}
          </article>`;
        }).join('')}
      </section>
      <section class="billing-note" aria-label="${escapeHtml(plansI18n.billing_note_title || 'Billing details')}">
        <h2>${escapeHtml(plansI18n.billing_note_title || 'Billing details')}</h2>
        ${!paymentsEnabled ? `<p>${escapeHtml(plansI18n.payments_disabled_notice || 'Paid checkout is not enabled yet. Free access remains available.')}</p>` : ''}
        <p>${escapeHtml(plansI18n.billing_note_renewal || 'Paid subscriptions renew monthly until canceled. You can manage or cancel billing in the billing portal where available.')}</p>
        <p>${escapeHtml(plansI18n.billing_note_bundles || 'Bundles are one-time add-ons for the current billing period. Unused bundle credits expire at period end and do not roll over.')}</p>
        <p>${escapeHtml(plansI18n.billing_note_refunds || 'Refund requests are reviewed through support and do not happen automatically when a subscription is canceled.')}</p>
      </section>
    </div>
    ${renderPublicPageFooter(webAppUrl, locale, buildPublicFooterLanguageLinks(webAppUrl, buildPublicPricingPath))}
  </div>
</body>
</html>`;
}
