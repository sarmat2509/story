import assert from 'node:assert';
import { subscriptionPeriodsOverlap } from '../bundleService';

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
  console.log('bundlePeriodOverlap tests passed');
})();
