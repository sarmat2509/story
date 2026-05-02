import {
  buildAbsoluteRouteUrl,
  buildLocalizedAppPath,
  normalizeAppUiLocale,
} from '@wondertales/shared';

type CheckoutKind = 'subscription' | 'bundle';

function normalizeWebAppUrl(webAppUrl: string): string {
  return webAppUrl.replace(/\/$/, '');
}

export function buildBillingCheckoutReturnUrls(
  webAppUrl: string,
  preferredLocale: string | null | undefined,
  kind: CheckoutKind
): { successUrl: string; cancelUrl: string } {
  const baseUrl = normalizeWebAppUrl(webAppUrl);
  const locale = normalizeAppUiLocale(preferredLocale);
  const successPath = buildLocalizedAppPath('/billing/success', locale);
  const cancelPath = buildLocalizedAppPath('/billing/plans', locale);

  return {
    successUrl: `${buildAbsoluteRouteUrl(baseUrl, successPath)}?kind=${kind}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: buildAbsoluteRouteUrl(baseUrl, cancelPath),
  };
}

export function buildBillingPortalReturnUrl(
  webAppUrl: string,
  preferredLocale: string | null | undefined
): string {
  return buildAbsoluteRouteUrl(
    normalizeWebAppUrl(webAppUrl),
    buildLocalizedAppPath('/profile', normalizeAppUiLocale(preferredLocale))
  );
}
