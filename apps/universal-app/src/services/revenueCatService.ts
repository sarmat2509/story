export function isRevenueCatConfigured(): boolean {
  return false;
}

export async function configureRevenueCat(_userId: string | null | undefined): Promise<void> {
  // Web payments continue through Stripe. Native builds use revenueCatService.native.ts.
}

export async function getRevenueCatPlanPackage(_planSlug: string): Promise<null> {
  return null;
}

export async function purchaseRevenueCatPlan(_planSlug: string): Promise<never> {
  throw new Error('RevenueCat is only available on iOS and Android');
}

export async function restoreRevenueCatPurchases(): Promise<never> {
  throw new Error('RevenueCat is only available on iOS and Android');
}
