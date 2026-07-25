import assert from 'node:assert/strict';
import {
  getPromoAccessPeriod,
  getPromoStoryQuotaReservation,
  isPromoAccountExpired,
} from '../promoAccountService';

const expiresAt = new Date('2026-08-08T12:00:00.000Z');

assert.equal(
  isPromoAccountExpired(
    { accountType: 'promo', promoExpiresAt: expiresAt } as any,
    new Date('2026-08-08T11:59:59.999Z')
  ),
  false
);

assert.deepEqual(getPromoAccessPeriod(expiresAt), {
  startedAt: expiresAt,
  expiresAt: new Date('2026-08-22T12:00:00.000Z'),
});

assert.equal(getPromoStoryQuotaReservation(100), 50);
assert.equal(getPromoStoryQuotaReservation(15), 8);
assert.throws(() => getPromoStoryQuotaReservation(-1));

assert.equal(
  isPromoAccountExpired(
    { accountType: 'promo', promoExpiresAt: expiresAt } as any,
    expiresAt
  ),
  true
);

assert.equal(
  isPromoAccountExpired(
    { accountType: 'standard', promoExpiresAt: expiresAt } as any,
    new Date('2026-08-09T00:00:00.000Z')
  ),
  false
);

console.log('promoAccountService tests passed');
