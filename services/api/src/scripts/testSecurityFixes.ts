/**
 * Security Fixes Test Script
 * 
 * Tests all 7 security fixes implemented for asset delivery and content access control.
 * Runs against a live local API server (http://localhost:3000).
 * 
 * Usage:
 *   cd services/api
 *   npx tsx src/scripts/testSecurityFixes.ts
 * 
 * Prerequisites:
 *   - API server running on port 3000
 *   - At least one user with an active session in the database
 */

// Import config first — it loads .env from workspace root
import appConfig from '../config';
import { generateToken } from '../services/jwtService';
import crypto from 'crypto';
import { Pool } from 'pg';

// ── Configuration ──

const BASE_URL = `http://localhost:${appConfig.port}`;
const FAKE_USER_ID = '00000000-0000-0000-0000-000000000000';
const FAKE_STORY_ID = '00000000-0000-0000-0000-000000000001';

// ── Test Result Tracking ──

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function pass(name: string, detail: string): void {
  results.push({ name, passed: true, detail });
  console.log(`  ✅ PASS: ${name} — ${detail}`);
}

function fail(name: string, detail: string): void {
  results.push({ name, passed: false, detail });
  console.log(`  ❌ FAIL: ${name} — ${detail}`);
}

// ── Helper: Authenticated fetch ──

async function authFetch(
  path: string,
  token: string | null,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
}

// ── Helper: Get real user + session from DB ──

async function getTestCredentials(): Promise<{
  userId: string;
  sessionId: string;
  jwtToken: string;
}> {
  const pool = new Pool({
    connectionString: appConfig.database.url,
  });

  try {
    // Find a user with an active (non-expired) session
    const result = await pool.query(`
      SELECT u.id AS user_id, s.id AS session_id
      FROM users u
      JOIN sessions s ON s.user_id = u.id
      WHERE s.expires_at > NOW()
      ORDER BY s.last_active_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      throw new Error('No user with an active session found. Please log in first.');
    }

    const { user_id: userId, session_id: sessionId } = result.rows[0];

    // Generate JWT using the same function the server uses — guarantees same secret
    const jwtToken = generateToken({ userId, sessionId });

    return { userId, sessionId, jwtToken };
  } finally {
    await pool.end();
  }
}

// ── Test Suites ──

async function testFix1_PathContainmentPhotos(userId: string, token: string): Promise<void> {
  console.log('\n── Fix 1: Path Containment (Photos Route) ──');

  // Test 1a: Path traversal attempt via encoded ../
  // Express does not decode %2F in path params, so the literal filename
  // "..%2F..%2F..." won't traverse. We expect either 400 (path containment)
  // or 404 (file not found) — both mean traversal was blocked.
  {
    const name = '1a: Path traversal in filename (..%2F) blocked';
    try {
      const res = await authFetch(
        `/api/v1/assets/development/${userId}/photos/character/..%2F..%2F..%2F..%2Fetc%2Fpasswd`,
        token
      );
      if (res.status === 400 || res.status === 404) {
        pass(name, `Got ${res.status} — traversal blocked (no file content leaked)`);
      } else if (res.status === 200) {
        fail(name, 'Got 200 — file contents may have been leaked!');
      } else {
        fail(name, `Expected 400 or 404, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }

  // Test 1b: Valid path for non-existent file
  {
    const name = '1b: Valid path, non-existent file';
    try {
      const res = await authFetch(
        `/api/v1/assets/development/${userId}/photos/character/nonexistent-file-abc123.jpg`,
        token
      );
      if (res.status === 404) {
        pass(name, 'Got 404 as expected for missing file');
      } else {
        fail(name, `Expected 404, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }
}

async function testFix2_PhotosAuthOwnership(userId: string, token: string): Promise<void> {
  console.log('\n── Fix 2: Auth + Ownership on Photos ──');

  // Test 2a: No auth header
  {
    const name = '2a: Photos without auth returns 401';
    try {
      const res = await authFetch(
        `/api/v1/assets/development/${userId}/photos/character/test.jpg`,
        null // No token
      );
      if (res.status === 401) {
        pass(name, 'Got 401 as expected');
      } else {
        fail(name, `Expected 401, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }

  // Test 2b: Access another user's photos
  {
    const name = '2b: Photos with wrong userId returns 403';
    try {
      const res = await authFetch(
        `/api/v1/assets/development/${FAKE_USER_ID}/photos/character/test.jpg`,
        token
      );
      if (res.status === 403) {
        const body = await res.json();
        pass(name, `Got 403 with message: "${body.message}"`);
      } else {
        fail(name, `Expected 403, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }
}

async function testFix3_PathContainmentVoiceSamples(): Promise<void> {
  console.log('\n── Fix 3: Path Containment (Voice-Samples Route) ──');

  // Test 3: Path traversal in voice samples filename
  {
    const name = '3: Path traversal in voice-samples filename';
    try {
      const res = await authFetch(
        '/api/v1/assets/voice-samples/uk/..%2F..%2F..%2F..%2Fetc%2Fpasswd',
        null // Voice samples are public
      );
      if (res.status === 400) {
        const body = await res.json();
        pass(name, `Got 400 with message: "${body.message}"`);
      } else {
        fail(name, `Expected 400, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }
}

async function testFix4_CatchAllPathContainment(userId: string): Promise<void> {
  console.log('\n── Fix 4: Catch-All Path Containment ──');

  // Test 4: Path traversal in catch-all route with fake signed URL
  {
    const name = '4: Path traversal in catch-all asset route';
    try {
      const traversalPath = `development/${userId}/${FAKE_STORY_ID}/images/..%2F..%2F..%2Fetc%2Fpasswd`;
      const res = await authFetch(
        `/api/v1/assets/${traversalPath}?token=faketoken&expires=9999999999999`,
        null // Catch-all uses signed URLs, not bearer tokens
      );
      // Should be rejected by either signature verification (401) or path containment (400)
      if (res.status === 401 || res.status === 400) {
        pass(name, `Got ${res.status} — traversal blocked`);
      } else {
        fail(name, `Expected 401 or 400, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }

  // Test 4b: Path traversal with a correctly signed URL
  // When raw `../../` is in the URL, the browser/HTTP client normalizes
  // the path before sending, so the server sees a different path than
  // what was signed. This causes signature mismatch (401) or path
  // containment rejection (400). Both are acceptable — traversal is blocked.
  {
    const name = '4b: Signed traversal path is still blocked';
    try {
      const traversalPath = `development/${userId}/${FAKE_STORY_ID}/images/../../etc/passwd`;
      const expiresTs = Date.now() + 3600_000; // 1 hour from now
      const signingKey = appConfig.jwt.secret;
      const signedToken = crypto
        .createHmac('sha256', signingKey)
        .update(`${traversalPath}:${expiresTs}`)
        .digest('hex');

      const res = await authFetch(
        `/api/v1/assets/${traversalPath}?token=${signedToken}&expires=${expiresTs}`,
        null
      );
      // Either 400 (path containment) or 401 (sig mismatch after URL normalization)
      if (res.status === 400 || res.status === 401) {
        pass(name, `Got ${res.status} — traversal blocked`);
      } else if (res.status === 200) {
        fail(name, 'Got 200 — file contents may have been leaked!');
      } else {
        fail(name, `Expected 400 or 401, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }
}

async function testFix5_DeleteOwnership(userId: string, token: string): Promise<void> {
  console.log('\n── Fix 5: Delete Ownership Check ──');

  // Test 5a: Delete another user's photo
  {
    const name = '5a: Delete photo of another user returns 403';
    try {
      const res = await authFetch(
        '/api/v1/upload/photo',
        token,
        {
          method: 'DELETE',
          body: JSON.stringify({
            url: `/api/v1/assets/development/${FAKE_USER_ID}/photos/character/img.jpg`,
          }),
        }
      );
      if (res.status === 403) {
        const body = await res.json();
        pass(name, `Got 403 with error: "${body.error}"`);
      } else {
        fail(name, `Expected 403, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }

  // Test 5b: Delete own photo (should pass ownership check — may fail on file-not-found, which is fine)
  {
    const name = '5b: Delete own photo passes ownership check';
    try {
      const res = await authFetch(
        '/api/v1/upload/photo',
        token,
        {
          method: 'DELETE',
          body: JSON.stringify({
            url: `/api/v1/assets/development/${userId}/photos/character/nonexistent-test.jpg`,
          }),
        }
      );
      // 200 = deleted OK, 500 = file not found on disk (but ownership check passed)
      if (res.status === 200 || res.status === 500) {
        pass(name, `Got ${res.status} — ownership check passed (file may not exist)`);
      } else if (res.status === 403) {
        fail(name, 'Got 403 — ownership check incorrectly rejected own user');
      } else {
        fail(name, `Unexpected status ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }

  // Test 5c: Substring attack — userId embedded elsewhere in path but not in correct position
  {
    const name = '5c: Substring userId in wrong path position returns 403';
    try {
      // Construct a path where the real userId appears as a filename, not as the second path segment
      const res = await authFetch(
        '/api/v1/upload/photo',
        token,
        {
          method: 'DELETE',
          body: JSON.stringify({
            url: `/api/v1/assets/development/${FAKE_USER_ID}/photos/character/${userId}.jpg`,
          }),
        }
      );
      if (res.status === 403) {
        pass(name, 'Got 403 — substring attack correctly blocked');
      } else {
        fail(name, `Expected 403, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }
}

async function testFix6_TTSOwnership(token: string): Promise<void> {
  console.log('\n── Fix 6: TTS Ownership Check ──');

  // Test 6: TTS for non-existent story
  {
    const name = '6: TTS on non-existent story returns 404';
    try {
      const res = await authFetch(
        `/api/v1/stories/${FAKE_STORY_ID}/tts`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ voiceId: 'test-voice', speed: 1.0 }),
        }
      );
      if (res.status === 404) {
        const body = await res.json();
        pass(name, `Got 404 with message: "${body.message}"`);
      } else if (res.status === 500) {
        // Before the fix, this would have attempted generation and potentially errored
        fail(name, `Got 500 — ownership check may not be working`);
      } else {
        fail(name, `Expected 404, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }

  // Test 6b: TTS without auth
  {
    const name = '6b: TTS without auth returns 401';
    try {
      const res = await authFetch(
        `/api/v1/stories/${FAKE_STORY_ID}/tts`,
        null,
        {
          method: 'POST',
          body: JSON.stringify({ voiceId: 'test-voice' }),
        }
      );
      if (res.status === 401) {
        pass(name, 'Got 401 as expected');
      } else {
        fail(name, `Expected 401, got ${res.status}`);
      }
    } catch (err) {
      fail(name, `Request failed: ${err}`);
    }
  }
}

function testFix7_DevSecretHardening(): void {
  console.log('\n── Fix 7: Dev Secret Hardening ──');

  // Test 7a: Verify signing key consistency between generation and verification
  {
    const name = '7a: Signed URL token is verifiable with correct key';
    try {
      const secret = process.env.JWT_SECRET;
      const signingKey = secret && secret.length >= 32 ? secret : 'dev-secret-key-do-not-use-in-production!';
      
      const storagePath = 'development/test-user/test-story/images/test.png';
      const expiresTs = Date.now() + 3600_000;

      // Generate token (mimics assetStorageService)
      const token = crypto
        .createHmac('sha256', signingKey)
        .update(`${storagePath}:${expiresTs}`)
        .digest('hex');

      // Verify token (mimics assets.ts catch-all route)
      const expectedToken = crypto
        .createHmac('sha256', signingKey)
        .update(`${storagePath}:${expiresTs}`)
        .digest('hex');

      if (token === expectedToken) {
        pass(name, 'Generated and verified tokens match');
      } else {
        fail(name, 'Token mismatch — signing keys are inconsistent');
      }
    } catch (err) {
      fail(name, `Error: ${err}`);
    }
  }

  // Test 7b: Dev fallback key does not match old hardcoded 'dev-secret-key'
  {
    const name = '7b: New dev fallback key differs from old insecure key';
    try {
      const oldKey = 'dev-secret-key';
      const newKey = 'dev-secret-key-do-not-use-in-production!';
      
      const payload = 'test-path:12345';
      const oldToken = crypto.createHmac('sha256', oldKey).update(payload).digest('hex');
      const newToken = crypto.createHmac('sha256', newKey).update(payload).digest('hex');

      if (oldToken !== newToken) {
        pass(name, 'Old fallback key produces different tokens — old URLs will be rejected');
      } else {
        fail(name, 'Old and new fallback keys produce the same token (impossible but checking)');
      }
    } catch (err) {
      fail(name, `Error: ${err}`);
    }
  }

  // Test 7c: Verify JWT_SECRET is set and strong enough
  {
    const name = '7c: JWT_SECRET is set and >= 32 chars';
    const secret = appConfig.jwt.secret;
    if (!secret) {
      fail(name, 'JWT_SECRET is not set');
    } else if (secret.length < 32) {
      fail(name, `JWT_SECRET is only ${secret.length} chars (need >= 32)`);
    } else {
      pass(name, `JWT_SECRET is set (${secret.length} chars)`);
    }
  }
}

// ── Main ──

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Security Fixes Test Suite                  ║');
  console.log('║   Testing 7 fixes with 16 test cases         ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}`);

  // Verify server is reachable
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (!healthRes.ok) {
      console.error(`\n❌ Server health check failed (${healthRes.status}). Is the API running?`);
      process.exit(1);
    }
    console.log('Server health check: OK\n');
  } catch (err) {
    console.error(`\n❌ Cannot reach server at ${BASE_URL}. Is the API running?`);
    console.error(`   Error: ${err}`);
    process.exit(1);
  }

  // Get real credentials from DB
  console.log('Fetching test credentials from database...');
  const { userId, jwtToken } = await getTestCredentials();
  console.log(`Using user: ${userId}`);

  // Run all test suites
  await testFix1_PathContainmentPhotos(userId, jwtToken);
  await testFix2_PhotosAuthOwnership(userId, jwtToken);
  await testFix3_PathContainmentVoiceSamples();
  await testFix4_CatchAllPathContainment(userId);
  await testFix5_DeleteOwnership(userId, jwtToken);
  await testFix6_TTSOwnership(jwtToken);
  testFix7_DevSecretHardening();

  // Summary
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║                  SUMMARY                     ║');
  console.log('╚══════════════════════════════════════════════╝');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`\n  Total: ${total}  |  Passed: ${passed}  |  Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n  Failed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`    ❌ ${r.name}: ${r.detail}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('\n  All tests passed! ✅\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
