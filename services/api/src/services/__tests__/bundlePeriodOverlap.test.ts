import assert from 'node:assert';
import { calculateBundleGraphicNovelBonus, subscriptionPeriodsOverlap } from '../bundleService';

function d(iso: string): Date {
  return new Date(iso);
}

void (async function main() {
  assert.strictEqual(
    subscriptionPeriodsOverlap(d('2026-01-01'), d('2026-01-31'), d('2026-01-10'), d('2026-02-10')),
    true,
    'overlapping mid-range'
  );
  assert.strictEqual(
    subscriptionPeriodsOverlap(d('2026-01-01'), d('2026-01-31'), d('2026-02-01'), d('2026-02-28')),
    false,
    'adjacent non-overlap'
  );
  assert.strictEqual(
    subscriptionPeriodsOverlap(d('2026-01-01'), d('2026-02-01'), d('2026-02-01'), d('2026-03-01')),
    false,
    'exact billing boundary does not overlap'
  );
  assert.strictEqual(
    subscriptionPeriodsOverlap(d('2026-02-01'), d('2026-03-01'), d('2026-01-01'), d('2026-02-01')),
    false,
    'previous period ending at current start does not carry over'
  );
  assert.strictEqual(
    subscriptionPeriodsOverlap(d('2026-01-15'), d('2026-01-20'), d('2026-01-01'), d('2026-01-31')),
    true,
    'grant fully inside period'
  );
  assert.strictEqual(
    subscriptionPeriodsOverlap(d('2026-01-01'), d('2026-03-31'), d('2026-02-01'), d('2026-02-28')),
    true,
    'grant envelopes period'
  );
  assert.strictEqual(
    calculateBundleGraphicNovelBonus({
      extraStories: 15,
      storiesPlanLimit: 20,
      graphicNovelsPlanLimit: 5,
    }),
    3,
    'comic bundle bonus follows the current plan sublimit ratio and rounds down'
  );
  assert.strictEqual(
    calculateBundleGraphicNovelBonus({
      extraStories: 30,
      storiesPlanLimit: 30,
      graphicNovelsPlanLimit: 15,
    }),
    15,
    'comic bundle bonus preserves Fairy World half-story sublimit'
  );
  assert.strictEqual(
    calculateBundleGraphicNovelBonus({
      extraStories: 10,
      storiesPlanLimit: 10,
      graphicNovelsPlanLimit: 0,
    }),
    0,
    'plans without comic access do not receive comic bundle bonus'
  );
  console.log('bundlePeriodOverlap tests passed');
})();
