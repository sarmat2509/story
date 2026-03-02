# 🚀 iOS Build Commands Cheat Sheet

> **⚠️ FREE APPLE ACCOUNT?** [Quick Fix for Push Notifications Error →](./QUICKFIX_PUSH_NOTIFICATIONS.md)

---

## First Time Setup

```bash
cd /Users/ivanryzhenko/Documents/Repository/story/apps/universal-app
pnpm install
cd ios && pod install && cd ..
```

---

## Production Build (Most Common)

```bash
# 1. Configure for production
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=https://magic-sleep-time.duckdns.org
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF

# 2. Build and install to iPad
npx expo run:ios --device
```

---

## Local Development Build

```bash
# 1. Get your Mac's IP
ipconfig getifaddr en0

# 2. Configure for local (replace IP below)
cat > .env << 'EOF'
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=151914486575-4ekba7gcqcbc6joqahhaigs7v97qjdoo.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=151914486575-1kpc8ot6kdhjho9hbm7tbqmtgqv7tk60.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=151914486575-9tqc0a0ksjl6hhokoevcek809bkgve9r.apps.googleusercontent.com
APPLE_CLIENT_ID=com.anonymous.wondertales
EOF

# 3. Start local API (separate terminal, from project root)
cd ../..
pnpm dev:api

# 4. Build and install to iPad (from apps/universal-app)
cd apps/universal-app
npx expo run:ios --device
```

---

## Rebuild After .env Change

```bash
# Clear cache and rebuild
npx expo start -c
npx expo run:ios --device
```

---

## Open in Xcode

```bash
open ios/WonderTales.xcworkspace
# Then press ▶️ button or Cmd+R to build
```

---

## Clean Build (if errors persist)

```bash
# Full clean
cd ios
rm -rf build Pods Podfile.lock
pod install
cd ..
npx expo start -c
npx expo run:ios --device
```

---

## Verify Environment

```bash
# Check .env file
cat .env | grep EXPO_PUBLIC_API_BASE_URL

# Test production API
curl https://magic-sleep-time.duckdns.org/health/health

# Test local API
curl http://localhost:3000/health/health
```

---

## Metro Bundler Commands

```bash
# Start Metro
npx expo start

# Start with cache clear
npx expo start -c

# Start for specific platform
npx expo start --ios
```

---

## CocoaPods Commands

```bash
cd ios

# Install pods
pod install

# Update pods
pod update

# Clean and reinstall
rm -rf Pods Podfile.lock
pod cache clean --all
pod install

cd ..
```

---

## Xcode Shortcuts

- **Build & Run**: `Cmd + R`
- **Clean Build**: `Cmd + Shift + K`
- **Show Console**: `Cmd + Shift + Y`
- **Stop**: `Cmd + .`

---

## Common Issues

### Push Notifications capability error (Free Apple account)
```
Error: Personal teams don't support Push Notifications
Solution:
1. Open Xcode → WonderTales target → Signing & Capabilities
2. Remove Push Notifications capability (click trash icon)
3. Rebuild
```

### Environment not updating
```bash
cd ios && rm -rf build && cd ..
npx expo start -c
npx expo run:ios --device
```

### CocoaPods errors
```bash
cd ios
rm -rf Pods Podfile.lock ~/Library/Developer/Xcode/DerivedData
pod install
cd ..
```

### Signing errors
1. Open Xcode
2. Select WonderTales target
3. Signing & Capabilities
4. Change Bundle Identifier
5. Select your Team

---

## URLs

- **Production API**: https://magic-sleep-time.duckdns.org
- **Local API**: http://localhost:3000
- **Health Check**: `/health/health`

---

For detailed instructions, see:
- [BUILD_IOS.md](./BUILD_IOS.md) - Full guide
- [ENV_QUICK_REFERENCE.md](./ENV_QUICK_REFERENCE.md) - Environment setup
