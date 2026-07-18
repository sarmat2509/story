export const CONDITIONAL_QUOTA_EXTENSIONS_METADATA_KEY = 'conditionalQuotaExtensions';

export type ConditionalQuotaFeatureSlug =
  | 'stories_per_month'
  | 'graphic_novels_per_month';

export interface ConditionalQuotaExtensionConfig {
  extra: number;
  activatesAtUsage: number;
  periodStart: string;
  periodEnd: string;
  reason?: string;
}

type SubscriptionMetadata = Record<string, unknown> | null | undefined;

function finiteNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function validIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function readConditionalQuotaExtension(
  metadata: SubscriptionMetadata,
  featureSlug: ConditionalQuotaFeatureSlug
): ConditionalQuotaExtensionConfig | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const extensions = metadata[CONDITIONAL_QUOTA_EXTENSIONS_METADATA_KEY];
  if (!extensions || typeof extensions !== 'object' || Array.isArray(extensions)) return null;
  const raw = (extensions as Record<string, unknown>)[featureSlug];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  const extra = finiteNonNegativeInteger(source.extra);
  const activatesAtUsage = finiteNonNegativeInteger(source.activatesAtUsage);
  const periodStart = validIsoDate(source.periodStart);
  const periodEnd = validIsoDate(source.periodEnd);
  if (extra === null || activatesAtUsage === null || !periodStart || !periodEnd) return null;
  if (extra === 0 || Date.parse(periodEnd) <= Date.parse(periodStart)) return null;

  return {
    extra,
    activatesAtUsage,
    periodStart,
    periodEnd,
    ...(typeof source.reason === 'string' && source.reason.trim()
      ? { reason: source.reason.trim() }
      : {}),
  };
}

export function getActivatedConditionalQuotaExtension(params: {
  metadata: SubscriptionMetadata;
  featureSlug: ConditionalQuotaFeatureSlug;
  currentUsage: number;
  periodStart: Date;
  periodEnd: Date;
}): number {
  const config = readConditionalQuotaExtension(params.metadata, params.featureSlug);
  if (!config) return 0;
  if (params.periodStart.toISOString() !== config.periodStart) return 0;
  if (params.periodEnd.toISOString() !== config.periodEnd) return 0;
  return params.currentUsage >= config.activatesAtUsage ? config.extra : 0;
}
