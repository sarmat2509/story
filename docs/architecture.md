# Kazka+ Architecture

## System Overview

Kazka+ is a multi-tier SaaS application for generating personalized illustrated fairy tales with voice narration.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Client Layer                            │
├─────────────────────────────────────────────────────────────────┤
│  Mobile (React Native)  │  Web Landing (Next.js)  │  Web App    │
└──────────────┬──────────────────────────────────────────────────┘
               │
               │ HTTPS/REST
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                       API Gateway (Express)                      │
├─────────────────────────────────────────────────────────────────┤
│  Auth  │  Stories  │  Profiles  │  Series  │  Assets  │  Share │
└──────────────┬──────────────────────────────────────────────────┘
               │
       ┌───────┼───────┐
       │       │       │
┌──────▼───┐  │  ┌────▼─────────┐
│PostgreSQL│  │  │ Redis Cache  │
└──────────┘  │  └──────────────┘
              │
      ┌───────┴────────┐
      │                │
┌─────▼──────┐  ┌──────▼──────────┐
│AI Services │  │  Queue System   │
│  (Gemini,  │  │   (BullMQ)      │
│ ElevenLabs)│  └─────────────────┘
└────────────┘
      │
┌─────▼──────┐
│ S3 Storage │
│  (Assets)  │
└────────────┘
```

## Core Components

### 1. API Service (Express)

**Responsibilities:**
- REST API endpoints
- Request validation
- Authentication & authorization
- Rate limiting
- Error handling

**Technology:**
- Node.js + TypeScript
- Express framework
- Zod for validation
- JWT for authentication

**Key Modules:**
- `/config` - Environment and configuration
- `/routes` - API endpoint definitions
- `/middleware` - Auth, validation, error handling
- `/services` - Business logic
- `/models` - Data access layer

### 2. Shared Package

**Purpose:** Type safety and consistency across all services

**Contains:**
- TypeScript types and interfaces
- Zod validation schemas
- i18n translations (uk, ru, en, es)
- Shared utilities

**Why:** Ensures API contracts match between frontend and backend

### 3. AI Generation Pipeline

**Flow:**
```
Story Request
    ↓
Age Engine (analyze age group)
    ↓
Plot Assistant (generate scenario)
    ↓
Outline Generator (create scenes)
    ↓
Story Writer (write text)
    ↓
Safety Filter (validate content)
    ↓
Illustration Prompter (create prompts)
    ↓
Image Generator (create illustrations)
    ↓
TTS Engine (generate audio)
    ↓
Asset Packager (bundle everything)
```

**Async Processing:**
- Immediate: Request creation, outline generation
- Fast queue: First 1-3 illustrations (show user quickly)
- Slow queue: Remaining illustrations, full audio, PDF/video

### 4. Content Safety System

**Policy Engine:**
- Age-specific rules (PolicyProfile)
- Forbidden content detection
- Auto-repair mechanism
- Audit logging

**Validation Points:**
1. User input sanitization
2. Outline validation
3. Text content check
4. Illustration prompt filtering
5. Final asset review

### 5. Storage Strategy

**PostgreSQL:**
- User accounts and profiles
- Child profiles
- Story metadata and status
- Series/episodes continuity
- Usage limits and subscriptions
- Audit logs

**Redis:**
- Session storage
- Rate limiting counters
- Generation result cache
- Feature flags
- Job queue (BullMQ)

**S3 (Object Storage):**
- Generated illustrations (PNG/JPG)
- Audio files (MP3/AAC)
- PDF exports
- Video exports
- User-uploaded photos/drawings

## Data Models (Planned)

### Users & Authentication
```typescript
users: id, email, oauth_provider, oauth_id, created_at
oauth_identities: user_id, provider, provider_id, tokens
sessions: user_id, token, expires_at
```

### Children & Profiles
```typescript
child_profiles: id, user_id, name, age_months, age_group, language, ...
family_cast: child_id, type, name
pets: child_id, type, name
```

### Stories & Content
```typescript
story_requests: id, child_id, status, spec (JSONB), created_at
stories: id, request_id, language, text, metadata (JSONB)
scenes: story_id, scene_id, setting, text_start, text_end
assets: scene_id, type, url, metadata
```

### Series
```typescript
series: id, child_id, theme_arc, status
episodes: series_id, ep_number, story_id
continuity_state: series_id, facts (JSONB), used_elements (JSONB)
```

### Subscriptions & Limits
```typescript
subscriptions: user_id, plan, status, expires_at
usage_limits: user_id, resource_type, limit, used, reset_at
usage_events: user_id, event_type, cost, timestamp
```

## Security Architecture

### Authentication Flow
1. User initiates OAuth (Google/Apple)
2. Backend exchanges code for tokens
3. Create/lookup user in database
4. Issue JWT session token
5. Client stores token securely

### Authorization
- JWT validation middleware
- Role-based access control (future: admin panel)
- Resource ownership checks (user can only access their stories)

### Content Security
- Input sanitization
- Output validation
- SQL injection prevention (parameterized queries)
- XSS prevention (React escaping + CSP headers)
- CSRF protection (SameSite cookies)

### API Security
- Rate limiting (per user, per IP)
- CORS configuration
- Helmet.js security headers
- Request size limits
- Timeout protections

## Scalability Considerations

### Horizontal Scaling
- Stateless API servers (scale with load balancer)
- Redis for shared session state
- Queue-based async processing
- CDN for static assets

### Performance Optimizations
- Image CDN with caching
- Redis caching for:
  - Frequently accessed stories
  - Character sheets
  - Translation strings
- Database indexing strategy
- Connection pooling

### Cost Optimization
- Generation caching (same params → same result)
- Lazy loading (only generate what user views)
- Tiered image quality (low/medium/high)
- Batch generation for series

## Observability

### Logging
- Structured JSON logs
- Log levels: ERROR, WARN, INFO, DEBUG
- Correlation IDs for request tracing
- Sensitive data redaction

### Metrics
- API response times
- Generation latency
- Error rates
- Queue depths
- AI provider costs per story

### Monitoring
- Health checks
- Database connection pool status
- Redis connection status
- Queue worker status
- Storage usage

## Future Enhancements

### Phase 2
- Video generation (slideshow → animated)
- Advanced character consistency (LoRA/DreamBooth)
- Multi-voice dialogues
- PDF book export with professional layout

### Phase 3
- Print-on-demand integration
- Sticker pack generation
- Mobile app deep linking
- Social sharing optimizations

### Phase 4
- Admin dashboard
- Analytics and insights
- A/B testing framework
- Advanced personalization (ML recommendations)

## Development Principles

1. **Type Safety First**: TypeScript everywhere, Zod for runtime validation
2. **Fail Fast**: Validate early, fail loudly in development
3. **Observability**: Log everything that matters, measure what you optimize
4. **Cost Awareness**: Track AI API costs per generation
5. **User Privacy**: Minimize data collection, encrypt sensitive data, auto-delete uploads
6. **Graceful Degradation**: If high-quality fails, fall back to lower quality
7. **Idempotency**: Retries should be safe (job queue with deduplication)

## Technology Choices Rationale

**Why pnpm?** Faster than npm/yarn, efficient disk usage, strict dependency resolution

**Why Express?** Simple, mature, flexible, large ecosystem

**Why TypeScript?** Type safety prevents entire classes of bugs, great DX

**Why Zod?** Runtime validation that matches TypeScript types

**Why PostgreSQL?** Robust JSONB support for flexible schemas, mature ecosystem

**Why Redis?** Fast caching, proven queue system (BullMQ), atomic operations

**Why React Native?** Single codebase for iOS/Android, large community, near-native performance

---

Last updated: 2026-01-25 (Milestone 0)
