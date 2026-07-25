import assert from 'node:assert/strict';
import { buildPromoActivationTelegramMessage } from '../promoAccountTelegramAlertService';

assert.equal(
  buildPromoActivationTelegramMessage({
    email: 'literate.littles@wondertales.art',
    displayName: '@literate.littles',
    reservedStories: 50,
    expiresAt: new Date('2026-08-08T12:00:00.000Z'),
  }),
  [
    '🎟️ WonderTales · Promo activated',
    'Account: @literate.littles',
    'Login: literate.littles@wondertales.art',
    'Stories available: 50',
    'Access ends: 2026-08-08T12:00:00.000Z',
  ].join('\n')
);

console.log('promoAccountTelegramAlertService tests passed');
