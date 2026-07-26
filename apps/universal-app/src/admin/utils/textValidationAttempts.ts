import type { AdminTextValidationAttempt } from '@/admin/api/admin';

export type AdminTextValidationAttemptGroup = {
  attempt: number;
  durationMs: number;
  failedSceneIds: number[];
  isBatch: boolean;
  phase: string;
  rawManifest: Record<string, unknown> | null;
  sceneIds: number[];
  score: number;
  attempts: AdminTextValidationAttempt[];
};

function batchSceneIds(attempt: AdminTextValidationAttempt): number[] {
  const context = attempt.rawManifest?.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return [];
  const sceneIds = (context as Record<string, unknown>).sceneIds;
  if (!Array.isArray(sceneIds)) return [];

  return sceneIds.filter((sceneId): sceneId is number => Number.isInteger(sceneId));
}

/**
 * A full-story validation is one provider call, but its stored summary contains
 * a result entry for every scene. Keep those entries together in the admin UI;
 * per-scene fallback validations intentionally remain separate.
 */
export function groupTextValidationAttempts(
  attempts: AdminTextValidationAttempt[]
): AdminTextValidationAttemptGroup[] {
  const groups = new Map<string, AdminTextValidationAttemptGroup>();

  attempts.forEach((attempt, index) => {
    const expectedSceneIds = batchSceneIds(attempt);
    const isBatch = expectedSceneIds.length > 1;
    const key = isBatch
      ? `batch:${attempt.phase}:${attempt.attempt}:${expectedSceneIds.join(',')}`
      : `scene:${attempt.phase}:${attempt.attempt}:${attempt.sceneId}:${index}`;
    const existing = groups.get(key);

    if (existing) {
      existing.attempts.push(attempt);
      existing.sceneIds = Array.from(new Set([...existing.sceneIds, attempt.sceneId])).sort(
        (left, right) => left - right
      );
      if (!attempt.isValid) existing.failedSceneIds.push(attempt.sceneId);
      existing.durationMs = Math.max(existing.durationMs, attempt.durationMs);
      existing.score = Math.round(
        existing.attempts.reduce((sum, item) => sum + item.score, 0) / existing.attempts.length
      );
      return;
    }

    groups.set(key, {
      attempt: attempt.attempt,
      attempts: [attempt],
      durationMs: attempt.durationMs,
      failedSceneIds: attempt.isValid ? [] : [attempt.sceneId],
      isBatch,
      phase: attempt.phase,
      rawManifest: attempt.rawManifest,
      sceneIds: isBatch ? expectedSceneIds : [attempt.sceneId],
      score: attempt.score,
    });
  });

  return Array.from(groups.values());
}
