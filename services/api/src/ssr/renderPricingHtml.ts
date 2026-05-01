import { config } from '../config';
import type { PresentedPlan, PresentedPlanFeature } from '../services/planPresentationService';
import { getPlansI18n } from '../utils/i18nLoader';
import { PUBLIC_SEO_LOCALES, normalizeLandingLocale, type LandingLocale } from './landingContent';
import { PUBLIC_HEAD_ASSET_LINKS } from './publicHeadAssets';
import { PUBLIC_FOOTER_STYLES, renderPublicPageFooter } from './publicPageFooter';

const FEATURE_ORDER = [
  'stories_per_day',
  'images_per_story',
  'premium_voices',
  'child_profiles_limit',
  'series_enabled',
  'export_pdf',
  'export_video',
  'share_enabled',
] as const;

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
  const normalized = normalizeLandingLocale(locale);
  return normalized === 'uk' ? '/pricing' : `/${normalized}/pricing`;
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

const MONTHLY_SUFFIXES: Record<LandingLocale, string> = {
  uk: 'на місяць',
  ru: 'в месяц',
  en: 'per month',
  es: 'al mes',
  de: 'pro Monat',
  fr: 'par mois',
  pl: 'miesięcznie',
};

const MONTHLY_CONJUNCTIONS: Record<LandingLocale, string> = {
  uk: 'і',
  ru: 'и',
  en: 'and',
  es: 'y',
  de: 'und',
  fr: 'et',
  pl: 'i',
};

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(params[key] ?? ''));
}

function pluralCategory(locale: LandingLocale, count: number): 'one' | 'few' | 'many' | 'other' {
  if (locale === 'uk' || locale === 'ru') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'few';
    return 'many';
  }

  if (locale === 'pl') {
    if (count === 1) return 'one';
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'other';
    return 'many';
  }

  return count === 1 ? 'one' : 'other';
}

function formatPrice(locale: LandingLocale, priceMonthly: number, currency: string, plansI18n: any): string {
  if (priceMonthly === 0) {
    return plansI18n.free;
  }

  const amount = (currency === 'UAH' || currency === 'USD') ? priceMonthly / 100 : priceMonthly;
  const symbol = currency === 'UAH' ? '₴' : currency === 'USD' ? '$' : '€';
  const fixed = currency === 'USD' ? amount.toFixed(2) : amount.toFixed(0);
  return locale === 'en' ? `${symbol}${fixed}` : `${fixed}${currency === 'USD' ? ` ${currency}` : symbol}`;
}

function renderFeatureValue(feature: PresentedPlanFeature): string {
  const value = feature.value as any;
  if (value && typeof value === 'object') {
    if ('limit' in value) {
      if (value.limit == null) return '∞';
      return `${value.limit} ${value.unit || ''}`.trim();
    }
    if ('enabled' in value) {
      return value.enabled ? '✓' : '✗';
    }
    if ('selected' in value) {
      return String(value.selected);
    }
  }
  return String(value ?? '');
}

function isFeatureAvailable(feature: PresentedPlanFeature): boolean {
  const value = feature.value as any;
  if (value && typeof value === 'object') {
    if ('enabled' in value) return value.enabled;
    if ('limit' in value) return value.limit == null || value.limit > 0;
  }
  return true;
}

function sortFeatures(features: Record<string, PresentedPlanFeature>) {
  const entries = Object.entries(features);
  const available: Array<[string, PresentedPlanFeature]> = [];
  const unavailable: Array<[string, PresentedPlanFeature]> = [];

  entries.forEach(([slug, feature]) => {
    if (
      slug === 'stories_per_month' ||
      slug === 'audio_stories_per_month' ||
      slug === 'story_from_drawing' ||
      slug === 'image_quality'
    ) {
      return;
    }
    (isFeatureAvailable(feature) ? available : unavailable).push([slug, feature]);
  });

  const order = (slug: string) => {
    const idx = FEATURE_ORDER.indexOf(slug as typeof FEATURE_ORDER[number]);
    return idx === -1 ? FEATURE_ORDER.length : idx;
  };

  available.sort((a, b) => order(a[0]) - order(b[0]));
  unavailable.sort((a, b) => order(a[0]) - order(b[0]));

  return [...available, ...unavailable];
}

function getFeatureLabel(locale: LandingLocale, plansI18n: any, slug: string, feature: PresentedPlanFeature): string {
  const featureTranslations = plansI18n.features || {};
  const value = feature.value as any;

  if (slug === 'child_profiles_limit' && value?.limit == null && featureTranslations.child_profiles_limit_unlimited) {
    return featureTranslations.child_profiles_limit_unlimited;
  }

  if (slug === 'child_profiles_limit' && value?.limit === 1 && featureTranslations.child_profiles_limit_one) {
    return featureTranslations.child_profiles_limit_one;
  }

  if (slug === 'images_per_story' && typeof value?.limit === 'number') {
    const category = pluralCategory(locale, value.limit);
    const pluralKey = category === 'one'
      ? 'images_per_story_one'
      : category === 'few'
        ? 'images_per_story_few'
        : category === 'many'
          ? 'images_per_story_many'
          : 'images_per_story_other';
    const template = featureTranslations[pluralKey] || featureTranslations.images_per_story || feature.name;
    return interpolate(template, { value: value.limit, count: value.limit });
  }

  const template = featureTranslations[slug] || feature.name;
  return interpolate(template, { value: renderFeatureValue(feature) });
}

function getMetricHighlight(template: string | undefined, feature?: PresentedPlanFeature): string | null {
  const limit = (feature?.value as any)?.limit;
  if (typeof limit !== 'number') return null;
  if (!template) return null;
  return interpolate(template, { count: limit, value: limit });
}

function stripMonthlySuffix(locale: LandingLocale, value: string): string {
  const suffix = MONTHLY_SUFFIXES[locale];
  if (!suffix) return value.trim();
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`\\s+${escapedSuffix}$`), '').trim();
}

function getCombinedUsageHighlight(
  locale: LandingLocale,
  plansI18n: any,
  plan: PresentedPlan
): string | null {
  const stories = getMetricHighlight(plansI18n.features?.stories_per_month, plan.features.stories_per_month);
  const audio = getMetricHighlight(plansI18n.audio_stories, plan.features.audio_stories_per_month);

  if (!stories && !audio) return null;
  if (!stories) return audio;
  if (!audio) return stories;

  const storiesBase = stripMonthlySuffix(locale, stories);
  const audioBase = stripMonthlySuffix(locale, audio);
  return `${storiesBase} ${MONTHLY_CONJUNCTIONS[locale]} ${audioBase} ${MONTHLY_SUFFIXES[locale]}`;
}

export function renderPricingHtml(params: {
  locale?: string | null;
  plans?: PresentedPlan[];
}): string {
  const locale = normalizeLandingLocale(params.locale);
  const webAppUrl = (config.web?.webAppUrl || '').replace(/\/$/, '');
  const pricingUrl = getPricingUrl(webAppUrl, locale);
  const plansI18n = getPlansI18n(locale);
  const title = plansI18n.title || 'Pricing Plans';
  const subtitle = plansI18n.subtitle || '';
  const alternateLinks = buildPricingAlternateLinks(webAppUrl);

  const plans = (params.plans || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

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
          const usageHighlight = getCombinedUsageHighlight(locale, plansI18n, plan);
          const featureRows = sortFeatures(plan.features).map(([slug, feature]) => {
            const available = isFeatureAvailable(feature);
            return `<div class="feature"><span class="feature-icon">${available ? '✓' : '✕'}</span><span class="feature-text${available ? '' : ' disabled'}">${escapeHtml(getFeatureLabel(locale, plansI18n, slug, feature))}</span></div>`;
          }).join('');

          return `
          <article class="card">
            <div class="name">${escapeHtml(plan.name)}</div>
            ${plan.description ? `<div class="desc">${escapeHtml(plan.description)}</div>` : ''}
            <div class="price-row">
              <div class="price">${escapeHtml(formatPrice(locale, plan.priceMonthly, plan.pricingCurrency, plansI18n))}</div>
              ${plan.priceMonthly > 0 ? `<div class="period">/${escapeHtml(plansI18n.per_month)}</div>` : ''}
            </div>
            ${usageHighlight ? `<div class="highlights"><div class="highlight"><span class="dot"></span><span>${escapeHtml(usageHighlight)}</span></div></div>` : ''}
            <div class="features">${featureRows}</div>
            <a class="btn" href="${escapeHtml(getWelcomeUrl(webAppUrl, locale))}">${escapeHtml(plansI18n.subscribe_button)}</a>
          </article>`;
        }).join('')}
      </section>
    </div>
    ${renderPublicPageFooter(webAppUrl)}
  </div>
</body>
</html>`;
}
