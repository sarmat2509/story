# OAuth Setup Guide - Complete Configuration

## Overview

Kazka+ uses OAuth 2.0 for authentication with support for Google and Apple Sign-In. Different platforms require **different OAuth clients**.

## Architecture

```
Google Cloud Project: "Kazka Plus"
├── Web Application Client (for web/testing)
│   └── Client ID + Secret → Backend API
├── Android Client (for React Native Android)
│   └── Client ID → Mobile App
└── iOS Client (for React Native iOS)
    └── Client ID → Mobile App

Apple Developer Account
└── Service ID + Key (.p8)
    └── Used by backend API
```

## 1. Google OAuth Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "Kazka Plus"
3. Note the Project ID

### Step 2: Enable APIs

1. Go to "APIs & Services" → "Library"
2. Search and enable:
   - **Google+ API** (or Google Identity Toolkit API)
   - **People API** (for profile info)

### Step 3: Create OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose **External** (for testing) or **Internal** (for organization)
3. Fill in:
   - App name: **Kazka+**
   - User support email: your email
   - Developer contact: your email
4. Scopes: Add `email`, `profile`, `openid`
5. Test users: Add your email for testing
6. Save and continue

### Step 4: Create Web Application Client (Backend)

1. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
2. Application type: **Web application**
3. Name: **Kazka+ Web**
4. Authorized JavaScript origins:
   ```
   http://localhost:3000
   https://kazkaplus.com
   ```
5. Authorized redirect URIs:
   ```
   http://localhost:3000/auth/google/callback
   https://api.kazkaplus.com/auth/google/callback
   ```
6. Click "Create"
7. **Copy Client ID and Client Secret** → Add to `.env`:
   ```bash
   GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
   ```

### Step 5: Create Android Client (Mobile)

1. Same project → Create Credentials → OAuth 2.0 Client ID
2. Application type: **Android**
3. Name: **Kazka+ Android**
4. Package name: `com.kazkaplus` (or your app package)
5. Get SHA-1 certificate fingerprint:
   
   **Debug keystore:**
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore \
     -alias androiddebugkey \
     -storepass android \
     -keypass android
   ```
   
   **Release keystore:**
   ```bash
   keytool -list -v -keystore path/to/release.keystore \
     -alias your_alias
   ```
   
6. Paste SHA-1 fingerprint
7. Click "Create"
8. **Copy Client ID** → Use in React Native app

### Step 6: Create iOS Client (Mobile)

1. Same project → Create Credentials → OAuth 2.0 Client ID
2. Application type: **iOS**
3. Name: **Kazka+ iOS**
4. Bundle ID: `com.kazkaplus` (must match Xcode project)
5. Click "Create"
6. **Copy Client ID** → Use in React Native app
7. Download `GoogleService-Info.plist` → Add to Xcode project

### Step 7: Verify Setup

Go to "Credentials" and you should see **3 OAuth clients**:
- ✅ Web application (for backend)
- ✅ Android (for mobile app)
- ✅ iOS (for mobile app)

---

## 2. Apple Sign-In Setup

### Step 1: Apple Developer Account

1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/)

### Step 2: Create App ID

1. Go to **Identifiers** → Click **+**
2. Select **App IDs** → Continue
3. Description: **Kazka+**
4. Bundle ID: `com.kazkaplus` (Explicit)
5. Capabilities: Check **Sign In with Apple**
6. Register

### Step 3: Create Service ID (for Backend)

1. Go to **Identifiers** → Click **+**
2. Select **Services IDs** → Continue
3. Description: **Kazka+ Backend**
4. Identifier: `com.kazkaplus.service`
5. Check **Sign In with Apple**
6. Click **Configure**:
   - Primary App ID: Select `com.kazkaplus`
   - Domains: `kazkaplus.com`, `localhost` (for testing)
   - Return URLs: 
     ```
     http://localhost:3000/auth/apple/callback
     https://api.kazkaplus.com/auth/apple/callback
     ```
7. Save and Register

### Step 4: Create Key (.p8)

1. Go to **Keys** → Click **+**
2. Key Name: **Kazka+ Sign In Key**
3. Check **Sign In with Apple**
4. Click **Configure** → Select primary App ID
5. Register
6. **Download .p8 file** (can only download once!)
7. Note the **Key ID** (e.g., `ABC123DEFG`)

### Step 5: Get Team ID

1. Go to **Membership**
2. Copy your **Team ID** (e.g., `XYZ987TEAM`)

### Step 6: Add to Backend `.env`

```bash
APPLE_CLIENT_ID=com.kazkaplus.service
APPLE_TEAM_ID=XYZ987TEAM
APPLE_KEY_ID=ABC123DEFG
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
...your key content here...
-----END PRIVATE KEY-----"
APPLE_CALLBACK_URL=http://localhost:3000/auth/apple/callback
```

**To convert .p8 to single line for .env:**
```bash
cat AuthKey_ABC123DEFG.p8 | tr '\n' '\n'
```

---

## 3. Environment Configuration

### Backend `.env`

```bash
# Database
DATABASE_URL=postgresql://kazka:devpass@localhost:5432/kazka_dev

# JWT
JWT_SECRET=<generate_with_openssl_rand_base64_32>
JWT_EXPIRES_IN=7d
SESSION_EXPIRES_IN=30d

# Google OAuth - Web Client (Backend)
GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Apple OAuth
APPLE_CLIENT_ID=com.kazkaplus.service
APPLE_TEAM_ID=XYZ987TEAM
APPLE_KEY_ID=ABC123DEFG
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APPLE_CALLBACK_URL=http://localhost:3000/auth/apple/callback
```

### React Native App Config

**`app.json` or `app.config.js`:**
```json
{
  "expo": {
    "ios": {
      "googleServicesFile": "./GoogleService-Info.plist",
      "bundleIdentifier": "com.kazkaplus"
    },
    "android": {
      "package": "com.kazkaplus",
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

**Google Sign-In configuration in app:**
```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  // iOS Client ID (from Step 6)
  iosClientId: '987654321-yyyyy.apps.googleusercontent.com',
  
  // Android uses SHA-1 automatically, no config needed
  
  offlineAccess: false,
});
```

---

## 4. Testing OAuth

### Test Web OAuth (Browser)

```bash
# Start backend
cd services/api
pnpm dev

# Open browser
open http://localhost:3000/auth/google/start

# Should redirect to Google consent screen
# After authorization, returns JWT token
```

### Test Mobile OAuth

**iOS Simulator:**
```bash
# Google Sign-In works in simulator
cd apps/mobile
npx expo start --ios

# Apple Sign-In requires real device (iOS 13+)
```

**Android Emulator:**
```bash
# Requires debug keystore SHA-1 to be registered
cd apps/mobile
npx expo start --android
```

---

## 5. Common Issues

### "redirect_uri_mismatch" Error

**Problem:** Redirect URI doesn't match Google Cloud Console

**Solution:**
- Check exact URL in error message
- Add to "Authorized redirect URIs" in Google Console
- Include `http://` or `https://` prefix
- No trailing slash

### Google Sign-In fails on Android

**Problem:** SHA-1 certificate not registered

**Solution:**
```bash
# Get SHA-1 from debug keystore
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android | grep SHA1

# Add to Android OAuth client in Google Console
```

### Apple Sign-In "invalid_client"

**Problem:** Service ID or credentials incorrect

**Solution:**
- Verify `APPLE_CLIENT_ID` matches Service ID identifier
- Check Team ID and Key ID are correct
- Ensure .p8 key is properly formatted in .env
- Verify Return URLs match exactly

### Token verification fails

**Problem:** Backend can't verify Google/Apple tokens

**Solution:**
- Install verification libraries:
  ```bash
  npm install google-auth-library
  npm install jsonwebtoken
  ```
- Use Google's token verification API
- Use Apple's public keys for JWT verification

---

## 6. Production Checklist

Before going to production:

- [ ] Replace `localhost` URLs with production domain
- [ ] Generate production release keystore for Android
- [ ] Add production SHA-1 to Google Android client
- [ ] Update Apple Service ID with production domain
- [ ] Set up proper DNS and SSL certificates
- [ ] Use production-grade `JWT_SECRET`
- [ ] Enable OAuth consent screen for public use
- [ ] Set up proper error handling and logging
- [ ] Test OAuth flow on real devices
- [ ] Implement token refresh logic
- [ ] Add rate limiting to OAuth endpoints

---

## 7. References

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Sign-In for iOS](https://developers.google.com/identity/sign-in/ios/start)
- [Google Sign-In for Android](https://developers.google.com/identity/sign-in/android/start)
- [Apple Sign In Documentation](https://developer.apple.com/documentation/sign_in_with_apple)
- [React Native Google Sign-In](https://github.com/react-native-google-signin/google-signin)
- [React Native Apple Authentication](https://github.com/invertase/react-native-apple-authentication)
