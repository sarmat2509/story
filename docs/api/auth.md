# Authentication API Documentation

## Overview

The WonderTales API uses OAuth 2.0 for authentication with support for Google and Apple Sign In. Sessions are stored in PostgreSQL with JWT tokens for API access.

## Authentication Flow

```
1. User initiates OAuth → GET /auth/{provider}/start
2. User authorizes on provider's site
3. Provider redirects to callback → GET /auth/{provider}/callback
4. Server creates session and returns JWT
5. Client stores JWT and includes in subsequent requests
6. API validates JWT + session on each request
```

## Endpoints

### Google OAuth

#### `GET /auth/google/start`

Redirects user to Google OAuth consent screen.

**Response:** HTTP 302 redirect to Google

---

#### `GET /auth/google/callback`

Handles Google OAuth callback.

**Query Parameters:**
- `code` - Authorization code from Google
- `state` - CSRF protection token

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "display_name": "John Doe",
    "avatar_url": "https://...",
    "preferred_locale": "uk",
    "created_at": "2026-01-25T10:00:00Z",
    "updated_at": "2026-01-25T10:00:00Z"
  },
  "expiresAt": 1737801600000,
  "isNewUser": true
}
```

---

#### `POST /auth/google/token`

Mobile Google token exchange (not yet implemented).

**Request Body:**
```json
{
  "idToken": "google_id_token_here"
}
```

---

### Apple OAuth

#### `GET /auth/apple/start`

Redirects user to Apple OAuth (not fully implemented).

---

#### `POST /auth/apple/callback`

Handles Apple OAuth callback (not fully implemented).

**Request Body:**
```json
{
  "code": "apple_authorization_code",
  "id_token": "apple_id_token",
  "user": {
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "email": "user@privaterelay.appleid.com"
  }
}
```

---

### Session Management

#### `POST /auth/logout`

Logout from current device/session.

**Headers:**
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

#### `POST /auth/logout/all`

Logout from all devices/sessions.

**Headers:**
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "status": "success",
  "message": "Logged out from 3 device(s)",
  "deletedCount": 3
}
```

---

#### `POST /auth/refresh`

Refresh JWT token (extends expiration).

**Headers:**
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "token": "new_jwt_token_here",
  "expiresAt": 1737801600000
}
```

---

### User Profile

#### `GET /me`

Get current user profile with linked OAuth providers.

**Headers:**
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "status": "success",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "display_name": "John Doe",
    "avatar_url": "https://...",
    "preferred_locale": "uk",
    "created_at": "2026-01-25T10:00:00Z",
    "updated_at": "2026-01-25T10:00:00Z",
    "oauthProviders": [
      {
        "provider": "google",
        "providerEmail": "user@gmail.com"
      },
      {
        "provider": "apple",
        "providerEmail": "user@privaterelay.appleid.com"
      }
    ]
  }
}
```

---

#### `PATCH /me`

Update current user profile.

**Headers:**
- `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "displayName": "Jane Doe",
  "preferredLocale": "en"
}
```

**Response:**
```json
{
  "status": "success",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "display_name": "Jane Doe",
    "preferred_locale": "en",
    ...
  }
}
```

---

#### `DELETE /me`

Delete user account (cascades to all related data).

**Headers:**
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "status": "success",
  "message": "Account deleted successfully"
}
```

---

#### `GET /me/sessions`

List all active sessions for current user.

**Headers:**
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "status": "success",
  "sessions": [
    {
      "id": "session-uuid",
      "deviceName": "iPhone 13 Pro",
      "deviceType": "ios",
      "ipAddress": "192.168.1.100",
      "createdAt": "2026-01-25T10:00:00Z",
      "lastActiveAt": "2026-01-25T14:30:00Z",
      "isCurrent": true
    },
    {
      "id": "session-uuid-2",
      "deviceName": "iPad",
      "deviceType": "ios",
      "ipAddress": "192.168.1.101",
      "createdAt": "2026-01-24T09:00:00Z",
      "lastActiveAt": "2026-01-24T18:00:00Z",
      "isCurrent": false
    }
  ]
}
```

---

#### `DELETE /me/sessions/:sessionToken`

Revoke specific session.

**Headers:**
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "status": "success",
  "message": "Session revoked successfully"
}
```

---

#### `GET /me/oauth`

List linked OAuth providers.

**Headers:**
- `Authorization: Bearer {token}`

**Response:**
```json
{
  "status": "success",
  "providers": [
    {
      "provider": "google",
      "providerEmail": "user@gmail.com"
    }
  ]
}
```

---

#### `POST /me/oauth/link`

Link additional OAuth provider to account (not yet implemented).

---

#### `DELETE /me/oauth/:provider`

Unlink OAuth provider from account.

**Headers:**
- `Authorization: Bearer {token}`

**Parameters:**
- `provider` - `google` or `apple`

**Response:**
```json
{
  "status": "success",
  "message": "google unlinked successfully"
}
```

**Error if only one provider:**
```json
{
  "status": "error",
  "message": "Cannot unlink the only authentication method"
}
```

---

## Error Responses

### 401 Unauthorized

```json
{
  "status": "error",
  "message": "Invalid or expired token"
}
```

### 400 Bad Request

```json
{
  "status": "error",
  "message": "Validation error message"
}
```

### 500 Internal Server Error

```json
{
  "status": "error",
  "message": "Internal server error"
}
```

---

## Mobile Integration Guide

### React Native Setup

#### 1. Install Dependencies

```bash
npm install @react-native-google-signin/google-signin
npm install @invertase/react-native-apple-authentication
npm install react-native-keychain
```

#### 2. Configure Google Sign-In

**iOS (`ios/GoogleService-Info.plist`):**
```xml
<key>CLIENT_ID</key>
<string>YOUR_IOS_CLIENT_ID.apps.googleusercontent.com</string>
```

**Android (`android/app/build.gradle`):**
Add your Android client ID to resources

**App Configuration:**
```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  // iOS client ID (the one you created in Google Console with type "iOS")
  iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',
  // No need for webClientId in most cases
  offlineAccess: false,
});
```

#### 3. Implement OAuth Flow

```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import appleAuth from '@invertase/react-native-apple-authentication';
import * as Keychain from 'react-native-keychain';

// Google Sign In
async function signInWithGoogle() {
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    
    // Exchange ID token with your backend
    const response = await fetch('https://api.wondertales.com/auth/google/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        idToken: userInfo.idToken,
        deviceName: await getDeviceName(),
        deviceType: Platform.OS, // 'ios' or 'android'
      }),
    });
    
    const data = await response.json();
    
    // Store JWT securely
    await Keychain.setGenericPassword('jwt', data.token);
    
    return data;
  } catch (error) {
    console.error('Google sign in error:', error);
  }
}

// Apple Sign In (iOS only)
async function signInWithApple() {
  try {
    const appleAuthRequestResponse = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });
    
    // Exchange with backend
    const response = await fetch('https://api.wondertales.com/auth/apple/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityToken: appleAuthRequestResponse.identityToken,
        authorizationCode: appleAuthRequestResponse.authorizationCode,
        user: appleAuthRequestResponse.fullName ? {
          firstName: appleAuthRequestResponse.fullName.givenName,
          lastName: appleAuthRequestResponse.fullName.familyName,
        } : undefined,
        deviceName: await getDeviceName(),
        deviceType: 'ios',
      }),
    });
    
    const data = await response.json();
    await Keychain.setGenericPassword('jwt', data.token);
    
    return data;
  } catch (error) {
    console.error('Apple sign in error:', error);
  }
}

// Use JWT for API calls
async function fetchUserProfile() {
  const credentials = await Keychain.getGenericPassword();
  const jwt = credentials ? credentials.password : null;
  
  if (!jwt) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch('https://api.wondertales.com/me', {
    headers: {
      'Authorization': `Bearer ${jwt}`,
    },
  });
  
  return response.json();
}
```

#### 4. Important Notes

**For Google Sign-In:**
- Use **iOS client ID** in `GoogleSignin.configure()` for iOS
- Android automatically uses client ID from SHA-1 certificate
- Backend receives `idToken` which needs to be verified using [Google's token verification](https://developers.google.com/identity/sign-in/web/backend-auth)

**For Apple Sign-In:**
- Only works on iOS 13+
- `identityToken` needs to be verified using Apple's public keys
- Email and name are only provided on **first sign-in**
- Backend must store name on first auth

**Security:**
- Store JWT in `react-native-keychain` (encrypted)
- Never log tokens or credentials
- Handle token expiration and refresh

---

## Security Considerations

1. **JWT Secret**: Use strong random secret (256+ bits)
2. **HTTPS Only**: Always use HTTPS in production
3. **Token Storage**: Store JWT securely (Keychain/Keystore)
4. **Session Expiry**: Sessions expire after 30 days by default
5. **Device Tracking**: IP and User-Agent logged for audit trail
6. **Account Linking**: Multiple OAuth providers can link to same email
7. **Logout**: Always provide logout option to users

---

## Testing

Use tools like Postman or curl to test the API:

```bash
# Start OAuth flow (will redirect to browser)
curl -L http://localhost:3000/auth/google/start

# Test protected endpoint
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/me

# Logout
curl -X POST -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/auth/logout
```
