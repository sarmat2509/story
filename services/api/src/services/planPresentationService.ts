import { DEFAULT_LOCALE, LOCALE_IDS, isValidLocale, type Locale } from '@wondertales/shared';
import type { Plan, PlanPrice } from '../db/schema';
import { getDictionaryRepository } from '../repositories';
import * as planService from './planService';

const SUPPORTED_LOCALES = new Set(LOCALE_IDS);
export const SUPPORTED_BILLING_CURRENCIES = ['EUR', 'USD'] as const;
export type BillingCurrency = typeof SUPPORTED_BILLING_CURRENCIES[number];
export const DEFAULT_BILLING_CURRENCY: BillingCurrency = 'EUR';
const SUPPORTED_BILLING_CURRENCY_SET = new Set<string>(SUPPORTED_BILLING_CURRENCIES);

export function normalizeBillingCurrency(input?: string | null): BillingCurrency {
  const normalized = input?.trim().toUpperCase();
  return normalized && SUPPORTED_BILLING_CURRENCY_SET.has(normalized)
    ? (normalized as BillingCurrency)
    : DEFAULT_BILLING_CURRENCY;
}

export interface PresentedPlanFeature {
  name: string;
  value: unknown;
  category: string;
}

export interface PresentedPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  pricingCurrency: string;
  prices: Record<BillingCurrency, {
    priceMonthly: number;
    pricingCurrency: BillingCurrency;
    stripePriceConfigured: boolean;
  }>;
  stripePriceConfigured: boolean;
  sortOrder: number;
  features: Record<string, PresentedPlanFeature>;
  isCurrent?: boolean;
}

export interface PlanFeaturePresentationRow {
  planId: string;
  slug: string;
  name: string;
  value: unknown;
  category: string;
}

const DEFAULT_CHARACTERS_PER_MONTH_BY_PLAN: Record<string, number> = {
  free: 3,
  silver: 10,
  golden: 15,
  fairyworld: 20,
};

function addDefaultCharacterFeature(planSlug: string, featuresMap: Record<string, PresentedPlanFeature>): void {
  if (featuresMap.characters_per_month) {
    return;
  }

  const limit = DEFAULT_CHARACTERS_PER_MONTH_BY_PLAN[planSlug];
  if (typeof limit !== 'number') {
    return;
  }

  featuresMap.characters_per_month = {
    name: 'Character Generations Per Month',
    value: { limit },
    category: 'premium',
  };
}

export function normalizePlanLocale(input?: string | null): Locale {
  const normalized = input?.slice(0, 2).toLowerCase() || DEFAULT_LOCALE;
  return isValidLocale(normalized) && SUPPORTED_LOCALES.has(normalized) ? normalized : DEFAULT_LOCALE;
}

async function getPlanTranslations(planSlugs: string[], locale: Locale): Promise<Map<string, Map<string, string>>> {
  const dictionaryRepo = getDictionaryRepository();
  const translationsData = await dictionaryRepo.findTranslations('plan', planSlugs, locale);
  const translationsMap = new Map<string, Map<string, string>>();

  translationsData.forEach((translation) => {
    if (!translationsMap.has(translation.entityId)) {
      translationsMap.set(translation.entityId, new Map());
    }
    translationsMap.get(translation.entityId)!.set(translation.fieldName, translation.value);
  });

  return translationsMap;
}

export function buildPresentedPlans(
  plans: Plan[],
  translations: Map<string, Map<string, string>>,
  featureRows: PlanFeaturePresentationRow[],
  currentPlanId?: string,
  planPriceRows: PlanPrice[] = [],
  billingCurrency: BillingCurrency = DEFAULT_BILLING_CURRENCY
): PresentedPlan[] {
  const featuresByPlanId = new Map<string, PlanFeaturePresentationRow[]>();
  const pricesByPlanId = new Map<string, Partial<PresentedPlan['prices']>>();

  for (const row of featureRows) {
    const rows = featuresByPlanId.get(row.planId) ?? [];
    rows.push(row);
    featuresByPlanId.set(row.planId, rows);
  }

  for (const row of planPriceRows) {
    const currency = normalizeBillingCurrency(row.pricingCurrency);
    const prices = pricesByPlanId.get(row.planId) ?? {};
    prices[currency] = {
      priceMonthly: row.priceMonthly,
      pricingCurrency: currency,
      stripePriceConfigured: !!row.stripePriceId || row.priceMonthly === 0,
    };
    pricesByPlanId.set(row.planId, prices);
  }

  const plansWithFeatures = plans.map((plan) => {
    const featuresMap: Record<string, PresentedPlanFeature> = {};
    for (const feature of featuresByPlanId.get(plan.id) ?? []) {
      featuresMap[feature.slug] = {
        name: feature.name,
        value: feature.value,
        category: feature.category,
      };
    }
    addDefaultCharacterFeature(plan.slug, featuresMap);

    const planTranslations = translations.get(plan.slug);
    const prices = {
      EUR: {
        priceMonthly: plan.pricingCurrency === 'EUR' ? plan.priceMonthly : 0,
        pricingCurrency: 'EUR' as BillingCurrency,
        stripePriceConfigured: plan.priceMonthly === 0,
      },
      USD: {
        priceMonthly: plan.pricingCurrency === 'USD' ? plan.priceMonthly : 0,
        pricingCurrency: 'USD' as BillingCurrency,
        stripePriceConfigured: plan.priceMonthly === 0,
      },
      ...(pricesByPlanId.get(plan.id) ?? {}),
    } satisfies PresentedPlan['prices'];
    const selectedPrice = prices[billingCurrency] ?? prices[DEFAULT_BILLING_CURRENCY] ?? {
      priceMonthly: plan.priceMonthly,
      pricingCurrency: normalizeBillingCurrency(plan.pricingCurrency),
      stripePriceConfigured: plan.priceMonthly === 0,
    };

    return {
      id: plan.id,
      slug: plan.slug,
      name: planTranslations?.get('name') || plan.name,
      description: planTranslations?.get('description') || plan.description || null,
      priceMonthly: selectedPrice.priceMonthly,
      pricingCurrency: selectedPrice.pricingCurrency,
      prices,
      stripePriceConfigured: selectedPrice.stripePriceConfigured,
      sortOrder: plan.sortOrder,
      features: featuresMap,
      isCurrent: currentPlanId ? plan.id === currentPlanId : undefined,
    };
  });

  plansWithFeatures.sort((a, b) => a.sortOrder - b.sortOrder);
  return plansWithFeatures;
}

export async function buildPlansWithFeatures(options?: {
  currentPlanId?: string;
  locale?: string | null;
  billingCurrency?: string | null;
}): Promise<PresentedPlan[]> {
  const plans = await planService.getActivePlans();
  if (plans.length === 0) {
    return [];
  }

  const locale = normalizePlanLocale(options?.locale || DEFAULT_LOCALE);
  const billingCurrency = normalizeBillingCurrency(options?.billingCurrency);
  const [translations, featureRows, planPriceRows] = await Promise.all([
    getPlanTranslations(plans.map((plan) => plan.slug), locale),
    planService.getFeaturesForPlans(plans.map((plan) => plan.id)),
    planService.getPricesForPlans(plans.map((plan) => plan.id)),
  ]);

  return buildPresentedPlans(
    plans,
    translations,
    featureRows,
    options?.currentPlanId,
    planPriceRows,
    billingCurrency
  );
}
