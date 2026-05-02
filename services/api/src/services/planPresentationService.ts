import { DEFAULT_LOCALE, LOCALE_IDS, isValidLocale, type Locale } from '@wondertales/shared';
import type { Plan } from '../db/schema';
import { getDictionaryRepository } from '../repositories';
import * as planService from './planService';

const SUPPORTED_LOCALES = new Set(LOCALE_IDS);

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
  currentPlanId?: string
): PresentedPlan[] {
  const featuresByPlanId = new Map<string, PlanFeaturePresentationRow[]>();

  for (const row of featureRows) {
    const rows = featuresByPlanId.get(row.planId) ?? [];
    rows.push(row);
    featuresByPlanId.set(row.planId, rows);
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

    const planTranslations = translations.get(plan.slug);

    return {
      id: plan.id,
      slug: plan.slug,
      name: planTranslations?.get('name') || plan.name,
      description: planTranslations?.get('description') || plan.description || null,
      priceMonthly: plan.priceMonthly,
      pricingCurrency: plan.pricingCurrency,
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
}): Promise<PresentedPlan[]> {
  const plans = await planService.getActivePlans();
  if (plans.length === 0) {
    return [];
  }

  const locale = normalizePlanLocale(options?.locale || DEFAULT_LOCALE);
  const [translations, featureRows] = await Promise.all([
    getPlanTranslations(plans.map((plan) => plan.slug), locale),
    planService.getFeaturesForPlans(plans.map((plan) => plan.id)),
  ]);

  return buildPresentedPlans(plans, translations, featureRows, options?.currentPlanId);
}
