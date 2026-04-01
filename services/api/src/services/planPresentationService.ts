import { DEFAULT_LOCALE, LOCALE_IDS, isValidLocale, type Locale } from '@wondertales/shared';
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

export async function buildPlansWithFeatures(options?: {
  currentPlanId?: string;
  locale?: string | null;
}): Promise<PresentedPlan[]> {
  const plans = await planService.getActivePlans();
  const locale = normalizePlanLocale(options?.locale || DEFAULT_LOCALE);
  const translations = await getPlanTranslations(plans.map((plan) => plan.slug), locale);

  const plansWithFeatures = await Promise.all(
    plans.map(async (plan) => {
      const planFeatures = await planService.getPlanFeaturesByPlanId(plan.id);
      const featuresMap: Record<string, PresentedPlanFeature> = {};

      for (const pf of planFeatures) {
        const feature = await planService.getFeatureById(pf.featureId);
        if (feature) {
          featuresMap[feature.slug] = {
            name: feature.name,
            value: pf.value,
            category: feature.category,
          };
        }
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
        isCurrent: options?.currentPlanId ? plan.id === options.currentPlanId : undefined,
      };
    })
  );

  plansWithFeatures.sort((a, b) => a.sortOrder - b.sortOrder);
  return plansWithFeatures;
}
