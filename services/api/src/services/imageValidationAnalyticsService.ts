import type { ImageValidationResultRow } from '../db/schema';
import { getImageValidationRepository } from '../repositories';

export type ImageValidationAnalyticsRow = Pick<
  ImageValidationResultRow,
  | 'storyId'
  | 'sceneIndex'
  | 'subjectType'
  | 'pageNumber'
  | 'panelIndex'
  | 'panelId'
  | 'attempt'
  | 'requestManifest'
  | 'result'
  | 'createdAt'
>;

export type ImageValidationCharacterRegenerationAnalytics = {
  totals: {
    validationRows: number;
    imageTargets: number;
    excludedImageTargets: number;
    totalGenerations: number;
    totalRegenerations: number;
    retriedImageTargets: number;
    retryRate: number;
    pearsonCorrelation: number | null;
  };
  buckets: Array<{
    characterCount: number;
    imageTargets: number;
    totalGenerations: number;
    totalRegenerations: number;
    averageRegenerations: number;
    retryRate: number;
  }>;
  distribution: Array<{
    characterCount: number;
    regenerations: number;
    imageTargets: number;
  }>;
};

type ImageTarget = {
  attempts: Set<number>;
  characterCount: number | null;
  characterCountCreatedAt: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function normalizedIdentityPart(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLocaleLowerCase('en-US');
  return normalized.length > 0 ? normalized : null;
}

function uniqueCharacterCount(value: unknown): number | null {
  if (!Array.isArray(value)) return null;

  const identities = new Set<string>();
  value.forEach((candidate, index) => {
    const character = asRecord(candidate);
    const stableIdentity =
      normalizedIdentityPart(character?.characterRef) ??
      normalizedIdentityPart(character?.characterId) ??
      normalizedIdentityPart(character?.id);
    const name =
      normalizedIdentityPart(character?.name) ??
      normalizedIdentityPart(character?.displayName) ??
      normalizedIdentityPart(character?.englishName);

    if (stableIdentity) {
      identities.add(`id:${stableIdentity}`);
    } else if (name) {
      identities.add(`name:${name}`);
    } else {
      // Old validation payloads did not always retain identity metadata.
      identities.add(`anonymous:${index}`);
    }
  });

  return identities.size;
}

function manifestExpectedCharacterCount(manifest: Record<string, unknown> | null): number | null {
  if (!manifest) return null;

  if (Array.isArray(manifest.expectedCharacters) && manifest.expectedCharacters.length > 0) {
    return uniqueCharacterCount(manifest.expectedCharacters);
  }

  if (Array.isArray(manifest.panels)) {
    const panelCharacters = manifest.panels.flatMap((panel) => {
      const panelRecord = asRecord(panel);
      return Array.isArray(panelRecord?.expectedCharacters) ? panelRecord.expectedCharacters : [];
    });
    if (panelCharacters.length > 0) {
      return uniqueCharacterCount(panelCharacters);
    }
  }

  return null;
}

function expectedCharacterCount(row: ImageValidationAnalyticsRow): number | null {
  const manifest = asRecord(row.requestManifest);
  const manifestCount = manifestExpectedCharacterCount(manifest);
  if (manifestCount != null) return manifestCount;

  const result = asRecord(row.result);
  if (Array.isArray(result?.characters) && result.characters.length > 0) {
    return uniqueCharacterCount(result.characters);
  }

  // expectedCharacterCount can represent repeated appearances across comic panels, so only trust
  // this scalar when neither the expected roster nor the validation character list was retained.
  return finiteNonNegativeInteger(result?.expectedCharacterCount);
}

function imageTargetKey(row: ImageValidationAnalyticsRow): string {
  return [
    row.storyId,
    row.subjectType,
    row.sceneIndex,
    row.pageNumber ?? '',
    row.panelIndex ?? '',
    row.panelId ?? '',
  ].join('|');
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pearsonCorrelation(samples: Array<{ x: number; y: number }>): number | null {
  if (samples.length < 2) return null;
  const meanX = samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length;
  const meanY = samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length;
  let numerator = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const sample of samples) {
    const dx = sample.x - meanX;
    const dy = sample.y - meanY;
    numerator += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  const denominator = Math.sqrt(varianceX * varianceY);
  return denominator > 0 ? round(numerator / denominator) : null;
}

export function buildImageValidationCharacterRegenerationAnalytics(
  rows: ImageValidationAnalyticsRow[]
): ImageValidationCharacterRegenerationAnalytics {
  const targets = new Map<string, ImageTarget>();

  for (const row of rows) {
    const key = imageTargetKey(row);
    const target = targets.get(key) ?? {
      attempts: new Set<number>(),
      characterCount: null,
      characterCountCreatedAt: Number.NEGATIVE_INFINITY,
    };
    target.attempts.add(row.attempt);

    const count = expectedCharacterCount(row);
    const createdAt = row.createdAt.getTime();
    if (count != null && createdAt >= target.characterCountCreatedAt) {
      target.characterCount = count;
      target.characterCountCreatedAt = createdAt;
    }
    targets.set(key, target);
  }

  const samples = Array.from(targets.values())
    .filter(
      (target): target is ImageTarget & { characterCount: number } => target.characterCount != null
    )
    .map((target) => {
      const totalGenerations = target.attempts.size;
      return {
        characterCount: target.characterCount,
        totalGenerations,
        regenerations: Math.max(0, totalGenerations - 1),
      };
    });

  const bucketsByCharacterCount = new Map<
    number,
    {
      characterCount: number;
      imageTargets: number;
      totalGenerations: number;
      totalRegenerations: number;
      retriedImageTargets: number;
    }
  >();
  const distributionMap = new Map<
    string,
    { characterCount: number; regenerations: number; imageTargets: number }
  >();

  for (const sample of samples) {
    const bucket = bucketsByCharacterCount.get(sample.characterCount) ?? {
      characterCount: sample.characterCount,
      imageTargets: 0,
      totalGenerations: 0,
      totalRegenerations: 0,
      retriedImageTargets: 0,
    };
    bucket.imageTargets += 1;
    bucket.totalGenerations += sample.totalGenerations;
    bucket.totalRegenerations += sample.regenerations;
    if (sample.regenerations > 0) bucket.retriedImageTargets += 1;
    bucketsByCharacterCount.set(sample.characterCount, bucket);

    const distributionKey = `${sample.characterCount}|${sample.regenerations}`;
    const distribution = distributionMap.get(distributionKey) ?? {
      characterCount: sample.characterCount,
      regenerations: sample.regenerations,
      imageTargets: 0,
    };
    distribution.imageTargets += 1;
    distributionMap.set(distributionKey, distribution);
  }

  const totalGenerations = samples.reduce((sum, sample) => sum + sample.totalGenerations, 0);
  const totalRegenerations = samples.reduce((sum, sample) => sum + sample.regenerations, 0);
  const retriedImageTargets = samples.filter((sample) => sample.regenerations > 0).length;

  return {
    totals: {
      validationRows: rows.length,
      imageTargets: samples.length,
      excludedImageTargets: targets.size - samples.length,
      totalGenerations,
      totalRegenerations,
      retriedImageTargets,
      retryRate: samples.length > 0 ? round(retriedImageTargets / samples.length) : 0,
      pearsonCorrelation: pearsonCorrelation(
        samples.map((sample) => ({
          x: sample.characterCount,
          y: sample.regenerations,
        }))
      ),
    },
    buckets: Array.from(bucketsByCharacterCount.values())
      .sort((left, right) => left.characterCount - right.characterCount)
      .map((bucket) => ({
        characterCount: bucket.characterCount,
        imageTargets: bucket.imageTargets,
        totalGenerations: bucket.totalGenerations,
        totalRegenerations: bucket.totalRegenerations,
        averageRegenerations:
          bucket.imageTargets > 0 ? round(bucket.totalRegenerations / bucket.imageTargets) : 0,
        retryRate:
          bucket.imageTargets > 0 ? round(bucket.retriedImageTargets / bucket.imageTargets) : 0,
      })),
    distribution: Array.from(distributionMap.values()).sort(
      (left, right) =>
        left.characterCount - right.characterCount || left.regenerations - right.regenerations
    ),
  };
}

export async function getImageValidationCharacterRegenerationAnalytics() {
  const rows = await getImageValidationRepository().listForCharacterRegenerationAnalytics();
  return buildImageValidationCharacterRegenerationAnalytics(rows);
}
