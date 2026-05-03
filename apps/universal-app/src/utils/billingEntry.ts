import { buildPublicPricingPath } from '@wondertales/shared';
import { getPublicSeoLocaleOverrideFromPath } from '@/utils/publicSeoLocale';

export type BillingEntryTarget =
  | { kind: 'app-plans' }
  | { kind: 'parent-gate' }
  | { kind: 'public-web-pricing'; href: string };

export interface ResolveBillingEntryTargetInput {
  isAuthenticated: boolean;
  sessionMode?: 'parent' | 'child';
  platformOs?: string;
  pathname?: string | null;
  locale?: string | null;
  preferPublicPricingForGuests?: boolean;
}

function resolvePublicPricingHref(pathname?: string | null, locale?: string | null): string {
  const routeLocale = pathname ? getPublicSeoLocaleOverrideFromPath(pathname) : null;
  return buildPublicPricingPath(routeLocale ?? locale);
}

export function resolveBillingEntryTarget(
  input: ResolveBillingEntryTargetInput
): BillingEntryTarget {
  const {
    isAuthenticated,
    sessionMode = 'parent',
    platformOs,
    pathname,
    locale,
    preferPublicPricingForGuests = false,
  } = input;

  if (sessionMode === 'child') {
    return { kind: 'parent-gate' };
  }

  if (!isAuthenticated && platformOs === 'web' && preferPublicPricingForGuests) {
    return {
      kind: 'public-web-pricing',
      href: resolvePublicPricingHref(pathname, locale),
    };
  }

  return { kind: 'app-plans' };
}
