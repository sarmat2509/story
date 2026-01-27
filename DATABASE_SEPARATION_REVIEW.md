# Database Separation of Concerns Review

## Executive Summary

**Status**: 🟡 **Good but Needs Improvement** (7.5/10)

**Strengths**:
- ✅ Routes are clean - no direct DB queries
- ✅ Services layer well-implemented
- ✅ Clear service boundaries

**Issues**:
- ⚠️ Auth middleware violates separation (DB query in middleware)
- ⚠️ Business logic mixed with data access in oauthService
- ⚠️ No repository pattern (acceptable but could be better)
- ⚠️ Some services have multiple responsibilities

---

## Current Architecture

### Layered Structure (3-Tier)

```
┌─────────────────────────────────────┐
│   Routes (HTTP Layer)               │  ← Express handlers
│   - Validation                      │
│   - Response formatting             │
│   - HTTP concerns                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Services (Business Logic)         │  ← Core logic
│   - Business rules                  │
│   - Data transformation             │
│   - DB operations                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Database (Drizzle ORM)            │  ← Data access
│   - Schema                          │
│   - Queries                         │
└─────────────────────────────────────┘
```

---

## Layer Analysis

### ✅ Routes Layer (Excellent)

**Files**: `routes/auth.ts`, `routes/user.ts`, `routes/health.ts`

**Responsibilities** (Correct):
- HTTP request/response handling
- Input extraction from req.body/req.params
- Calling service methods
- Response formatting
- Error handling

**Evidence** - No direct DB imports in routes:
```bash
$ grep "import.*from.*'\.\.\/db'" routes/*.ts
# Only health.ts imports db utilities (acceptable for health checks)
routes/health.ts:import { checkDatabaseHealth, getPoolStats } from '../db';
```

**Example** (routes/user.ts):
```typescript
// ✅ Good - Routes only orchestrate
router.get('/', requireAuth, async (req, res) => {
  try {
    const userWithOAuth = await getUserWithOAuth(req.user!.id); // Service call
    res.json({ status: 'success', user: userWithOAuth });       // Response
  } catch (error) {
    logger.error({ err: error }, 'Get user failed');            // Logging
    res.status(500).json({ status: 'error', message: '...' });  // Error response
  }
});
```

**Score**: 9.5/10 (excellent separation)

---

### 🟡 Services Layer (Good with Issues)

**Files**: 
- `services/userService.ts` ✅
- `services/sessionService.ts` ✅
- `services/oauthService.ts` ⚠️
- `services/jwtService.ts` ✅

#### ✅ userService.ts (Excellent)

**Responsibilities**:
- CRUD operations for users
- User-OAuth relationship queries
- Data transformation (DTOs)

**Clear separation**:
```typescript
// Get user by ID
export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user || null;
}

// Business logic + data access
export async function getUserWithOAuth(id: string): Promise<UserWithOAuth | null> {
  const user = await getUserById(id);
  if (!user) return null;
  
  const identities = await db
    .select({ provider: oauthIdentities.provider, ... })
    .from(oauthIdentities)
    .where(eq(oauthIdentities.userId, id));
  
  return { ...user, oauthProviders: identities };
}
```

**Score**: 9/10

#### ⚠️ oauthService.ts (Mixed Responsibilities)

**Issue**: Combines business logic with data access

```typescript
async function handleOAuthCallback(...) {
  // 1. DB query - data access
  const [existingIdentity] = await db.select()
    .from(oauthIdentities)
    .where(...);
  
  if (existingIdentity) {
    // 2. DB update - data access
    await db.update(oauthIdentities).set({...});
    
    // 3. Another DB query - data access
    const [user] = await db.query.users.findMany({...});
    
    return { user, isNewUser: false, isNewIdentity: false };
  }
  
  // 4. Business logic - user lookup
  let user = await getUserByEmail(profile.email);
  
  // 5. Business decision - create user if needed
  if (!user) {
    user = await createUser({...});
  }
  
  // 6. DB insert - data access
  await db.insert(oauthIdentities).values(newIdentity);
  
  return { user, isNewUser, isNewIdentity: true };
}
```

**Problem**: This function does too much:
- Direct DB queries (lines 52-61)
- Business logic (account linking)
- Data transformation (encryption)
- Decision making

**Better approach**: Split into smaller functions or use repository pattern

**Score**: 6/10 (works but violates SRP)

#### ✅ jwtService.ts (Excellent)

Pure utility service - no DB access, single responsibility:
```typescript
export function generateToken(payload: TokenPayload): string { ... }
export function verifyToken(token: string): DecodedToken | null { ... }
```

**Score**: 10/10

---

### ❌ Middleware Layer (Violation)

**File**: `middleware/authMiddleware.ts`

**Critical Issue**: Middleware doing direct DB queries

```typescript
// ❌ Middleware should NOT do DB queries
export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  const decoded = verifyToken(token);
  
  // DB QUERY IN MIDDLEWARE - VIOLATION!
  const result = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, decoded.sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);
  
  if (!result.length) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  req.user = result[0].user;
  next();
}
```

**Problem**: 
- Middleware should orchestrate, not do data access
- Breaks separation of concerns
- Hard to test
- Violates single responsibility

**Should be**:
```typescript
// ✅ Middleware orchestrates services
export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  const decoded = verifyToken(token);
  
  // Use service method instead
  const session = await validateSessionWithUser(decoded.sessionId);
  
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  req.user = session.user;
  next();
}
```

**Score**: 3/10 (major violation)

---

## Missing Patterns

### ⚠️ No Repository Pattern

Currently services mix business logic with data access:

```typescript
// Current: Service does everything
export async function handleOAuthCallback(...) {
  const [existingIdentity] = await db.select()...  // Data access
  if (existingIdentity) {
    await db.update(oauthIdentities)...            // Data access
    // Business logic
  }
}
```

**Repository Pattern** would separate:

```typescript
// Repository: Pure data access
class OAuthRepository {
  async findByProvider(provider: string, providerId: string) {
    return db.select()...
  }
  
  async updateTokens(id: string, tokens: TokenData) {
    return db.update(oauthIdentities)...
  }
}

// Service: Pure business logic
export async function handleOAuthCallback(...) {
  const existingIdentity = await oAuthRepo.findByProvider(...);
  
  if (existingIdentity) {
    await oAuthRepo.updateTokens(existingIdentity.id, tokens);
    const user = await userRepo.findById(existingIdentity.userId);
    return { user, isNewUser: false };
  }
  // ...
}
```

**Pros of Repository Pattern**:
- ✅ Clear separation of data access from business logic
- ✅ Easier to test (mock repositories)
- ✅ Can swap ORM (Drizzle → Prisma) without changing services
- ✅ Centralized query logic

**Cons**:
- ❌ More boilerplate
- ❌ Extra abstraction layer
- ❌ Overkill for simple CRUD

**Recommendation**: Add repositories for complex domains (OAuth, Stories), keep simple services for basic CRUD (Users, Sessions)

---

## Violation Examples

### ❌ Violation 1: Middleware with DB Query

**File**: `middleware/authMiddleware.ts`

```typescript
// CURRENT - VIOLATION
const result = await db
  .select({ session: sessions, user: users })
  .from(sessions)
  .innerJoin(users, eq(sessions.userId, users.id))
  ...
```

**Should be**:
```typescript
// Add to sessionService.ts
export async function getSessionWithUser(sessionToken: string) {
  return await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(
      eq(sessions.token, sessionToken),
      gt(sessions.expiresAt, new Date())
    ))
    .limit(1);
}

// In middleware
const result = await getSessionWithUser(decoded.sessionId);
```

### ⚠️ Violation 2: Fat Service Method

**File**: `services/oauthService.ts:45-123`

The `handleOAuthCallback` function is 78 lines and does:
1. Find OAuth identity (DB)
2. Update tokens (DB)
3. Get user (DB)
4. Check for existing user by email (Business logic)
5. Create new user (DB + Business logic)
6. Create OAuth identity (DB)
7. Decision making (isNewUser, isNewIdentity)

**Should be split**:
```typescript
// Data access functions
async function findOAuthIdentity(provider, providerId) { ... }
async function updateOAuthTokens(id, tokens) { ... }

// Business logic functions
async function linkOrCreateUser(profile) {
  const existing = await getUserByEmail(profile.email);
  if (existing) return { user: existing, isNew: false };
  
  const newUser = await createUser(profile);
  return { user: newUser, isNew: true };
}

// Main orchestration
export async function handleOAuthCallback(...) {
  const identity = await findOAuthIdentity(...);
  
  if (identity) {
    await updateOAuthTokens(identity.id, tokens);
    return { user: identity.user, isNewUser: false };
  }
  
  const { user, isNew } = await linkOrCreateUser(profile);
  await createOAuthIdentity(user.id, provider, tokens);
  
  return { user, isNewUser: isNew, isNewIdentity: true };
}
```

---

## Recommendations

### Priority 1: Fix Middleware (MUST)

**Issue**: `authMiddleware.ts` has direct DB query

**Action**:
```typescript
// 1. Add to sessionService.ts
export async function getSessionWithUser(
  sessionToken: string
): Promise<{ session: Session; user: User } | null> {
  const [result] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.token, sessionToken),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);
  
  return result || null;
}

// 2. Update authMiddleware.ts
import { getSessionWithUser } from '../services/sessionService';

export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  const decoded = verifyToken(token);
  
  const result = await getSessionWithUser(decoded.sessionId); // Service call
  
  if (!result) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  
  req.user = result.user;
  req.sessionId = decoded.sessionId;
  next();
}
```

### Priority 2: Split Fat Service Methods (SHOULD)

**Issue**: `oauthService.handleOAuthCallback` does too much

**Action**: Refactor into smaller functions:
- `findOAuthIdentity()`
- `updateOAuthTokens()`
- `linkOrCreateUserForOAuth()`
- `createOAuthIdentity()`

### Priority 3: Consider Repository Pattern (COULD)

**For complex domains** (OAuth, Stories, later):
```typescript
// repositories/oauthRepository.ts
export class OAuthRepository {
  async findByProvider(provider: string, providerId: string) { ... }
  async create(data: NewOAuthIdentity) { ... }
  async updateTokens(id: string, tokens: TokenData) { ... }
  async deleteByUserAndProvider(userId: string, provider: string) { ... }
}

// services/oauthService.ts uses repository
const oauthRepo = new OAuthRepository();
const identity = await oauthRepo.findByProvider('google', profile.id);
```

**For simple CRUD** (Users, Sessions): Keep current approach

---

## Comparison: Current vs Ideal

### Current Architecture

```
Routes → Services (mixed logic + data access) → DB
         ↑
      Middleware → DB (VIOLATION!)
```

### Ideal Architecture (with repositories)

```
Routes → Services (pure business logic) → Repositories → DB
         ↑
      Middleware → Services → Repositories → DB
```

### Pragmatic Architecture (without repositories)

```
Routes → Services (business logic + data access) → DB
         ↑
      Middleware → Services (orchestrate) → DB
```

---

## Scoring by Layer

| Layer | Current | Issues | Target |
|-------|---------|--------|--------|
| Routes | 9.5/10 | None | 10/10 |
| Services | 7/10 | Fat methods, mixed concerns | 9/10 |
| Middleware | 3/10 | Direct DB queries | 9/10 |
| Repositories | 0/10 | Don't exist | N/A (optional) |

**Overall**: 7.5/10 (Good but needs fixes)

---

## Action Plan

### Phase 1: Fix Critical Issues (1-2 hours)

1. ✅ Move DB query from `authMiddleware` to `sessionService`
2. ✅ Update middleware to use service method
3. ✅ Add unit tests for new service method

### Phase 2: Refactor Fat Methods (2-3 hours)

1. ⚠️ Split `oauthService.handleOAuthCallback` into smaller functions
2. ⚠️ Extract data access functions
3. ⚠️ Keep business logic in main function

### Phase 3: Optional - Add Repositories (4-6 hours)

1. 🟢 Create `repositories/` folder
2. 🟢 Implement `OAuthRepository`, `UserRepository`
3. 🟢 Update services to use repositories
4. 🟢 Update tests

---

## Code Quality Rules for .cursorrules

```markdown
### Database Separation of Concerns

**MUST** follow strict layer separation:

#### Routes Layer
- **MUST** only handle HTTP concerns (request/response)
- **NEVER** import `db` directly
- **NEVER** write DB queries
- **MUST** call service methods for data operations

#### Services Layer
- **MUST** contain business logic
- **CAN** contain data access (for simple CRUD)
- **SHOULD** keep methods under 50 lines
- **SHOULD** split into smaller functions if >50 lines

#### Middleware Layer
- **NEVER** do direct DB queries
- **MUST** orchestrate through services
- **MUST** only handle cross-cutting concerns (auth, logging, rate limit)

#### Repository Pattern (Optional)
- **CONSIDER** for complex domains (OAuth, Stories)
- **NOT REQUIRED** for simple CRUD (Users, Sessions)
- **MUST** separate if service > 200 lines

### Examples

✅ **Good - Route delegates to service**:
```typescript
router.get('/me', requireAuth, async (req, res) => {
  const user = await getUserWithOAuth(req.user.id);
  res.json({ user });
});
```

❌ **Bad - Route does DB query**:
```typescript
router.get('/me', requireAuth, async (req, res) => {
  const user = await db.select().from(users).where(...);
  res.json({ user });
});
```

✅ **Good - Middleware uses service**:
```typescript
export async function requireAuth(req, res, next) {
  const result = await getSessionWithUser(token);
  req.user = result.user;
  next();
}
```

❌ **Bad - Middleware does DB query**:
```typescript
export async function requireAuth(req, res, next) {
  const result = await db.select().from(sessions).where(...);
  req.user = result[0].user;
  next();
}
```
```

---

**Created**: 2026-01-25  
**Status**: Review Complete  
**Priority Fixes**: 2 (middleware violation, fat service methods)  
**Estimated Effort**: 3-5 hours for all fixes
