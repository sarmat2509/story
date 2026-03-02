# Rate Limiting Troubleshooting Guide

## Overview

This guide explains how rate limiting works in WonderTales and how to troubleshoot common 429 (Too Many Requests) errors.

## Architecture

### Production Setup (with Nginx Proxy)

```
iOS App/Simulator → HTTPS:443 → Nginx Proxy → API Container:3000 → Express Rate Limiter
                                      ↓
                              X-Forwarded-For: client_ip
                              X-Real-IP: client_ip
```

### Rate Limits

| Endpoint Type | Window | Limit | Notes |
|--------------|--------|-------|-------|
| Global | 15 min | 1000 req | All endpoints (≈66 req/min) |
| API (authenticated) | 15 min | 500 req | After login |
| Auth endpoints | 15 min | 10 req | Login attempts |
| OAuth callbacks | 1 hour | 5 req | OAuth flows |

### Development Mode

Rate limiting is **automatically disabled** when `NODE_ENV=development`.

## Problem: 429 Errors When Behind Nginx Proxy

### Symptoms

- iOS simulator gets 429 errors after a few requests
- Multiple clients (simulator + browser) share the same rate limit
- Rate limit exhausts quickly even with few requests

### Root Cause

When Express is behind a reverse proxy (Nginx), the rate limiter sees the **Nginx container IP** instead of the real client IP. This causes all requests to be counted as coming from a single client.

**Before Fix:**
- All requests appear to come from `172.18.0.3` (Nginx container)
- Rate limit shared across ALL users
- 1000 requests/15min exhausted quickly

**After Fix:**
- Rate limiter uses `X-Forwarded-For` header
- Each client has separate rate limit
- 1000 requests/15min per IP address

### Solution A: Fixed Rate Limiter (Recommended for Production)

The rate limiter now extracts the real client IP from proxy headers:

```typescript
// services/api/src/middleware/rateLimiter.ts
const getClientIp = (req: Request): string => {
  // Check X-Forwarded-For header (set by Nginx)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim(); // First IP = original client
  }
  
  // Fallback to X-Real-IP
  const realIp = req.headers['x-real-ip'];
  if (realIp) return realIp;
  
  // Fallback to Express req.ip
  return req.ip || 'unknown';
};

export const globalLimiter = rateLimit({
  keyGenerator: (req) => getClientIp(req), // Use real client IP
  // ... other config
});
```

**When to use:**
- Production deployments
- Testing with real domain (https://magic-sleep-time.duckdns.org)
- When you need to test rate limiting behavior

**Deployment:**
```bash
# Rebuild and restart API container
cd /path/to/project
docker-compose -f docker-compose.prod.yml up -d --build api
```

### Solution B: Direct Container Access (Development Only)

Bypass Nginx entirely by connecting directly to the API container port.

**When to use:**
- Local iOS simulator testing
- Rapid development/debugging
- Avoiding SSL certificate issues
- When rate limiting is not important for testing

**Setup:**

1. **Verify API port is exposed** (already configured in `docker-compose.prod.yml`):
```yaml
api:
  ports:
    - "3000:3000"  # Exposed on localhost
```

2. **Update `.env` in `apps/universal-app/`:**

```bash
# Option 1: Use host.docker.internal (Mac/Windows with Docker Desktop)
EXPO_PUBLIC_API_BASE_URL=http://host.docker.internal:3000

# Option 2: Use your machine's local IP
# Find with: ipconfig getifaddr en0 (Mac) or ipconfig (Windows)
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
```

3. **Restart Expo:**
```bash
cd apps/universal-app
npm start -- --clear
```

**Pros:**
- No rate limiting issues
- No SSL/HTTPS complications
- Faster (no Nginx hop)
- Easier debugging

**Cons:**
- Doesn't test production routing
- Uses HTTP instead of HTTPS
- Doesn't test Nginx configuration
- Only for development

## Debugging Rate Limit Issues

### Check Current Rate Limit Status

Make a request and check response headers:

```bash
curl -I https://magic-sleep-time.duckdns.org/api/v1/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Look for headers:
```
RateLimit-Limit: 1000
RateLimit-Remaining: 999
RateLimit-Reset: 1234567890
```

### View API Logs

The API now logs client IP for each request:

```bash
# View live logs
docker logs -f kazka-api-prod

# Look for rate limit logs
docker logs kazka-api-prod | grep "Incoming request"
```

Example log entry:
```json
{
  "level": "debug",
  "method": "GET",
  "path": "/api/v1/me",
  "clientIp": "203.0.113.42",
  "forwardedFor": "203.0.113.42",
  "realIp": "203.0.113.42",
  "reqIp": "172.18.0.3",
  "msg": "Incoming request"
}
```

**Good:** `clientIp` shows real IP (203.0.113.42)  
**Bad:** `clientIp` shows container IP (172.18.0.3)

### Test Rate Limiter with Real IPs

```bash
# Make multiple requests from same IP
for i in {1..10}; do
  curl -s https://magic-sleep-time.duckdns.org/api/v1/dictionaries/languages | jq .
  sleep 1
done

# Should NOT get 429 error (within limits)
```

### Verify Nginx Headers

Check that Nginx is sending proxy headers:

```bash
# SSH into API container
docker exec -it kazka-api-prod sh

# Check request headers (add logging in Express)
```

## Common Issues

### Issue 1: Still Getting 429 Errors After Fix

**Check:**
1. API container was rebuilt and restarted:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d --build api
   ```

2. Nginx is sending proxy headers (check `nginx/conf.d/kazka.conf`):
   ```nginx
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   ```

3. Express trusts proxy (check `services/api/src/index.ts`):
   ```typescript
   app.set('trust proxy', 1);
   ```

### Issue 2: Direct Container Access Not Working

**Symptom:** `ECONNREFUSED` when using `http://host.docker.internal:3000`

**Solutions:**
1. Verify API port is exposed:
   ```bash
   docker ps | grep kazka-api-prod
   # Should show: 0.0.0.0:3000->3000/tcp
   ```

2. Try your machine's local IP instead:
   ```bash
   # Mac
   ipconfig getifaddr en0
   
   # Use in .env
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.XXX:3000
   ```

3. Check Docker network:
   ```bash
   docker network inspect bridge
   ```

### Issue 3: Rate Limit Too Strict

If legitimate users are hitting rate limits, adjust limits in `services/api/src/middleware/rateLimiter.ts`:

```typescript
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // Increase limit
  // ...
});
```

Remember to rebuild after changes.

## Best Practices

### For Development

1. Use **direct container access** for rapid iteration:
   ```bash
   EXPO_PUBLIC_API_BASE_URL=http://host.docker.internal:3000
   ```

2. Or set `NODE_ENV=development` to disable rate limiting entirely

### For Staging/Testing

1. Use **production URL** with fixed rate limiter:
   ```bash
   EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org
   ```

2. Monitor logs to verify real IPs are being used

### For Production

1. Always use Nginx proxy (never expose API port publicly)
2. Use fixed rate limiter with `keyGenerator`
3. Monitor rate limit headers in responses
4. Adjust limits based on real usage patterns

## Security Considerations

### Trust Proxy Configuration

```typescript
app.set('trust proxy', 1); // Trust ONLY first proxy (Nginx)
```

**Why:** Prevents `X-Forwarded-For` header spoofing by only trusting the first proxy in the chain.

### Rate Limiter Key Generator

```typescript
const getClientIp = (req: Request): string => {
  // Take FIRST IP from X-Forwarded-For (original client)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // Fallbacks...
};
```

**Why:** The first IP in `X-Forwarded-For` is the original client, subsequent IPs are proxies.

### Production Port Exposure

In production, bind API port to localhost only:

```yaml
# docker-compose.prod.yml
api:
  ports:
    - "127.0.0.1:3000:3000"  # Localhost only!
```

**Why:** Prevents direct access to API, forces all traffic through Nginx (SSL + rate limiting).

## Additional Resources

- [Express Behind Proxies](https://expressjs.com/en/guide/behind-proxies.html)
- [express-rate-limit Documentation](https://github.com/nfriedly/express-rate-limit)
- [Nginx Proxy Headers](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)

## Support

If you continue to experience rate limiting issues after following this guide:

1. Check API logs for client IP detection
2. Verify Nginx is sending proxy headers
3. Test with direct container access to isolate issue
4. Review Docker network configuration
