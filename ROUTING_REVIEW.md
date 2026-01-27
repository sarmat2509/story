# API Routing Review

## Executive Summary

**Status**: 🟡 Partially RESTful (6/10)

**Strengths**: 
- Clean resource grouping (`/auth`, `/me`, `/health`)
- Proper HTTP methods
- Good error handling

**Critical Issues**:
- ❌ Non-RESTful nested actions (`/logout/all`)
- ❌ Inconsistent resource naming (`/me` vs `/users/me`)
- ❌ Missing API versioning in routes
- ❌ OAuth verbs in URLs (`/google/start`)
- ⚠️ Mixed conventions for sub-resources

---

## Current Route Structure

### 1. Root Routes (`/`)
```
GET / → API info
```
✅ **Good**: Standard discovery endpoint

---

### 2. Health Routes (`/health`)
```
GET /health/health → Basic health check
GET /health/ready  → Readiness probe
GET /health/live   → Liveness probe
```

**Issues**:
- ❌ Redundant `/health/health` - should be `/health`
- ⚠️ Better: `/health`, `/health/ready`, `/health/live`

**Recommendation**:
```diff
- GET /health/health
+ GET /health
  GET /health/ready
  GET /health/live
```

---

### 3. Auth Routes (`/auth`)
```
GET  /auth/google/start          → OAuth redirect
GET  /auth/google/callback       → OAuth callback
POST /auth/google/token          → Mobile token exchange

GET  /auth/apple/start           → Apple redirect (501)
POST /auth/apple/callback        → Apple callback (501)
POST /auth/apple/token           → Mobile token exchange (501)

POST /auth/logout                → Logout current session
POST /auth/logout/all            → Logout all sessions ❌
POST /auth/refresh               → Refresh JWT
```

**Critical Issues**:

#### ❌ Issue 1: Non-RESTful nested actions
```
POST /auth/logout/all
```
**Problem**: `/all` is not a resource, it's an action modifier  
**REST Principle**: URLs should be nouns, actions in HTTP methods

**Recommendation**:
```diff
- POST /auth/logout/all
+ DELETE /auth/sessions         # Delete all sessions
+ DELETE /auth/sessions?all=true # Alternative with query param
```

#### ❌ Issue 2: OAuth verbs in URLs
```
/auth/google/start
/auth/google/callback
```
**Problem**: "start" is a verb, not RESTful  
**Industry Standard**: Most OAuth implementations use this pattern (Google, GitHub, etc.)

**Options**:
```
Option A: Keep as-is (industry convention)
  /auth/google/start
  /auth/google/callback

Option B: RESTful (but less intuitive for OAuth)
  POST /auth/sessions/google
  GET  /auth/callbacks/google

Option C: Hybrid (clearer intent)
  GET /auth/providers/google/authorize
  GET /auth/providers/google/callback
```

**Recommendation**: Keep current for OAuth (industry standard), but document clearly.

#### ⚠️ Issue 3: Logout as POST
```
POST /auth/logout
```
**Problem**: Logout is deleting a session, should be DELETE  
**Current**: Follows many APIs that use POST for logout

**Recommendation**:
```diff
- POST /auth/logout
+ DELETE /auth/sessions/current
+ DELETE /auth/sessions/:sessionToken

- POST /auth/refresh
+ POST /auth/sessions/refresh  # Or PUT /auth/sessions/current
```

---

### 4. User Routes (`/me`)
```
GET    /me                      → Get current user
PATCH  /me                      → Update profile
DELETE /me                      → Delete account

GET    /me/sessions             → List sessions
DELETE /me/sessions/:sessionToken → Revoke session

GET    /me/oauth                → List OAuth providers
POST   /me/oauth/link           → Link provider (501)
DELETE /me/oauth/:provider      → Unlink provider
```

**Critical Issues**:

#### ❌ Issue 1: `/me` instead of `/users/me`
```
/me
```
**Problem**: Not a standard REST resource  
**Industry**: Many APIs use `/me` (GitHub, Facebook), but it's not RESTful

**Recommendation**:
```diff
Option A: More RESTful
- /me
+ /users/me
+ /users/me/sessions
+ /users/me/oauth-providers

Option B: Keep /me (industry standard, simpler)
  /me  # Keep as-is, widely accepted pattern
```

#### ⚠️ Issue 2: Inconsistent sub-resource naming
```
/me/sessions         → plural ✅
/me/oauth            → singular ❌
```

**Recommendation**:
```diff
- /me/oauth
+ /me/oauth-providers  # or /me/oauth-identities

- /me/oauth/:provider
+ /me/oauth-providers/:provider
```

#### ⚠️ Issue 3: POST for link
```
POST /me/oauth/link
```
**Problem**: `/link` is a verb

**Recommendation**:
```diff
- POST /me/oauth/link
+ POST /me/oauth-providers  # Add new provider link
  Body: { provider: 'google', ... }
```

---

## RESTful Best Practices Compliance

### ✅ What You're Doing Right

1. **HTTP Methods**:
   - ✅ GET for retrieval
   - ✅ POST for creation
   - ✅ PATCH for partial updates
   - ✅ DELETE for deletion

2. **Resource Grouping**:
   - ✅ `/auth/*` for authentication
   - ✅ `/me/*` for user resources
   - ✅ `/health/*` for health checks

3. **Status Codes**:
   - ✅ 200 for success
   - ✅ 401 for unauthorized
   - ✅ 400 for bad request
   - ✅ 500 for server errors
   - ✅ 501 for not implemented

4. **JSON Responses**:
   - ✅ Consistent structure with `status`, `message`
   - ✅ Proper error messages

### ❌ What Needs Fixing

1. **Nested Actions** (Priority: HIGH):
   ```
   ❌ POST /auth/logout/all
   ❌ POST /me/oauth/link
   ```

2. **Resource Naming** (Priority: MEDIUM):
   ```
   ❌ /me/oauth (singular)
   ⚠️ /me (not technically RESTful)
   ❌ /health/health (redundant)
   ```

3. **Missing API Versioning** (Priority: HIGH):
   ```
   ❌ No version prefix
   Should be: /api/v1/auth, /api/v1/me
   ```

4. **Inconsistent Session Management** (Priority: MEDIUM):
   ```
   POST /auth/logout  → Should be DELETE /sessions/current
   POST /auth/refresh → Should be PUT /sessions/current
   ```

---

## Recommended Route Structure (RESTful)

### Option A: Full REST Compliance

```typescript
// API Root
GET /api/v1 → API info

// Health checks
GET /api/v1/health
GET /api/v1/health/ready
GET /api/v1/health/live

// Authentication & Sessions
POST   /api/v1/sessions              → Login (create session)
DELETE /api/v1/sessions              → Logout all sessions
DELETE /api/v1/sessions/current      → Logout current session
DELETE /api/v1/sessions/:id          → Logout specific session
PUT    /api/v1/sessions/current      → Refresh current session
GET    /api/v1/sessions              → List all user sessions

// OAuth (keep as exception - industry standard)
GET  /api/v1/auth/google/authorize   → OAuth redirect
GET  /api/v1/auth/google/callback    → OAuth callback
POST /api/v1/auth/google/token       → Mobile token exchange
GET  /api/v1/auth/apple/authorize
POST /api/v1/auth/apple/callback
POST /api/v1/auth/apple/token

// Current User
GET    /api/v1/users/me
PATCH  /api/v1/users/me
DELETE /api/v1/users/me

// User Sessions (nested resource)
GET    /api/v1/users/me/sessions
DELETE /api/v1/users/me/sessions/:id

// User OAuth Providers (nested resource)
GET    /api/v1/users/me/oauth-providers
POST   /api/v1/users/me/oauth-providers     → Link provider
DELETE /api/v1/users/me/oauth-providers/:provider

// Future: Other Users (admin)
GET    /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id
```

### Option B: Pragmatic (Keep `/me`, add versioning)

```typescript
// API Root
GET /api/v1 → API info

// Health checks (no version - infrastructure)
GET /health
GET /health/ready
GET /health/live

// Authentication
GET  /api/v1/auth/google/authorize
GET  /api/v1/auth/google/callback
POST /api/v1/auth/google/token
GET  /api/v1/auth/apple/authorize
POST /api/v1/auth/apple/callback
POST /api/v1/auth/apple/token

// Sessions
POST   /api/v1/sessions          → Login
DELETE /api/v1/sessions          → Logout all
DELETE /api/v1/sessions/current  → Logout current
PUT    /api/v1/sessions/current  → Refresh
GET    /api/v1/sessions          → List sessions

// Current User (keep /me shortcut)
GET    /api/v1/me
PATCH  /api/v1/me
DELETE /api/v1/me

// User Sub-resources
GET    /api/v1/me/sessions
DELETE /api/v1/me/sessions/:id

GET    /api/v1/me/oauth-providers
POST   /api/v1/me/oauth-providers
DELETE /api/v1/me/oauth-providers/:provider
```

---

## Migration Plan

### Phase 1: Critical Fixes (Breaking Changes)

```typescript
// 1. Add API versioning
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/me', userRoutes);
app.use('/api/v1', indexRoutes);

// Keep /health without version (infrastructure)
app.use('/health', healthRoutes);

// 2. Fix route paths
// routes/auth.ts
- router.post('/logout/all', ...)
+ router.delete('/sessions', ...)  // Delete all sessions

// routes/user.ts
- router.get('/oauth', ...)
+ router.get('/oauth-providers', ...)

- router.delete('/oauth/:provider', ...)
+ router.delete('/oauth-providers/:provider', ...)

- router.post('/oauth/link', ...)
+ router.post('/oauth-providers', ...)

// 3. Fix health route
// routes/health.ts
- router.get('/health', ...)
+ router.get('/', ...)  # Now accessed as /health (not /health/health)
```

### Phase 2: Consistency Improvements (Non-breaking)

```typescript
// Add proper RESTful session management
// routes/auth.ts
router.delete('/sessions/current', ...) // Better than POST /logout
router.put('/sessions/current', ...)    // Better than POST /refresh
router.get('/sessions', ...)            // List all sessions

// Deprecate old routes
router.post('/logout', ...) // @deprecated Use DELETE /sessions/current
router.post('/logout/all', ...) // @deprecated Use DELETE /sessions
router.post('/refresh', ...) // @deprecated Use PUT /sessions/current
```

### Phase 3: Full REST (Optional, Major Version)

```typescript
// Move /me to /users/me
app.use('/api/v2/users/me', userRoutes);
app.use('/api/v2/users', usersRoutes); // Future admin routes
```

---

## Code Quality Issues

### 1. console.log Still Present

```typescript
// auth.ts:106
console.error('Google OAuth callback error:', error);

// user.ts:27, 58, 84, etc.
console.error('Get user error:', error);
```

**❌ Violation**: `.cursorrules` requires structured logging

**Fix**:
```diff
- console.error('Google OAuth callback error:', error);
+ logger.error({ err: error }, 'Google OAuth callback failed');
```

### 2. Repeated Auth Checks

```typescript
// Every route handler:
if (!req.user) {
  res.status(401).json({...});
  return;
}
```

**Issue**: Redundant check (already done in `requireAuth` middleware)

**Fix**: Remove these checks, trust the middleware

---

## Recommendations Summary

### 🔴 MUST Fix (Breaking Changes Required)

1. **Add API versioning**:
   ```
   /auth/* → /api/v1/auth/*
   /me/*   → /api/v1/me/*
   ```

2. **Fix nested action routes**:
   ```
   POST /auth/logout/all → DELETE /api/v1/sessions
   ```

3. **Fix health route redundancy**:
   ```
   /health/health → /health
   ```

4. **Fix console.log violations**:
   ```
   Replace all console.* with logger.*
   ```

### 🟡 SHOULD Fix (Backwards Compatible)

1. **Rename resources for consistency**:
   ```
   /me/oauth → /me/oauth-providers
   /me/oauth/link → /me/oauth-providers (POST)
   ```

2. **Add RESTful session endpoints**:
   ```
   DELETE /sessions/current (better than POST /logout)
   PUT /sessions/current (better than POST /refresh)
   ```

### 🟢 COULD Consider (Future v2)

1. **Move `/me` to `/users/me`** (more RESTful but less intuitive)
2. **Restructure OAuth** (keep current - industry standard)

---

## Implementation Priority

1. **P0 - Immediate**: Fix console.log → logger (violates .cursorrules)
2. **P1 - Next Release**: Add API versioning (`/api/v1`)
3. **P2 - Next Release**: Fix `/logout/all` and resource naming
4. **P3 - Future**: Consider full REST restructure for v2

---

## Compliance Score

| Category | Score | Notes |
|----------|-------|-------|
| HTTP Methods | 9/10 | Correct usage, POST for logout debatable |
| Resource Naming | 5/10 | `/me`, `/logout/all` not RESTful |
| Versioning | 0/10 | Missing API version prefix |
| Status Codes | 9/10 | Proper usage throughout |
| Error Handling | 8/10 | Good structure, console.log issue |
| Sub-resources | 6/10 | Inconsistent naming (`/oauth` vs `/sessions`) |
| Industry Standards | 7/10 | OAuth follows standards, rest mixed |

**Overall: 6.1/10** - Good foundation, needs restructuring for production

---

**Created**: 2026-01-25  
**Reviewer**: Architecture Analysis  
**Next Review**: After versioning implementation
