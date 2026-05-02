#!/usr/bin/env bash

# Broad, non-destructive production smoke check for public SSR/API, authenticated API,
# admin read-only endpoints, and Stripe test-mode checkout creation.
#
# Usage:
#   ./scripts/check-production-smoke.sh
#   PROD_SMOKE_EMAIL=qa.free_user@wondertales.test PROD_SMOKE_PASSWORD=... ./scripts/check-production-smoke.sh
#   PROD_SMOKE_CHECKOUT=1 PROD_SMOKE_EMAIL=... PROD_SMOKE_PASSWORD=... ./scripts/check-production-smoke.sh

set -euo pipefail

export BASE_URL="${BASE_URL:-https://wondertales.art}"
export PROD_SMOKE_EMAIL="${PROD_SMOKE_EMAIL:-}"
export PROD_SMOKE_PASSWORD="${PROD_SMOKE_PASSWORD:-}"
export PROD_ADMIN_SMOKE_EMAIL="${PROD_ADMIN_SMOKE_EMAIL:-}"
export PROD_ADMIN_SMOKE_PASSWORD="${PROD_ADMIN_SMOKE_PASSWORD:-}"
export PROD_SMOKE_CHECKOUT="${PROD_SMOKE_CHECKOUT:-0}"
export PROD_SMOKE_CHECKOUT_URL_FILE="${PROD_SMOKE_CHECKOUT_URL_FILE:-/tmp/wondertales-production-checkout-urls.json}"
DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
CHECK_PROD_REMOTE="${CHECK_PROD_REMOTE:-1}"

node <<'NODE'
const fs = require('node:fs');

const baseUrl = process.env.BASE_URL.replace(/\/$/, '');
const smokeEmail = process.env.PROD_SMOKE_EMAIL;
const smokePassword = process.env.PROD_SMOKE_PASSWORD;
const adminEmail = process.env.PROD_ADMIN_SMOKE_EMAIL;
const adminPassword = process.env.PROD_ADMIN_SMOKE_PASSWORD;
const createCheckout = process.env.PROD_SMOKE_CHECKOUT === '1';
const checkoutUrlFile = process.env.PROD_SMOKE_CHECKOUT_URL_FILE;

let failures = 0;
let warnings = 0;
const checkoutUrls = [];

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  warnings += 1;
  console.log(`WARN ${message}`);
}

function fail(message) {
  failures += 1;
  console.log(`FAIL ${message}`);
}

function preview(text) {
  return text.replace(/\s+/g, ' ').slice(0, 180);
}

function findForbiddenKeys(value, forbiddenKeys, path = '$') {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenKeys(item, forbiddenKeys, `${path}[${index}]`));
  }

  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenKeys.includes(key)) hits.push(childPath);
    hits.push(...findForbiddenKeys(child, forbiddenKeys, childPath));
  }
  return hits;
}

function assertNoForbiddenKeys(label, value, forbiddenKeys) {
  const hits = findForbiddenKeys(value, forbiddenKeys);
  if (hits.length === 0) {
    pass(`${label} omits sensitive fields`);
  } else {
    fail(`${label} leaked forbidden field(s): ${hits.slice(0, 8).join(', ')}`);
  }
}

async function request(method, path, options = {}) {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: options.headers,
    body: options.body,
    redirect: options.redirect ?? 'manual',
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* HTML/binary preview only */
  }
  return { res, text, json, url };
}

function hasRobots(text, headerValue, expected) {
  const normalizedHeader = (headerValue || '').toLowerCase();
  const normalizedBody = text.toLowerCase();
  return (
    normalizedHeader.includes(expected) ||
    normalizedBody.includes(`name="robots"`) && normalizedBody.includes(`content="${expected}"`)
  );
}

function getHtmlAttr(tag, attr) {
  const match = tag?.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
  return match?.[1] || '';
}

async function checkPage({ path, label, expectedStatus = 200, robots, contains = [] }) {
  const { res, text } = await request('GET', path);
  if (res.status === expectedStatus) {
    pass(`${label} ${path} returned ${res.status}`);
  } else {
    fail(`${label} ${path} returned ${res.status}, expected ${expectedStatus}; ${preview(text)}`);
    return;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    pass(`${label} ${path} served HTML`);
  } else {
    fail(`${label} ${path} content-type is ${contentType || 'missing'}`);
  }

  if (robots && hasRobots(text, res.headers.get('x-robots-tag'), robots)) {
    pass(`${label} ${path} robots=${robots}`);
  } else if (robots) {
    fail(`${label} ${path} missing robots=${robots}`);
  }

  for (const needle of contains) {
    if (text.includes(needle)) {
      pass(`${label} ${path} contains ${needle}`);
    } else {
      fail(`${label} ${path} missing ${needle}`);
    }
  }
}

async function checkLocalizedSeo({ path, label, lang, canonical, alternates }) {
  const { res, text } = await request('GET', path);
  if (res.status !== 200) {
    fail(`${label} ${path} returned ${res.status}, expected 200; ${preview(text)}`);
    return;
  }

  const htmlTag = text.match(/<html\b[^>]*>/i)?.[0] || '';
  const actualLang = getHtmlAttr(htmlTag, 'lang');
  if (actualLang === lang) {
    pass(`${label} ${path} html lang=${lang}`);
  } else {
    fail(`${label} ${path} html lang=${actualLang || 'missing'}, expected ${lang}`);
  }

  const linkTags = text.match(/<link\b[^>]*>/gi) || [];
  const canonicalTag = linkTags.find((tag) => getHtmlAttr(tag, 'rel').toLowerCase() === 'canonical');
  const actualCanonical = getHtmlAttr(canonicalTag, 'href');
  if (actualCanonical === canonical) {
    pass(`${label} ${path} canonical matches`);
  } else {
    fail(`${label} ${path} canonical=${actualCanonical || 'missing'}, expected ${canonical}`);
  }

  const alternateByLang = new Map();
  for (const tag of linkTags) {
    if (getHtmlAttr(tag, 'rel').toLowerCase() !== 'alternate') continue;
    alternateByLang.set(getHtmlAttr(tag, 'hreflang'), getHtmlAttr(tag, 'href'));
  }

  for (const [hreflang, href] of Object.entries(alternates)) {
    if (alternateByLang.get(hreflang) === href) {
      pass(`${label} ${path} hreflang ${hreflang} matches`);
    } else {
      fail(`${label} ${path} hreflang ${hreflang}=${alternateByLang.get(hreflang) || 'missing'}, expected ${href}`);
    }
  }

  for (const hiddenLocale of ['ru', 'es', 'de', 'fr', 'pl']) {
    if (alternateByLang.has(hiddenLocale)) {
      fail(`${label} ${path} exposes incomplete hreflang ${hiddenLocale}`);
    }
  }
}

async function checkJson({ path, label, expectedStatus = 200, token, predicate }) {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  const { res, text, json } = await request('GET', path, { headers });
  if (res.status === expectedStatus) {
    pass(`${label} ${path} returned ${res.status}`);
  } else {
    fail(`${label} ${path} returned ${res.status}, expected ${expectedStatus}; ${preview(text)}`);
    return null;
  }

  if (!json) {
    fail(`${label} ${path} did not return JSON`);
    return null;
  }

  if (predicate && !predicate(json)) {
    fail(`${label} ${path} JSON shape mismatch: ${preview(text)}`);
  } else {
    pass(`${label} ${path} JSON shape ok`);
  }

  return json;
}

async function checkStatus({ path, label, expectedStatus }) {
  const { res, text } = await request('GET', path);
  if (res.status === expectedStatus) {
    pass(`${label} ${path} returned ${res.status}`);
  } else {
    fail(`${label} ${path} returned ${res.status}, expected ${expectedStatus}; ${preview(text)}`);
  }
  return { res, text };
}

async function checkLegacyPublicStoryEndpoint(path, successorPath) {
  const { res, text } = await request('GET', path);
  if (res.status === 200) {
    pass(`Legacy public endpoint ${path} returned 200`);
  } else {
    fail(`Legacy public endpoint ${path} returned ${res.status}; ${preview(text)}`);
    return;
  }

  const deprecated = res.headers.get('x-deprecated-endpoint') || '';
  const link = res.headers.get('link') || '';
  if (deprecated.includes(successorPath) && link.includes(successorPath)) {
    pass(`Legacy public endpoint ${path} points to ${successorPath}`);
  } else {
    fail(`Legacy public endpoint ${path} missing successor headers`);
  }
}

async function postJson({ path, label, token, body, expectedStatus = 200, predicate }) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const { res, text, json } = await request('POST', path, {
    headers,
    body: JSON.stringify(body),
  });

  if (res.status === expectedStatus) {
    pass(`${label} ${path} returned ${res.status}`);
  } else {
    fail(`${label} ${path} returned ${res.status}, expected ${expectedStatus}; ${preview(text)}`);
    return null;
  }

  if (predicate && !predicate(json)) {
    fail(`${label} ${path} JSON shape mismatch: ${preview(text)}`);
  } else {
    pass(`${label} ${path} JSON shape ok`);
  }

  return json;
}

async function login(email, password, label) {
  const json = await postJson({
    path: '/api/v1/auth/sessions',
    label,
    body: { email, password },
    predicate: (body) => Boolean(body?.token && body?.user?.id && body?.user?.email),
  });
  if (!json?.token) return null;

  const forbidden = ['passwordHash', 'stripeCustomerId'].filter((key) => key in (json.user || {}));
  if (forbidden.length > 0) {
    fail(`${label} login leaked forbidden user fields: ${forbidden.join(', ')}`);
  } else {
    pass(`${label} login user response omits sensitive fields`);
  }
  return json.token;
}

async function main() {
  console.log(`Production smoke for ${baseUrl}`);

  await checkJson({
    path: '/health',
    label: 'Health',
    predicate: (body) => body?.status === 'healthy' && body?.database === 'connected',
  });
  await checkJson({
    path: '/api/v1',
    label: 'API index',
    predicate: (body) => body?.name === 'WonderTales API',
  });

  const pages = [
    { path: '/', label: 'SSR landing', robots: 'index,follow', contains: ['WonderTales'] },
    { path: '/en', label: 'SSR localized landing', robots: 'index,follow', contains: ['WonderTales'] },
    { path: '/pricing', label: 'SSR pricing', robots: 'index,follow', contains: ['WonderTales'] },
    { path: '/stories', label: 'SSR stories catalog', robots: 'index,follow', contains: ['WonderTales'] },
    { path: '/terms', label: 'SSR terms', robots: 'index,follow', contains: ['WonderTales'] },
    { path: '/privacy', label: 'SSR privacy', robots: 'index,follow', contains: ['WonderTales'] },
    { path: '/support', label: 'SSR support', robots: 'noindex,follow', contains: ['support@wondertales.art'] },
    { path: '/welcome', label: 'SPA welcome', robots: 'noindex,nofollow' },
    { path: '/register', label: 'SPA register', robots: 'noindex,nofollow' },
    { path: '/auth/forgot-password', label: 'SPA forgot password', robots: 'noindex,nofollow' },
    { path: '/auth/reset-password?token=bad', label: 'SPA reset password', robots: 'noindex,nofollow' },
    { path: '/billing/plans', label: 'SPA billing plans', robots: 'noindex,nofollow' },
  ];
  for (const page of pages) await checkPage(page);

  const localizedSeoPages = [
    {
      path: '/',
      label: 'SSR landing SEO',
      lang: 'uk',
      canonical: `${baseUrl}`,
      alternates: {
        uk: `${baseUrl}`,
        en: `${baseUrl}/en/`,
        'x-default': `${baseUrl}`,
      },
    },
    {
      path: '/en',
      label: 'SSR localized landing SEO',
      lang: 'en',
      canonical: `${baseUrl}/en/`,
      alternates: {
        uk: `${baseUrl}`,
        en: `${baseUrl}/en/`,
        'x-default': `${baseUrl}`,
      },
    },
    {
      path: '/pricing',
      label: 'SSR pricing SEO',
      lang: 'uk',
      canonical: `${baseUrl}/pricing`,
      alternates: {
        uk: `${baseUrl}/pricing`,
        en: `${baseUrl}/en/pricing`,
        'x-default': `${baseUrl}/pricing`,
      },
    },
    {
      path: '/en/pricing',
      label: 'SSR localized pricing SEO',
      lang: 'en',
      canonical: `${baseUrl}/en/pricing`,
      alternates: {
        uk: `${baseUrl}/pricing`,
        en: `${baseUrl}/en/pricing`,
        'x-default': `${baseUrl}/pricing`,
      },
    },
    {
      path: '/stories',
      label: 'SSR stories catalog SEO',
      lang: 'uk',
      canonical: `${baseUrl}/stories`,
      alternates: {
        uk: `${baseUrl}/stories`,
        en: `${baseUrl}/en/stories`,
        'x-default': `${baseUrl}/stories`,
      },
    },
    {
      path: '/en/stories',
      label: 'SSR localized stories catalog SEO',
      lang: 'en',
      canonical: `${baseUrl}/en/stories`,
      alternates: {
        uk: `${baseUrl}/stories`,
        en: `${baseUrl}/en/stories`,
        'x-default': `${baseUrl}/stories`,
      },
    },
    {
      path: '/terms',
      label: 'SSR terms SEO',
      lang: 'uk',
      canonical: `${baseUrl}/terms`,
      alternates: {
        uk: `${baseUrl}/terms`,
        en: `${baseUrl}/en/terms`,
        'x-default': `${baseUrl}/terms`,
      },
    },
    {
      path: '/en/terms',
      label: 'SSR localized terms SEO',
      lang: 'en',
      canonical: `${baseUrl}/en/terms`,
      alternates: {
        uk: `${baseUrl}/terms`,
        en: `${baseUrl}/en/terms`,
        'x-default': `${baseUrl}/terms`,
      },
    },
    {
      path: '/privacy',
      label: 'SSR privacy SEO',
      lang: 'uk',
      canonical: `${baseUrl}/privacy`,
      alternates: {
        uk: `${baseUrl}/privacy`,
        en: `${baseUrl}/en/privacy`,
        'x-default': `${baseUrl}/privacy`,
      },
    },
    {
      path: '/en/privacy',
      label: 'SSR localized privacy SEO',
      lang: 'en',
      canonical: `${baseUrl}/en/privacy`,
      alternates: {
        uk: `${baseUrl}/privacy`,
        en: `${baseUrl}/en/privacy`,
        'x-default': `${baseUrl}/privacy`,
      },
    },
  ];
  for (const page of localizedSeoPages) await checkLocalizedSeo(page);

  const publicStories = await checkJson({
    path: '/api/v1/public/stories?limit=1',
    label: 'Public stories API',
    predicate: (body) => body?.status === 'success' && Array.isArray(body?.stories),
  });
  assertNoForbiddenKeys('Public stories API', publicStories, [
    'passwordHash',
    'stripeCustomerId',
    'email',
    'shareToken',
    'childProfileId',
    'privateStoryCount',
    'unlistedStoryCount',
  ]);
  const firstStory = publicStories?.stories?.[0] || null;
  if (firstStory?.publishedSlug) {
    const slug = firstStory.publishedSlug;
    await checkPage({
      path: `/stories/${encodeURIComponent(slug)}`,
      label: 'SSR story detail',
      robots: 'index,follow',
      contains: [firstStory.title],
    });
    await checkJson({
      path: `/api/v1/public/stories/${encodeURIComponent(slug)}`,
      label: 'Public story detail API',
      predicate: (body) => body?.status === 'success' && body?.story?.id === firstStory.id,
    }).then((body) =>
      assertNoForbiddenKeys('Public story detail API', body, [
        'passwordHash',
        'stripeCustomerId',
        'email',
        'shareToken',
        'childProfileId',
        'privateStoryCount',
        'unlistedStoryCount',
      ])
    );
    await checkLegacyPublicStoryEndpoint(
      '/api/v1/stories/published',
      '/api/v1/public/stories'
    );
    await checkLegacyPublicStoryEndpoint(
      `/api/v1/stories/published/${encodeURIComponent(slug)}`,
      `/api/v1/public/stories/${encodeURIComponent(slug)}`
    );
    const share = await request('GET', `/share-card/${encodeURIComponent(slug)}`);
    if (share.res.status === 200 && (share.res.headers.get('content-type') || '').includes('image/jpeg')) {
      pass('Share-card image returned JPEG');
    } else {
      fail(`Share-card returned ${share.res.status} ${share.res.headers.get('content-type') || ''}`);
    }
  } else {
    warn('No published story slug available for story detail smoke');
  }

  if (firstStory?.authorId) {
    await checkPage({
      path: `/authors/${encodeURIComponent(firstStory.authorId)}`,
      label: 'SSR author detail',
      robots: 'index,follow',
      contains: [firstStory.authorDisplayName || 'WonderTales'],
    });
    await checkJson({
      path: `/api/v1/public/authors/${encodeURIComponent(firstStory.authorId)}`,
      label: 'Public author API',
      predicate: (body) => body?.status === 'success',
    }).then((body) =>
      assertNoForbiddenKeys('Public author API', body, [
        'email',
        'role',
        'stripeCustomerId',
        'privateStoryCount',
        'unlistedStoryCount',
        'childProfiles',
        'settings',
      ])
    );
  }

  const missingUnlistedToken = 'not-a-real-share-token';
  await checkStatus({
    path: `/u/${missingUnlistedToken}`,
    label: 'Missing unlisted SSR',
    expectedStatus: 404,
  });
  await checkJson({
    path: `/api/v1/public/u/${missingUnlistedToken}`,
    label: 'Missing unlisted API',
    expectedStatus: 404,
    predicate: (body) => body?.status === 'error',
  });
  await checkStatus({
    path: `/share-card/u/${missingUnlistedToken}`,
    label: 'Missing unlisted share-card',
    expectedStatus: 404,
  });

  const sitemap = await request('GET', '/sitemap.xml');
  if (sitemap.res.status === 200 && sitemap.text.includes('/stories')) {
    pass('Sitemap includes public story surfaces');
  } else {
    fail(`Sitemap did not include public story surfaces; status ${sitemap.res.status}`);
  }
  if (!sitemap.text.includes('/u/')) {
    pass('Sitemap excludes unlisted share links');
  } else {
    fail('Sitemap unexpectedly includes unlisted share links');
  }

  await checkJson({
    path: '/api/v1/plans',
    label: 'Public plans API',
    predicate: (body) => body?.status === 'success' && Array.isArray(body?.plans) && body?.enableRealPayments === true,
  });
  await checkJson({
    path: '/api/v1/dictionaries/story-themes',
    label: 'Story themes API',
    predicate: (body) => body?.status === 'success',
  });
  await checkJson({
    path: '/api/v1/dictionaries/character-traits?type=child',
    label: 'Character traits API',
    predicate: (body) => body?.status === 'success',
  });

  const evil = await request('GET', '/api/v1/public/stories?limit=1', {
    headers: { origin: 'https://evil.example' },
  });
  const reflectedOrigin = evil.res.headers.get('access-control-allow-origin') === 'https://evil.example';
  if (reflectedOrigin) {
    fail('CORS reflected untrusted Origin');
  } else {
    pass('CORS did not allow untrusted Origin');
  }

  await checkJson({
    path: '/api/v1/me',
    label: 'Unauthenticated private API guard',
    expectedStatus: 401,
    predicate: (body) => body?.status === 'error',
  });

  let userToken = null;
  if (smokeEmail && smokePassword) {
    userToken = await login(smokeEmail, smokePassword, 'Smoke user');
  } else {
    warn('Skipping authenticated user checks; set PROD_SMOKE_EMAIL and PROD_SMOKE_PASSWORD');
  }

  if (userToken) {
    const authedChecks = [
      ['/api/v1/me', 'Current user API'],
      ['/api/v1/me/stories', 'Current user stories API'],
      ['/api/v1/me/stories/languages', 'Current user story languages API'],
      ['/api/v1/me/subscription-usage', 'Current user usage API'],
      ['/api/v1/me/sessions', 'Current user sessions API'],
      ['/api/v1/me/oauth-providers', 'Current user OAuth providers API'],
      ['/api/v1/me/privacy-requests', 'Current user privacy requests API'],
      ['/api/v1/children', 'Children API'],
      ['/api/v1/characters', 'Characters API'],
      ['/api/v1/plans/with-features', 'Authenticated plans API'],
      ['/api/v1/entitlements', 'Entitlements API'],
      ['/api/v1/bundles', 'Bundles API'],
      ['/api/v1/voices?language=uk', 'Voices API'],
    ];
    for (const [path, label] of authedChecks) {
      const body = await checkJson({
        path,
        label,
        token: userToken,
        predicate: (json) => json?.status === 'success' || Array.isArray(json?.sessions),
      });
      if (path === '/api/v1/me' && body?.user) {
        const forbidden = ['passwordHash', 'stripeCustomerId'].filter((key) => key in body.user);
        if (forbidden.length > 0) {
          fail(`/api/v1/me leaked forbidden user fields: ${forbidden.join(', ')}`);
        } else {
          pass('/api/v1/me omits sensitive fields');
        }
      }
    }
    const series = await checkJson({
      path: '/api/v1/me/series',
      label: 'Current user series entitlement gate API',
      token: userToken,
      expectedStatus: 403,
      predicate: (json) => json?.code === 'SERIES_ACCESS_REQUIRED',
    });
    if (series) {
      pass('Current user series endpoint is covered by expected entitlement gate');
    }

    if (createCheckout) {
      const checkout = await postJson({
        path: '/api/v1/billing/checkout-session',
        label: 'Stripe subscription checkout',
        token: userToken,
        body: { planSlug: 'silver' },
        predicate: (body) =>
          body?.status === 'success' &&
          typeof body?.sessionId === 'string' &&
          body.sessionId.startsWith('cs_test_') &&
          typeof body?.url === 'string' &&
          body.url.includes('checkout.stripe.com'),
      });
      if (checkout?.url) checkoutUrls.push({ kind: 'subscription', url: checkout.url });

      const bundles = await checkJson({
        path: '/api/v1/bundles',
        label: 'Bundles API for checkout',
        token: userToken,
        predicate: (body) => body?.status === 'success' && Array.isArray(body?.bundles),
      });
      const firstBundle = bundles?.bundles?.[0];
      if (firstBundle?.slug) {
        const bundleCheckout = await postJson({
          path: '/api/v1/billing/bundle-checkout',
          label: 'Stripe bundle checkout',
          token: userToken,
          body: { bundleSlug: firstBundle.slug },
          predicate: (body) =>
            body?.status === 'success' &&
            typeof body?.sessionId === 'string' &&
            body.sessionId.startsWith('cs_test_') &&
            typeof body?.url === 'string' &&
            body.url.includes('checkout.stripe.com'),
        });
        if (bundleCheckout?.url) checkoutUrls.push({ kind: 'bundle', url: bundleCheckout.url });
      } else {
        warn('No active bundle available for bundle checkout smoke');
      }
    } else {
      warn('Skipping Stripe checkout creation; set PROD_SMOKE_CHECKOUT=1');
    }
  }

  if (adminEmail && adminPassword) {
    const adminToken = await login(adminEmail, adminPassword, 'Admin smoke user');
    if (adminToken) {
      const adminChecks = [
        ['/health/detailed', 'Detailed health API'],
        ['/health/queues', 'Queue health API'],
        ['/health/image-rate-limiter', 'Image rate limiter API'],
        ['/api/v1/admin/dashboard?days=7', 'Admin dashboard API'],
        ['/api/v1/admin/stories?limit=1', 'Admin stories API'],
        ['/api/v1/admin/users?limit=1', 'Admin users API'],
        ['/api/v1/admin/feedback?limit=1', 'Admin feedback API'],
        ['/api/v1/admin/privacy-requests?limit=1', 'Admin privacy requests API'],
        ['/api/v1/admin/voices?limit=1', 'Admin voices API'],
        ['/api/v1/admin/image-validations?limit=1', 'Admin image validations API'],
        ['/api/v1/admin/content-config/plans', 'Admin plans config API'],
        ['/api/v1/admin/content-config/storyGoals', 'Admin story goals config API'],
      ];
      for (const [path, label] of adminChecks) {
        await checkJson({
          path,
          label,
          token: adminToken,
          predicate: (json) => typeof json === 'object' && json !== null,
        });
      }
    }
  } else {
    warn('Skipping admin read-only checks; set PROD_ADMIN_SMOKE_EMAIL and PROD_ADMIN_SMOKE_PASSWORD');
  }

  if (checkoutUrls.length > 0) {
    fs.writeFileSync(checkoutUrlFile, JSON.stringify(checkoutUrls, null, 2));
    pass(`Wrote Stripe checkout URL(s) to ${checkoutUrlFile}`);
  }

  console.log(`Summary: ${failures} failure(s), ${warnings} warning(s)`);
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((error) => {
  failures += 1;
  console.error(`FAIL smoke script crashed: ${error?.stack || error}`);
  console.log(`Summary: ${failures} failure(s), ${warnings} warning(s)`);
  process.exitCode = 1;
});
NODE

if [[ "$CHECK_PROD_REMOTE" == "1" ]]; then
  echo
  echo "Remote docker log tail"
  ssh -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" \
    "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml logs api --since 20m 2>&1 | grep -i -E 'error|warn|checkout|stripe|oauth|password reset|forgot password|resend|failed' | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/[email]/g' || true"
else
  echo "WARN Skipped remote docker log tail because CHECK_PROD_REMOTE=0"
fi
