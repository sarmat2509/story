# Quick Reference: Environment Configuration

## Production Build (Default)

```bash
# From apps/universal-app directory
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=https://wondertales.art
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF

# Build for iPad
npx expo run:ios --device
```

**What you get:**
- ✅ Connects to production API server
- ✅ Real data and users
- ✅ No local backend needed
- ✅ Works over internet (no Wi-Fi dependency)

---

## Local Development Build

```bash
# 1. Find your Mac's local IP
ipconfig getifaddr en0
# Example: 192.168.1.100

# 2. Create .env with your IP
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF

# 3. Start local API (in separate terminal from project root)
pnpm dev:api

# 4. Build for iPad
npx expo run:ios --device
```

**What you get:**
- ✅ Connects to local API on your Mac
- ✅ Test backend changes before deployment
- ✅ Debug server-side issues
- ⚠️ Requires iPad and Mac on same Wi-Fi
- ⚠️ Requires local API running

---

## Switching Environments

**CRITICAL:** Environment variables are baked into the app at **build time**.

After changing `.env`, you **MUST rebuild**:

```bash
# 1. Clear cache
npx expo start -c

# 2. Rebuild
npx expo run:ios --device
```

---

## Verify Environment

Check Xcode console for:

```
🔗 API_BASE_URL: https://wondertales.art
🔗 EXPO_PUBLIC_API_BASE_URL: https://wondertales.art
```

Or check network requests in app to verify which server it's hitting.

---

## Production URL

**Live API:** https://wondertales.art

**Health Check:**
```bash
curl https://wondertales.art/health/health
# Should return: {"status":"healthy"}
```

---

## Troubleshooting

### App still connects to old environment after rebuild

```bash
# Clean build and reinstall
cd ios
rm -rf build
cd ..
npx expo start -c
npx expo run:ios --device
```

### Can't connect to local API

1. Check Mac's IP hasn't changed: `ipconfig getifaddr en0`
2. Update `.env` with new IP
3. Rebuild app
4. Verify API is running: `curl http://localhost:3000/health/health`

### Can't connect to production API

1. Check internet connection
2. Verify production URL: `curl https://wondertales.art/health/health`
3. Check `.env` file has correct URL
4. Rebuild app

---

For full instructions, see [BUILD_IOS.md](./BUILD_IOS.md)
