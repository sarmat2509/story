import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Redis from 'ioredis';
import { Pool } from 'pg';

async function main(): Promise<void> {
  if (process.env.RUN_INFRA_INTEGRATION !== '1') {
    console.log('Postgres/Redis integration contract skipped (RUN_INFRA_INTEGRATION is not 1)');
    return;
  }

  const databaseUrl = process.env.TEST_DATABASE_URL;
  const redisUrl = process.env.TEST_REDIS_URL;
  assert.ok(databaseUrl, 'TEST_DATABASE_URL is required for the infrastructure contract');
  assert.ok(redisUrl, 'TEST_REDIS_URL is required for the infrastructure contract');

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  const redisKey = `wondertales:test:infra:${crypto.randomUUID()}`;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE contract_quota_events (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL,
          delta integer NOT NULL,
          idempotency_key text NOT NULL UNIQUE
        ) ON COMMIT DROP
      `);

      const userId = crypto.randomUUID();
      const eventId = crypto.randomUUID();
      await client.query(
        'INSERT INTO contract_quota_events (id, user_id, delta, idempotency_key) VALUES ($1, $2, $3, $4)',
        [eventId, userId, 1, 'story-created-contract']
      );
      const aggregate = await client.query<{ used: number }>(
        'SELECT COALESCE(SUM(delta), 0)::int AS used FROM contract_quota_events WHERE user_id = $1',
        [userId]
      );
      assert.equal(aggregate.rows[0]?.used, 1, 'transactional quota side effect is visible');

      await client.query('SAVEPOINT duplicate_event');
      await assert.rejects(
        client.query(
          'INSERT INTO contract_quota_events (id, user_id, delta, idempotency_key) VALUES ($1, $2, $3, $4)',
          [crypto.randomUUID(), userId, 1, 'story-created-contract']
        ),
        /duplicate key|unique constraint/i,
        'database enforces idempotency keys'
      );
      await client.query('ROLLBACK TO SAVEPOINT duplicate_event');
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    await redis.connect();
    assert.equal(await redis.set(redisKey, JSON.stringify({ status: 'processing' }), 'EX', 30), 'OK');
    assert.deepEqual(JSON.parse((await redis.get(redisKey)) ?? 'null'), { status: 'processing' });
    const ttl = await redis.ttl(redisKey);
    assert.ok(ttl > 0 && ttl <= 30, `Redis TTL should be active, got ${ttl}`);
    assert.equal(await redis.del(redisKey), 1);
    assert.equal(await redis.get(redisKey), null);
  } finally {
    await redis.del(redisKey).catch(() => 0);
    redis.disconnect();
    await pool.end();
  }

  console.log('Postgres and Redis integration contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
