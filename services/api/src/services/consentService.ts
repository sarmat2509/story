import { getUserConsentRepository } from '../repositories';

export const CONSENT_DOCUMENT_VERSIONS = {
  termsOfService: '2026-05-01',
  privacyPolicy: '2026-05-01',
  adultGuardian: '2026-05-01',
  childDataProcessing: '2026-05-01',
} as const;

export const CONSENT_TYPES = {
  termsOfService: 'terms_of_service',
  privacyPolicy: 'privacy_policy',
  adultGuardian: 'adult_guardian',
  childDataProcessing: 'child_data_processing',
} as const;

export type ConsentType = typeof CONSENT_TYPES[keyof typeof CONSENT_TYPES];

export interface ConsentAuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown>;
}

export function isConsentAccepted(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 'on' || value === 'yes';
}

export function validateRegistrationConsents(input: {
  termsAccepted?: unknown;
  privacyAccepted?: unknown;
  isAdultGuardian?: unknown;
}): string[] {
  const missing: string[] = [];
  if (!isConsentAccepted(input.termsAccepted)) missing.push(CONSENT_TYPES.termsOfService);
  if (!isConsentAccepted(input.privacyAccepted)) missing.push(CONSENT_TYPES.privacyPolicy);
  if (!isConsentAccepted(input.isAdultGuardian)) missing.push(CONSENT_TYPES.adultGuardian);
  return missing;
}

export async function recordConsent(
  userId: string,
  consentType: ConsentType,
  documentVersion: string,
  audit: ConsentAuditContext = {}
): Promise<void> {
  await getUserConsentRepository().record({
    userId,
    consentType,
    documentVersion,
    ipAddress: audit.ipAddress || null,
    userAgent: audit.userAgent || null,
    context: audit.context || {},
  });
}

export async function recordRegistrationConsents(
  userId: string,
  audit: ConsentAuditContext = {}
): Promise<void> {
  await Promise.all([
    recordConsent(userId, CONSENT_TYPES.termsOfService, CONSENT_DOCUMENT_VERSIONS.termsOfService, audit),
    recordConsent(userId, CONSENT_TYPES.privacyPolicy, CONSENT_DOCUMENT_VERSIONS.privacyPolicy, audit),
    recordConsent(userId, CONSENT_TYPES.adultGuardian, CONSENT_DOCUMENT_VERSIONS.adultGuardian, audit),
  ]);
}

export async function hasCurrentChildDataConsent(userId: string): Promise<boolean> {
  return getUserConsentRepository().hasVersion(
    userId,
    CONSENT_TYPES.childDataProcessing,
    CONSENT_DOCUMENT_VERSIONS.childDataProcessing
  );
}

export async function ensureChildDataConsent(
  userId: string,
  acceptedValue: unknown,
  audit: ConsentAuditContext = {}
): Promise<boolean> {
  if (isConsentAccepted(acceptedValue)) {
    await recordConsent(
      userId,
      CONSENT_TYPES.childDataProcessing,
      CONSENT_DOCUMENT_VERSIONS.childDataProcessing,
      audit
    );
    return true;
  }

  return hasCurrentChildDataConsent(userId);
}

