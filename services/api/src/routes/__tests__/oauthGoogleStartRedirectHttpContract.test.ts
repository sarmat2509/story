import assert from 'node:assert/strict';
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

async function main(): Promise<void> {
  process.env.RUN_HTTP_SERVER = 'false';
  process.env.RUN_JOB_WORKERS = 'false';
  process.env.WT_SKIP_PROCESS_SIGNAL_HANDLERS = '1';
  process.env.NODE_ENV = 'test';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
  process.env.GOOGLE_CALLBACK_URL = 'http://127.0.0.1:3000/api/v1/auth/google/callback';
  delete process.env.CAPTCHA_REQUIRED_ACTIONS;

  const { default: app } = await import('../../index');

  const server = createServer(app);
  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${origin}/api/v1/auth/google/start`, { redirect: 'manual' });
    assert.equal(response.status, 302, 'configured Google start redirects');
    const location = response.headers.get('location') || '';
    assert.ok(
      location.includes('accounts.google.com'),
      `redirect should target Google accounts, got: ${location}`
    );
    assert.ok(location.includes('client_id='), 'redirect should include client_id');
  } finally {
    await close(server);
  }

  console.log('Google OAuth start redirect HTTP contract passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
