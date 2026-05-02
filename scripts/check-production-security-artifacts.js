#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const baseUrl = (process.env.PROD_SECURITY_BASE_URL || 'https://wondertales.art').replace(/\/+$/, '');
const wwwUrl = (process.env.PROD_SECURITY_WWW_URL || 'https://www.wondertales.art').replace(/\/+$/, '');

let outputDir = process.env.PROD_SECURITY_ARTIFACT_DIR || '';
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === '--') {
    continue;
  } else if (arg === '--output-dir') {
    outputDir = process.argv[index + 1] || '';
    index += 1;
  } else if (arg === '-h' || arg === '--help') {
    console.log(`Usage: node scripts/check-production-security-artifacts.js [--output-dir DIR]

Fetches production headers and exact deployed web assets from wondertales.art,
then validates security headers, canonical www redirect behavior, noindex on
SPA/auth routes, and forbidden server-side secret markers in HTML/JS/CSS/JSON.

Environment:
  PROD_SECURITY_BASE_URL       Default: https://wondertales.art
  PROD_SECURITY_WWW_URL        Default: https://www.wondertales.art
  PROD_SECURITY_ARTIFACT_DIR   Optional directory for header/report artifacts
`);
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
}

const requiredCommonHeaders = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'cross-origin-opener-policy',
];

const spaOnlyRequiredHeaders = ['permissions-policy'];

const forbiddenMarkers = [
  ['DATABASE_URL', /DATABASE_URL/i],
  ['POSTGRES_PASSWORD', /POSTGRES_PASSWORD/i],
  ['REDIS_URL', /REDIS_URL/i],
  ['JWT_SECRET', /JWT_SECRET/i],
  ['SESSION_SECRET', /SESSION_SECRET/i],
  ['COOKIE_SECRET', /COOKIE_SECRET/i],
  ['STRIPE_SECRET_KEY', /STRIPE_SECRET_KEY/i],
  ['STRIPE_WEBHOOK_SECRET', /STRIPE_WEBHOOK_SECRET/i],
  ['RESEND_API_KEY', /RESEND_API_KEY/i],
  ['OPENAI_API_KEY', /OPENAI_API_KEY/i],
  ['GEMINI_API_KEY', /GEMINI_API_KEY/i],
  ['ANTHROPIC_API_KEY', /ANTHROPIC_API_KEY/i],
  ['GOOGLE_CLIENT_SECRET', /GOOGLE_CLIENT_SECRET/i],
  ['GOOGLE_APPLICATION_CREDENTIALS', /GOOGLE_APPLICATION_CREDENTIALS/i],
  ['APPLE_CLIENT_SECRET', /APPLE_CLIENT_SECRET/i],
  ['AWS_SECRET_ACCESS_KEY', /AWS_SECRET_ACCESS_KEY/i],
  ['DO_SPACES_SECRET_ACCESS_KEY', /DO_SPACES_SECRET_ACCESS_KEY/i],
  ['S3_SECRET_ACCESS_KEY', /S3_SECRET_ACCESS_KEY/i],
  ['ELEVENLABS_API_KEY', /ELEVENLABS_API_KEY/i],
  ['PRIVATE_KEY_BLOCK', /-----BEGIN PRIVATE KEY-----/i],
  ['STRIPE_SECRET_PREFIX', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+/],
  ['STRIPE_WEBHOOK_PREFIX', /\bwhsec_[A-Za-z0-9_]+/],
];

const headerTargets = [
  { name: 'root-ssr', url: `${baseUrl}/`, kind: 'ssr', expectStatus: 200 },
  { name: 'pricing-ssr', url: `${baseUrl}/pricing`, kind: 'ssr', expectStatus: 200 },
  { name: 'welcome-spa', url: `${baseUrl}/welcome`, kind: 'spa', expectStatus: 200, expectRobots: 'noindex,nofollow' },
  { name: 'auth-forgot-spa', url: `${baseUrl}/auth/forgot-password`, kind: 'spa', expectStatus: 200, expectRobots: 'noindex,nofollow' },
  { name: 'www-redirect', url: `${wwwUrl}/`, kind: 'redirect', expectRedirectPrefix: `${baseUrl}/` },
];

const bodySeedTargets = [
  { name: 'root-ssr', url: `${baseUrl}/` },
  { name: 'pricing-ssr', url: `${baseUrl}/pricing` },
  { name: 'welcome-spa', url: `${baseUrl}/welcome` },
  { name: 'manifest', url: `${baseUrl}/manifest.json` },
  { name: 'sitemap', url: `${baseUrl}/sitemap.xml` },
];

const failures = [];
const scanned = [];
const headerReports = [];

function fail(message) {
  failures.push(message);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function filenameSafe(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'artifact';
}

function getHeader(headers, name) {
  return headers.get(name) || '';
}

function headerBlock(response) {
  const lines = [`HTTP ${response.status} ${response.statusText}`];
  for (const [key, value] of response.headers.entries()) {
    lines.push(`${key}: ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

function extractConnectSrc(csp) {
  const match = csp.match(/(?:^|;)\s*connect-src\s+([^;]+)/i);
  return match ? match[1].trim() : '';
}

function validateCsp(name, csp) {
  if (!csp) {
    fail(`${name}: missing content-security-policy`);
    return;
  }

  const requiredDirectives = [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    'upgrade-insecure-requests',
  ];

  for (const directive of requiredDirectives) {
    if (!csp.includes(directive)) {
      fail(`${name}: CSP missing ${directive}`);
    }
  }

  const connectSrc = extractConnectSrc(csp);
  if (!connectSrc) {
    fail(`${name}: CSP missing connect-src`);
  } else if (/(^|\s)https:(\s|$)/.test(connectSrc)) {
    fail(`${name}: CSP connect-src allows broad https:`);
  }
}

function scanForbiddenMarkers(name, text) {
  const markers = [];
  for (const [markerName, markerPattern] of forbiddenMarkers) {
    if (markerPattern.test(text)) {
      markers.push(markerName);
    }
  }

  if (markers.length > 0) {
    fail(`${name}: forbidden server-side marker(s) found: ${markers.join(', ')}`);
  }
}

async function fetchWithTimeout(url, options = {}) {
  const response = await fetch(url, {
    redirect: options.redirect || 'manual',
    signal: AbortSignal.timeout(options.timeoutMs || 15000),
    headers: {
      'user-agent': 'WonderTales production security artifact check',
      ...(options.headers || {}),
    },
  });
  return response;
}

async function saveArtifact(name, content) {
  if (!outputDir) return;
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, filenameSafe(name)), content, 'utf8');
}

async function checkHeaders() {
  for (const target of headerTargets) {
    const response = await fetchWithTimeout(target.url, { redirect: 'manual' });
    const headersText = headerBlock(response);
    await saveArtifact(`${target.name}.headers.txt`, headersText);

    const report = {
      name: target.name,
      url: target.url,
      status: response.status,
      contentSecurityPolicySha256: sha256(getHeader(response.headers, 'content-security-policy')),
    };
    headerReports.push(report);

    if (target.kind === 'redirect') {
      const location = getHeader(response.headers, 'location');
      if (![301, 302, 307, 308].includes(response.status)) {
        fail(`${target.name}: expected redirect status, got ${response.status}`);
      }
      if (!location.startsWith(target.expectRedirectPrefix)) {
        fail(`${target.name}: expected redirect to ${target.expectRedirectPrefix}, got ${location || '(missing)'}`);
      }
      continue;
    }

    if (response.status !== target.expectStatus) {
      fail(`${target.name}: expected HTTP ${target.expectStatus}, got ${response.status}`);
    }

    for (const header of requiredCommonHeaders) {
      if (!getHeader(response.headers, header)) {
        fail(`${target.name}: missing ${header}`);
      }
    }

    if (target.kind === 'spa') {
      for (const header of spaOnlyRequiredHeaders) {
        if (!getHeader(response.headers, header)) {
          fail(`${target.name}: missing ${header}`);
        }
      }
    }

    validateCsp(target.name, getHeader(response.headers, 'content-security-policy'));

    if (target.expectRobots) {
      const robots = getHeader(response.headers, 'x-robots-tag').toLowerCase().replace(/\s+/g, '');
      if (robots !== target.expectRobots) {
        fail(`${target.name}: expected X-Robots-Tag ${target.expectRobots}, got ${robots || '(missing)'}`);
      }
    }
  }
}

function extractAssetUrls(html) {
  const urls = new Set();
  const attrPattern = /\b(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = attrPattern.exec(html)) !== null) {
    const value = match[1];
    if (
      value.startsWith('/_expo/static/') ||
      value === '/manifest.json' ||
      value === '/favicon.png' ||
      value === '/favicon.ico'
    ) {
      urls.add(new URL(value, baseUrl).toString());
    }
  }
  return urls;
}

async function scanProductionBodies() {
  const assetUrls = new Set();

  for (const target of bodySeedTargets) {
    const response = await fetchWithTimeout(target.url, { redirect: 'follow' });
    const text = await response.text();
    if (response.status !== 200) {
      fail(`${target.name}: expected HTTP 200 while scanning body, got ${response.status}`);
      continue;
    }

    scanForbiddenMarkers(target.name, text);
    scanned.push({
      name: target.name,
      url: target.url,
      bytes: Buffer.byteLength(text),
      sha256: sha256(text),
    });

    if ((response.headers.get('content-type') || '').includes('text/html')) {
      for (const assetUrl of extractAssetUrls(text)) {
        assetUrls.add(assetUrl);
      }
    }
  }

  for (const assetUrl of [...assetUrls].sort()) {
    const response = await fetchWithTimeout(assetUrl, { redirect: 'follow' });
    if (response.status !== 200) {
      fail(`asset ${assetUrl}: expected HTTP 200, got ${response.status}`);
      continue;
    }

    const text = await response.text();
    scanForbiddenMarkers(`asset ${assetUrl}`, text);
    scanned.push({
      name: `asset:${new URL(assetUrl).pathname}`,
      url: assetUrl,
      bytes: Buffer.byteLength(text),
      sha256: sha256(text),
    });
  }
}

async function writeReport() {
  const report = {
    checkedAt: new Date().toISOString(),
    baseUrl,
    wwwUrl,
    headerReports,
    scanned,
    failures,
  };
  await saveArtifact('production-security-artifact-report.json', `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  await checkHeaders();
  await scanProductionBodies();
  await writeReport();

  if (failures.length > 0) {
    console.error('Production security artifact check failed.');
    for (const failure of failures) {
      console.error(`FAIL ${failure}`);
    }
    process.exit(1);
  }

  console.log('Production security artifact check passed.');
  console.log(`Header targets checked: ${headerReports.length}`);
  console.log(`Production HTML/assets scanned: ${scanned.length}`);
  if (outputDir) {
    console.log(`Artifacts written to: ${outputDir}`);
  }
}

main().catch((error) => {
  console.error(`Production security artifact check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
