#!/usr/bin/env bash

# Production auth/recovery smoke check.
# Usage:
#   ./scripts/check-production-auth.sh
#   CHECK_PROD_REMOTE=0 ./scripts/check-production-auth.sh
#   PROD_AUTH_RESET_EMAIL=parent@example.com ./scripts/check-production-auth.sh
#   PROD_SUPPORT_EMAIL=support@wondertales.art ./scripts/check-production-auth.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://wondertales.art}"
DROPLET_IP="${DROPLET_IP:-167.172.102.75}"
DROPLET_USER="${DROPLET_USER:-root}"
DROPLET_PATH="${DROPLET_PATH:-/var/www/kazka}"
CHECK_PROD_REMOTE="${CHECK_PROD_REMOTE:-1}"
PROD_AUTH_RESET_EMAIL="${PROD_AUTH_RESET_EMAIL:-codex-smoke-nonexistent-20260502@wondertales.invalid}"
PROD_SUPPORT_EMAIL="${PROD_SUPPORT_EMAIL:-support@wondertales.art}"

failures=0
warnings=0

pass() {
  printf 'PASS %s\n' "$1"
}

warn() {
  warnings=$((warnings + 1))
  printf 'WARN %s\n' "$1"
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL %s\n' "$1"
}

check_http_code() {
  local label="$1"
  local expected="$2"
  local url="$3"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$url")"
  if [[ "$code" == "$expected" ]]; then
    pass "$label returned $code"
  else
    fail "$label returned $code, expected $expected"
  fi
}

post_json() {
  local url="$1"
  local data="$2"
  local body_file="$3"
  curl -sS -o "$body_file" -w '%{http_code}' \
    -H 'content-type: application/json' \
    -X POST "$url" \
    --data "$data"
}

printf 'Production auth check for %s\n\n' "$BASE_URL"

check_http_code "/health" "200" "$BASE_URL/health"

oauth_headers="$(mktemp)"
oauth_code="$(curl -sS -D "$oauth_headers" -o /dev/null -w '%{http_code}' -I "$BASE_URL/api/v1/auth/google/start")"
oauth_location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, ""); sub(/^location:[[:space:]]*/, ""); print; exit}' "$oauth_headers")"
rm -f "$oauth_headers"

if [[ "$oauth_code" == "302" && -n "$oauth_location" ]]; then
  pass "Google OAuth start returned 302"
else
  fail "Google OAuth start returned $oauth_code without redirect"
fi

if [[ -n "${oauth_location:-}" ]]; then
  oauth_parse="$(node - "$oauth_location" "$BASE_URL/api/v1/auth/google/callback" <<'NODE'
const location = process.argv[2];
const expectedRedirect = process.argv[3];
const url = new URL(location);
const redirectUri = url.searchParams.get('redirect_uri') || '';
const scope = url.searchParams.get('scope') || '';
const clientId = url.searchParams.get('client_id') || '';
const responseType = url.searchParams.get('response_type') || '';

const checks = [];
checks.push(['host', url.host === 'accounts.google.com', url.host]);
checks.push(['redirect_uri', redirectUri === expectedRedirect, redirectUri]);
checks.push(['scope', /\bprofile\b/.test(scope) && /\bemail\b/.test(scope), scope]);
checks.push(['client_id', clientId.length > 20, `set(len=${clientId.length})`]);
checks.push(['response_type', responseType === 'code', responseType || 'missing']);

for (const [name, ok, value] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} oauth.${name}=${value}`);
}
NODE
)"
  printf '%s\n' "$oauth_parse"
  if printf '%s\n' "$oauth_parse" | grep -q '^FAIL '; then
    failures=$((failures + 1))
  fi
fi

forgot_body="$(mktemp)"
forgot_code="$(post_json "$BASE_URL/api/v1/auth/forgot-password" "{\"email\":\"$PROD_AUTH_RESET_EMAIL\"}" "$forgot_body")"
if [[ "$forgot_code" == "200" ]] && grep -q '"status":"success"' "$forgot_body"; then
  pass "forgot-password returned privacy-preserving 200"
else
  fail "forgot-password returned $forgot_code; body: $(cat "$forgot_body")"
fi
rm -f "$forgot_body"

reset_body="$(mktemp)"
reset_code="$(post_json "$BASE_URL/api/v1/auth/reset-password" '{"token":"codex-invalid-token","password":"Password123!"}' "$reset_body")"
if [[ "$reset_code" == "400" ]] && grep -q '"code":"INVALID_OR_EXPIRED_TOKEN"' "$reset_body"; then
  pass "reset-password rejects invalid token with expected code"
else
  fail "reset-password invalid token returned $reset_code; body: $(cat "$reset_body")"
fi
rm -f "$reset_body"

evil_headers="$(mktemp)"
curl -sS -D "$evil_headers" -o /dev/null -H 'Origin: https://evil.example' "$BASE_URL/api/v1/public/stories?limit=1"
if grep -qi '^access-control-allow-origin:[[:space:]]*https://evil.example' "$evil_headers"; then
  fail "CORS reflected an untrusted Origin"
else
  pass "CORS did not allow untrusted Origin"
fi
rm -f "$evil_headers"

root_txt="$(dig +short TXT wondertales.art @1.1.1.1 || true)"
dmarc_txt="$(dig +short TXT _dmarc.wondertales.art @1.1.1.1 || true)"
dkim_txt="$(dig +short TXT resend._domainkey.wondertales.art @1.1.1.1 || true)"
dkim_cname="$(for name in resend._domainkey.wondertales.art selector1._domainkey.wondertales.art selector2._domainkey.wondertales.art; do dig +short CNAME "$name" @1.1.1.1; done || true)"

if printf '%s\n' "$root_txt" | grep -qi 'v=spf1'; then
  pass "SPF TXT exists for wondertales.art"
else
  warn "No SPF TXT found for wondertales.art; password reset deliverability is not launch-ready"
fi

if printf '%s\n' "$dmarc_txt" | grep -qi 'v=DMARC1'; then
  pass "DMARC TXT exists for wondertales.art"
else
  warn "No DMARC TXT found for wondertales.art"
fi

if printf '%s\n' "$dkim_txt" | grep -Eq 'p=|v=DKIM1'; then
  pass "Resend DKIM TXT exists for wondertales.art"
elif [[ -n "$dkim_cname" ]]; then
  pass "Resend DKIM CNAME candidate exists for wondertales.art"
else
  warn "No Resend DKIM TXT or common DKIM CNAME candidates found for wondertales.art"
fi

support_domain="${PROD_SUPPORT_EMAIL##*@}"
support_mx_check="$(node - "$support_domain" <<'NODE'
const dns = require('node:dns').promises;
const net = require('node:net');

const domain = process.argv[2];

function line(level, message) {
  console.log(`${level} ${message}`);
}

async function canConnect(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, 'connected'));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (error) => finish(false, error.code || error.message));
  });
}

async function main() {
  if (!domain || domain === process.argv[1]) {
    line('WARN', 'Support email domain is missing');
    return;
  }

  let mx = [];
  try {
    mx = await dns.resolveMx(domain);
  } catch (error) {
    line('WARN', `Support email domain ${domain} has no readable MX records (${error.code || error.message})`);
    return;
  }

  if (mx.length === 0) {
    line('WARN', `Support email domain ${domain} has no MX records`);
    return;
  }

  mx.sort((a, b) => a.priority - b.priority);
  const primary = mx[0].exchange.replace(/\.$/, '');
  line('PASS', `Support email domain ${domain} has MX ${primary}`);

  try {
    const addresses = await dns.lookup(primary, { all: true });
    if (addresses.length > 0) {
      line('PASS', `Support MX ${primary} resolves to ${addresses.map((item) => item.address).join(', ')}`);
    } else {
      line('WARN', `Support MX ${primary} did not resolve to an address`);
    }
  } catch (error) {
    line('WARN', `Support MX ${primary} address lookup failed (${error.code || error.message})`);
  }

  const smtp = await canConnect(primary, 25);
  if (smtp.ok) {
    line('PASS', `Support MX ${primary}:25 accepted a TCP connection`);
  } else {
    line('WARN', `Support MX ${primary}:25 did not accept a TCP connection from this runner (${smtp.detail}); inbound support mail is not verified`);
  }
}

main().catch((error) => {
  line('WARN', `Support email MX check failed (${error?.message || error})`);
});
NODE
)"
printf '%s\n' "$support_mx_check"
warnings=$((warnings + $(printf '%s\n' "$support_mx_check" | grep -c '^WARN ' || true)))
failures=$((failures + $(printf '%s\n' "$support_mx_check" | grep -c '^FAIL ' || true)))

if [[ "$CHECK_PROD_REMOTE" == "1" ]]; then
  printf '\nRemote container checks via %s@%s\n' "$DROPLET_USER" "$DROPLET_IP"
  ssh -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml ps api"
  ssh -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" "cd ${DROPLET_PATH} && docker exec wondertales-api-prod sh -lc 'for k in NODE_ENV WEB_APP_URL API_PUBLIC_URL CORS_ALLOWED_ORIGINS GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_CALLBACK_URL GOOGLE_IOS_CLIENT_ID GOOGLE_ANDROID_CLIENT_ID RESEND_API_KEY FROM_EMAIL SUPPORT_EMAIL; do v=\$(printenv \"\$k\" || true); if [ -z \"\$v\" ]; then echo \"\$k=missing\"; else case \"\$k\" in *SECRET*|*KEY*) echo \"\$k=set(len=\${#v})\";; GOOGLE_CLIENT_ID|GOOGLE_IOS_CLIENT_ID|GOOGLE_ANDROID_CLIENT_ID) echo \"\$k=set(len=\${#v})\";; *) echo \"\$k=\$v\";; esac; fi; done'"
  ssh -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml logs api --since 15m 2>&1 | grep -i -E 'forgot password|reset password|password reset|oauth|google|resend|email|error|warn' | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/[email]/g' || true"
else
  warn "Skipped remote docker checks because CHECK_PROD_REMOTE=0"
fi

printf '\nSummary: %d failure(s), %d warning(s)\n' "$failures" "$warnings"
if [[ "$failures" -gt 0 ]]; then
  exit 1
fi
