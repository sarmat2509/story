import { Platform } from 'react-native';
import { REVENUECAT_CONFIG } from '@/config/constants';

type RevenueCatModule = typeof import('react-native-purchases');
type PurchasesPackage = import('react-native-purchases').PurchasesPackage;
type CustomerInfo = import('react-native-purchases').CustomerInfo;

let configuredForUserId: string | null = null;

function getRevenueCatApiKey(): string {
  if (Platform.OS === 'ios') return REVENUECAT_CONFIG.iosApiKey;
  if (Platform.OS === 'android') return REVENUECAT_CONFIG.androidApiKey;
  return '';
}

function isNativeStorePlatform(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function loadPurchases(): RevenueCatModule | null {
  if (!isNativeStorePlatform()) return null;
  return require('react-native-purchases') as RevenueCatModule;
}

export function isRevenueCatConfigured(): boolean {
  return isNativeStorePlatform() && getRevenueCatApiKey().trim().length > 0;
}

export async function configureRevenueCat(userId: string | null | undefined): Promise<void> {
  if (!userId || !isRevenueCatConfigured()) return;
  if (configuredForUserId === userId) return;

  const RevenueCat = loadPurchases();
  if (!RevenueCat) return;

  RevenueCat.default.configure({
    apiKey: getRevenueCatApiKey(),
    appUserID: userId,
    automaticDeviceIdentifierCollectionEnabled: false,
  });
  configuredForUserId = userId;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function packageMatchesPlan(pkg: PurchasesPackage, planSlug: string): boolean {
  const planKey = normalize(planSlug);
  return [
    pkg.identifier,
    pkg.product.identifier,
    pkg.product.title,
    pkg.product.description,
  ]
    .filter(Boolean)
    .map((value) => normalize(String(value)))
    .some((value) => value.includes(planKey));
}

export async function getRevenueCatPlanPackage(planSlug: string): Promise<PurchasesPackage | null> {
  if (!isRevenueCatConfigured()) return null;

  const RevenueCat = loadPurchases();
  if (!RevenueCat) return null;

  const offerings = await RevenueCat.default.getOfferings();
  const offering =
    offerings.all[REVENUECAT_CONFIG.offeringId] ??
    offerings.current ??
    Object.values(offerings.all)[0];
  if (!offering) return null;

  return offering.availablePackages.find((pkg) => packageMatchesPlan(pkg, planSlug)) ?? null;
}

export async function purchaseRevenueCatPlan(planSlug: string): Promise<CustomerInfo> {
  const RevenueCat = loadPurchases();
  if (!RevenueCat) {
    throw new Error('RevenueCat is only available on iOS and Android');
  }

  const pkg = await getRevenueCatPlanPackage(planSlug);
  if (!pkg) {
    throw new Error('RevenueCat product is not configured for this plan');
  }

  const result = await RevenueCat.default.purchasePackage(pkg);
  return result.customerInfo;
}

export async function restoreRevenueCatPurchases(): Promise<CustomerInfo> {
  const RevenueCat = loadPurchases();
  if (!RevenueCat) {
    throw new Error('RevenueCat is only available on iOS and Android');
  }
  return RevenueCat.default.restorePurchases();
}
