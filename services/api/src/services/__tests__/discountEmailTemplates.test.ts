import assert from 'node:assert/strict';
import { buildBillingRenewalReminderEmail, buildDiscountCodeAssignedEmail } from '../emailService';

const assignedRu = buildDiscountCodeAssignedEmail({
  email: 'blogger@example.com',
  displayName: 'Анна',
  preferredLocale: 'ru',
  code: 'WT-7K9M-X4QP',
  kind: 'subscription',
  percentOff: 20,
  durationMonths: 3,
  planName: 'Golden Stars',
  bundleName: null,
});

assert.equal(assignedRu.subject, 'Вам назначен скидочный код WonderTales');
assert.match(assignedRu.html, /WT-7K9M-X4QP/);
assert.match(assignedRu.html, /20%/);
assert.match(assignedRu.text, /Ежемесячных платёжных периодов: 3/);
assert.match(assignedRu.text, /План: Golden Stars/);

const reminderEs = buildBillingRenewalReminderEmail({
  email: 'parent@example.com',
  displayName: 'María',
  preferredLocale: 'es',
  planName: 'Silver Dreams',
  chargeAt: new Date('2026-08-10T10:00:00.000Z'),
  amountMinor: 899,
  pricingCurrency: 'EUR',
  discountEnding: true,
  discountEndsAt: new Date('2026-08-10T10:00:00.000Z'),
  regularAmountMinor: 1299,
});

assert.equal(reminderEs.subject, 'Tu suscripción a WonderTales se renueva en 2 días');
assert.match(reminderEs.html, /Silver Dreams/);
assert.match(reminderEs.text, /8,99\s*€/);
assert.match(reminderEs.text, /12,99\s*€/);
assert.match(reminderEs.text, /Tu descuento termina/);

console.log('discount email template tests passed');
