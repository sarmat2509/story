# Quick Reference: Critical Rules

> Essential rules for WonderTales development. See `.cursorrules` for full details.

## 🚨 Critical "NEVER" Rules

1. **NEVER** use `lt()` for session expiry - use `gt()`
2. **NEVER** store OAuth tokens in plaintext - encrypt with AES-256-GCM
3. **NEVER** use `console.log` - use `logger` from `utils/logger.ts`
4. **NEVER** make multiple queries - use JOINs
5. **NEVER** use default secrets in production
6. **NEVER** skip input validation with Zod
7. **NEVER** skip rate limiting on endpoints
8. **NEVER** forget to clear intervals on shutdown
9. **NEVER** use `any` type - use proper TypeScript types
10. **NEVER** copy-paste code (>10 lines) - refactor to generic function

## ✅ Critical "MUST" Rules

### Security
- Encrypt: `encryptToken(token)` before DB save
- Validate: All inputs with Zod schemas
- Check expiry: `gt(sessions.expiresAt, new Date())`

### Database
- JOIN instead of multiple queries
- Use Drizzle operators: `eq()`, `gt()`, `and()`
- Add indexes for foreign keys and WHERE clauses

### Logging
```typescript
logger.info({ userId, action }, 'message');
logger.error({ err, context }, 'error message');
```

### Middleware Order
```
helmet → cors → rate limit → body parser → passport → routes → error handlers
```

### Resource Cleanup
```typescript
let intervalId: NodeJS.Timeout | null = null;
// Store IDs, clear on shutdown, handle SIGTERM/SIGINT
```

## 🔍 Code Review - 30 Second Check

- [ ] Drizzle operators (not `<` `>`)
- [ ] No plaintext sensitive data
- [ ] Zod validation on input
- [ ] `logger.*` (not console)
- [ ] Rate limiting applied
- [ ] Try-catch for errors
- [ ] Cleanup handlers
- [ ] No duplication >10 lines

## 📁 File Patterns

```
services/api/src/
├── config/          - Environment validation
├── db/              - Schema, connection pool
├── middleware/      - Auth, rate limit, errors
├── routes/          - Grouped by feature
├── services/        - Business logic (generic)
├── utils/           - Encryption, logger
└── index.ts         - App initialization
```

## 🎯 Common Fixes

### 3 Queries → 1 Query
```typescript
// Before
const session = await getSession(token);
const user = await getUser(session.userId);

// After
const [result] = await db
  .select({ session: sessions, user: users })
  .from(sessions)
  .innerJoin(users, eq(sessions.userId, users.id))
  .where(eq(sessions.token, token));
```

### Console → Logger
```typescript
// Before
console.error('Auth failed:', error);

// After
logger.error({ err: error, userId }, 'Auth failed');
```

### Duplication → Generic
```typescript
// Before: handleGoogleCallback + handleAppleCallback (150 lines each)

// After: Generic handleOAuthCallback (80 lines once)
```

---

**Full rules**: `.cursorrules`  
**Architecture docs**: `docs/architecture.md`  
**Review fixes**: `ARCHITECTURE_FIXES_COMPLETE.md`
