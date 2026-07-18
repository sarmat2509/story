import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer, type Server } from 'node:http';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Test HTTP server did not expose a TCP port'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function stripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

async function main(): Promise<void> {
  process.env.RUN_HTTP_SERVER = 'false';
  process.env.RUN_JOB_WORKERS = 'false';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';
  process.env.STRIPE_SECRET_KEY = 'sk_test_webhook_contract';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_webhook_contract';
  process.env.REVENUECAT_WEBHOOK_AUTHORIZATION = 'Bearer revenuecat-contract';

  const { default: app } = await import('../../index');
  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const stripePayload = JSON.stringify({
      id: 'evt_webhook_contract',
      object: 'event',
      type: 'wondertales.contract.unhandled',
      api_version: '2024-06-20',
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: null,
      data: { object: { id: 'contract-object', object: 'contract' } },
    });
    const stripeOk = await fetch(`${origin}/api/v1/billing/webhook/stripe`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignature(stripePayload, process.env.STRIPE_WEBHOOK_SECRET),
      },
      body: stripePayload,
    });
    assert.equal(stripeOk.status, 200, 'valid Stripe signature reaches production handler');
    assert.deepEqual(await stripeOk.json(), { received: true });

    const stripeRejected = await fetch(`${origin}/api/v1/billing/webhook/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=0,v1=invalid' },
      body: stripePayload,
    });
    assert.equal(stripeRejected.status, 400, 'invalid Stripe signature is rejected');

    const revenueCatPayload = JSON.stringify({
      api_version: '1.0',
      event: {
        id: 'rc_webhook_contract',
        type: 'WONDERTALES_CONTRACT_UNHANDLED',
        app_user_id: 'contract-user',
      },
    });
    const revenueCatOk = await fetch(`${origin}/api/v1/billing/webhook/revenuecat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: process.env.REVENUECAT_WEBHOOK_AUTHORIZATION,
      },
      body: revenueCatPayload,
    });
    assert.equal(revenueCatOk.status, 200, 'authorized RevenueCat event reaches production handler');
    assert.deepEqual(await revenueCatOk.json(), { received: true });

    const revenueCatRejected = await fetch(`${origin}/api/v1/billing/webhook/revenuecat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-token' },
      body: revenueCatPayload,
    });
    assert.equal(revenueCatRejected.status, 400, 'invalid RevenueCat authorization is rejected');
  } finally {
    await close(server);
  }

  console.log('billing webhook HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
