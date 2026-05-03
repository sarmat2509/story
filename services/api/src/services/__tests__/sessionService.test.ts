import assert from 'node:assert/strict';
import {
  getChildSessionActiveAfter,
  isSessionRecordActive,
  parseSessionDurationMs,
} from '../sessionService';

const now = new Date('2026-05-03T10:00:00.000Z');

assert.equal(parseSessionDurationMs('30d'), 30 * 24 * 60 * 60 * 1000);
assert.equal(parseSessionDurationMs('8h'), 8 * 60 * 60 * 1000);
assert.equal(parseSessionDurationMs('2m'), 2 * 60 * 1000);
assert.equal(parseSessionDurationMs('15s'), 15 * 1000);

assert.throws(
  () => parseSessionDurationMs('forever'),
  /Invalid duration format/,
  'session durations must be explicit bounded values'
);

assert.equal(
  getChildSessionActiveAfter(now).toISOString(),
  '2026-05-03T08:00:00.000Z',
  'default child-session idle timeout is two hours'
);

assert.equal(
  isSessionRecordActive(
    {
      mode: 'parent',
      lastActiveAt: new Date('2026-05-01T10:00:00.000Z'),
      expiresAt: new Date('2026-05-04T10:00:00.000Z'),
      revokedAt: null,
    },
    now
  ),
  true,
  'parent sessions are governed by hard expiry/revocation, not child idle policy'
);

assert.equal(
  isSessionRecordActive(
    {
      mode: 'child',
      lastActiveAt: new Date('2026-05-03T08:00:00.000Z'),
      expiresAt: new Date('2026-05-03T18:00:00.000Z'),
      revokedAt: null,
    },
    now
  ),
  false,
  'child sessions expire after the inactivity boundary'
);

assert.equal(
  isSessionRecordActive(
    {
      mode: 'child',
      lastActiveAt: new Date('2026-05-03T08:00:01.000Z'),
      expiresAt: new Date('2026-05-03T18:00:00.000Z'),
      revokedAt: null,
    },
    now
  ),
  true,
  'recent child sessions remain active'
);

assert.equal(
  isSessionRecordActive(
    {
      mode: 'child',
      lastActiveAt: new Date('2026-05-03T09:59:00.000Z'),
      expiresAt: new Date('2026-05-03T09:59:59.000Z'),
      revokedAt: null,
    },
    now
  ),
  false,
  'hard expiry still wins over child idle state'
);

assert.equal(
  isSessionRecordActive(
    {
      mode: 'child',
      lastActiveAt: new Date('2026-05-03T09:59:00.000Z'),
      expiresAt: new Date('2026-05-03T18:00:00.000Z'),
      revokedAt: new Date('2026-05-03T09:59:30.000Z'),
    },
    now
  ),
  false,
  'revoked child sessions are inactive'
);

console.log('sessionService tests passed');
