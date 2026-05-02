import assert from 'node:assert/strict';
import { verifyTurnstileToken, isCaptchaRequired } from '../captchaService';

async function run() {
  assert.equal(isCaptchaRequired('login'), false, 'captcha should be disabled by default in tests');

  const successFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method, 'POST');
    assert.ok(String(init?.body).includes('response=valid-token'));
    return new Response(JSON.stringify({ success: true, action: 'login' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  assert.equal(
    await verifyTurnstileToken({
      action: 'login',
      token: 'valid-token',
      secretKey: 'secret',
      fetchImpl: successFetch as typeof fetch,
    }),
    true,
    'successful Turnstile verification should pass'
  );

  const actionMismatchFetch = async () =>
    new Response(JSON.stringify({ success: true, action: 'register' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  assert.equal(
    await verifyTurnstileToken({
      action: 'login',
      token: 'valid-token',
      secretKey: 'secret',
      fetchImpl: actionMismatchFetch as typeof fetch,
    }),
    false,
    'Turnstile action mismatch should fail closed'
  );

  const failureFetch = async () =>
    new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  assert.equal(
    await verifyTurnstileToken({
      action: 'feedback',
      token: 'bad-token',
      secretKey: 'secret',
      fetchImpl: failureFetch as typeof fetch,
    }),
    false,
    'Turnstile challenge failure should fail closed'
  );

  const endpointFailureFetch = async () =>
    new Response('unavailable', {
      status: 503,
    });

  assert.equal(
    await verifyTurnstileToken({
      action: 'password_reset',
      token: 'token',
      secretKey: 'secret',
      fetchImpl: endpointFailureFetch as typeof fetch,
    }),
    false,
    'Turnstile endpoint failures should fail closed'
  );
}

run()
  .then(() => {
    console.log('captchaService tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
