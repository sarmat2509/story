# OAuth Implementation Strategy

## Current State (Milestone 1)

### ✅ Implemented
- **Google OAuth Web Flow** - Fully functional
  - `/auth/google/start` → Browser redirect
  - `/auth/google/callback` → Session creation + JWT
  - Uses: Web Application Client (ID + Secret)
  - Can test via browser

### 🔜 Placeholders (for Milestone 6)
- **Google Mobile Token Exchange** - Endpoint exists, not implemented
  - `/auth/google/token` → Returns 501
  - Will use: Android/iOS Client IDs
  
- **Apple OAuth** - Endpoints exist, not implemented
  - `/auth/apple/start` → Returns 501
  - `/auth/apple/callback` → Returns 501
  - `/auth/apple/token` → Returns 501

## OAuth Client Requirements

### Google Cloud Project Setup

**Required OAuth Clients:**

1. **Web Application** (Current - ACTIVE)
   - Client ID + Secret
   - Used by: Backend API
   - Redirect URI: `http://localhost:3000/auth/google/callback`
   - Status: ✅ Configured and working

2. **Android** (Future - Milestone 6)
   - Client ID only (no secret)
   - Used by: React Native Android app
   - Requires: Package name + SHA-1 certificate
   - Status: 🔜 Will create when building mobile app

3. **iOS** (Future - Milestone 6)
   - Client ID only (no secret)
   - Used by: React Native iOS app
   - Requires: Bundle ID
   - Status: 🔜 Will create when building mobile app

### Why Multiple Clients?

**Security Model:**
- **Web client** uses `client_secret` (server-side, secure)
- **Mobile clients** DON'T use secret (can't be secured on device)
- **Android** uses SHA-1 certificate for validation
- **iOS** uses Bundle ID for validation

**Token Verification:**
```typescript
// Web flow (current)
Backend receives: authorization code
Backend exchanges: code → access_token (using client_secret)
Backend gets: user profile
Result: Secure, server-side only

// Mobile flow (future)
Mobile app: Gets idToken directly from Google SDK
Mobile app sends: idToken to backend
Backend verifies: idToken signature + audience
Backend gets: user profile from token
Result: Secure, no client_secret on device
```

## Implementation Plan

### Milestone 1 (Current - DONE ✅)
```
✅ Setup backend infrastructure
✅ Implement Web OAuth flow
✅ Session management
✅ JWT authentication
✅ Create placeholder endpoints for mobile
```

**Testing:** Via browser at `http://localhost:3000/auth/google/start`

### Milestone 6 (Mobile Client - FUTURE 🔜)

**Phase 1: Setup**
```
1. Create React Native app
2. Configure package name (Android) / Bundle ID (iOS)
3. Create Android OAuth client in Google Console
   - Add SHA-1 from debug keystore
4. Create iOS OAuth client in Google Console
   - Add Bundle ID
5. Setup Apple Developer account
   - Create App ID
   - Create Service ID
   - Generate .p8 key
```

**Phase 2: Implementation**
```
1. Install mobile OAuth libraries
   - @react-native-google-signin/google-signin
   - @invertase/react-native-apple-authentication
   
2. Implement backend token verification
   - POST /auth/google/token
     → Install google-auth-library
     → Verify idToken
     → Accept multiple audience (web + ios + android clients)
     → Extract profile
     → Create session
     → Return JWT
   
   - POST /auth/apple/token
     → Fetch Apple public keys
     → Verify identity token
     → Extract profile
     → Handle first-time name
     → Create session
     → Return JWT
     
3. Implement mobile app auth screens
   - Sign in with Google button
   - Sign in with Apple button (iOS)
   - Store JWT in secure storage
   - Add JWT to all API calls
```

**Phase 3: Testing**
```
1. Test on iOS simulator
2. Test on Android emulator (with debug keystore)
3. Test on real devices
4. Test account linking (Google → Apple same email)
5. Test multi-device sessions
```

## Code Structure

### Current (services/api/src/routes/auth.ts)

```typescript
// ✅ WORKING
GET  /auth/google/start      → Web OAuth redirect
GET  /auth/google/callback   → Web OAuth completion

// 🔜 PLACEHOLDER (returns 501)
POST /auth/google/token      → Mobile token exchange
GET  /auth/apple/start       → Apple web redirect
POST /auth/apple/callback    → Apple web completion
POST /auth/apple/token       → Apple mobile exchange

// ✅ WORKING
POST /auth/logout            → Logout current session
POST /auth/logout/all        → Logout all sessions
POST /auth/refresh           → Refresh JWT
```

### What Needs to Change in Milestone 6

**1. Add dependencies:**
```json
{
  "google-auth-library": "^9.0.0",
  "jsonwebtoken": "^9.0.2"  // already installed
}
```

**2. Implement token verification:**
```typescript
// services/api/src/services/tokenVerification.ts
import { OAuth2Client } from 'google-auth-library';

export async function verifyGoogleToken(idToken: string) {
  const client = new OAuth2Client();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: [
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
    ]
  });
  return ticket.getPayload();
}

export async function verifyAppleToken(identityToken: string) {
  // Fetch Apple public keys
  // Verify JWT signature
  // Return decoded payload
}
```

**3. Update routes:**
- Replace 501 responses with actual implementation
- Call verifyGoogleToken / verifyAppleToken
- Use existing handleGoogleCallback / handleAppleCallback
- Same session creation logic

## Testing Strategy

### Current (Milestone 1)
```bash
# Browser-based testing
curl -L http://localhost:3000/auth/google/start
# → Opens Google consent screen
# → Returns JWT token

# Test API with JWT
curl -H "Authorization: Bearer $JWT" http://localhost:3000/me
```

### Future (Milestone 6)
```typescript
// React Native test
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Configure with iOS client ID
GoogleSignin.configure({
  iosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
});

// Sign in
const userInfo = await GoogleSignin.signIn();

// Send to backend
const response = await fetch('https://api.wondertales.com/auth/google/token', {
  method: 'POST',
  body: JSON.stringify({ idToken: userInfo.idToken })
});

const { token } = await response.json();
// Store token securely
```

## FAQ

**Q: Do I need to change current code for mobile apps?**  
A: No. Current Web OAuth works perfectly. Mobile implementation comes in Milestone 6.

**Q: Why not implement mobile OAuth now?**  
A: 
- Can't test without mobile app
- Adds unused code in Milestones 1-5
- Milestone 6 is specifically for mobile client
- YAGNI principle (You Aren't Gonna Need It)

**Q: Will the same backend work for web + mobile?**  
A: Yes! Same backend, different endpoints:
- Web uses: `/auth/google/start` + `/auth/google/callback`
- Mobile uses: `/auth/google/token` (direct token exchange)

**Q: Can users have both web and mobile sessions?**  
A: Yes! Multi-device support already implemented:
- Each device creates separate session
- User can see all sessions in `/me/sessions`
- Can logout from specific device or all

**Q: What about account linking?**  
A: Already implemented! Same logic works for web + mobile:
- User logs in with Google (web) → creates account
- User logs in with Apple (mobile) same email → links to existing account
- Both OAuth identities point to same user

## Documentation References

- [OAuth Setup Guide](./OAUTH_SETUP.md) - Complete setup instructions
- [API Documentation](./api/auth.md) - All endpoints with examples
- [Architecture](./architecture.md) - System design

## Summary

**For Milestone 1:**
- ✅ Current implementation is correct
- ✅ No changes needed for multiple clients
- ✅ Web OAuth fully functional
- ✅ Mobile endpoints prepared (placeholders)

**For Milestone 6:**
- 🔜 Create Android/iOS OAuth clients
- 🔜 Implement token verification
- 🔜 Test on mobile devices
- 🔜 Update placeholders to working code

**Current Status: READY FOR MILESTONE 2** 🚀
