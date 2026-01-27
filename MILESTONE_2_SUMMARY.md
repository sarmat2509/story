# Milestone 2: Backend - Plans System + Child Profiles

## Implementation Summary

This milestone implements a flexible, database-driven plans & features system with child profile management.

## ✅ Completed

### 1. Database Schema & Migration
- Created 7 new tables: `plans`, `features`, `plan_features`, `user_subscriptions`, `child_profiles`, `characters`, `usage_events`
- Migration file: `0003_add_plans_features_profiles_characters.sql`
- Seed data for 3 plans (Free, Premium, Family) with 11 features
- Automatic subscription initialization for existing users

### 2. Shared Constants
- `packages/shared/src/constants/childTraits.ts` - Child appearance/personality enums
- `packages/shared/src/constants/petTraits.ts` - Pet-specific trait enums
- `packages/shared/src/constants/humanTraits.ts` - Human character trait enums
- `packages/shared/src/constants/imaginaryTraits.ts` - Imaginary friend trait suggestions (UI only)

### 3. Validation Schemas (Zod)
- `CreateChildProfileSchema` / `UpdateChildProfileSchema` - Type-safe child profile validation
- `CreateCharacterSchema` / `UpdateCharacterSchema` - Discriminated union for type-specific character validation
  - Pet: breed, fur color/pattern, size (strict enums)
  - Human: age, hair, clothing (strict enums)
  - Imaginary: species, colors, magical features (free text with suggestions)

### 4. Service Layer
- **planService**: Plan/feature queries, subscription management, usage tracking
- **childProfileService**: CRUD operations with age calculation and feature limits
- **characterService**: Type-specific character management (no child linking in M2)

### 5. Middleware
- **featureMiddleware**: `requireFeature`, `requireFeatureLimit`, `requirePlan`, `requireFeatureValue`
- Protects API endpoints based on user's plan features

### 6. API Routes
- `GET /api/v1/plans` - List active plans (public)
- `GET /api/v1/entitlements` - Get user's subscription & features
- `GET /api/v1/dictionaries/character-traits?type=...` - Type-specific trait dictionaries (public)
- `GET/POST/PATCH/DELETE /api/v1/children` - Child profile CRUD with computed age data
- `GET/POST/PATCH/DELETE /api/v1/characters` - Character CRUD with type-specific validation

### 7. Integration
- Mounted all routes in `index.ts`
- Integrated subscription initialization in OAuth flow (`oauthService.ts`)
- Free plan automatically assigned to new users

## Architecture Highlights

### Type-Specific Character System
Characters have different trait structures based on `type` field:
- **Pet**: Validated with `PetAppearanceSchema` (breed, fur, size)
- **Family Member/Friend**: Validated with `HumanAppearanceSchema` (age, clothing, build)
- **Imaginary Friend**: Free text with suggestions for maximum creativity

### Dynamic Dictionaries
The `/api/v1/dictionaries/character-traits?type=...` endpoint returns different trait sets based on character type, enabling dynamic form generation in the frontend.

### Flat Character List
Characters are stored as a flat, family-wide list (no pre-linking to children). Story creation (Milestone 3+) will dynamically select characters per story.

## Database Seed Data

### Plans
1. **Free** (0 UAH/month): 1 story/day, 3 images, low quality, 1 child profile
2. **Premium** (100 UAH/month): 2 stories/day, 12 images, medium quality, 2 child profiles, series, premium voices
3. **Family** (179 UAH/month): 5 stories/day, 12 images, high quality, 4 child profiles, series, premium voices, PDF/video export

### Features
- Story limits: `stories_per_day`, `series_enabled`
- Media: `images_per_story`, `image_quality`, `audio_minutes_per_month`, `premium_voices`
- Export: `export_pdf`, `export_video`, `share_enabled`
- Premium: `story_from_drawing`, `child_profiles_limit`

## Next Steps

### Testing Required
Run manual tests with curl commands (see plan for full test suite):
```bash
# Test dictionaries
curl 'http://localhost:3000/api/v1/dictionaries/character-traits?type=child'
curl 'http://localhost:3000/api/v1/dictionaries/character-traits?type=pet'
curl 'http://localhost:3000/api/v1/dictionaries/character-traits?type=imaginary_friend'

# Test plans
curl http://localhost:3000/api/v1/plans

# Test authenticated endpoints (with JWT token)
curl http://localhost:3000/api/v1/entitlements -H "Authorization: Bearer <token>"
curl http://localhost:3000/api/v1/children -H "Authorization: Bearer <token>"
```

### Documentation Updates
- Update `README.md` with new API endpoints
- Create `docs/api/plans.md` - Plans system architecture
- Create `docs/api/children.md` - Child profiles API reference
- Create `docs/api/characters.md` - Characters API reference

### Migration Execution
Run the migration to create tables and seed data:
```bash
cd services/api
# Apply migration using your preferred method (Drizzle, psql, etc.)
```

## Files Created
- 4 constants files
- 1 migration SQL file
- 3 service files
- 1 middleware file
- 5 route files

## Files Modified
- `services/api/src/db/schema.ts` - Added 7 tables
- `packages/shared/src/schemas/index.ts` - Added validation schemas
- `services/api/src/index.ts` - Mounted new routes
- `services/api/src/services/oauthService.ts` - Subscription initialization

## Key Design Decisions

1. **birthDate over ageMonths**: Enables automatic aging, birthday features, and personalization
2. **Predefined Enums**: Ensures consistent AI prompts and better UX (dropdowns vs free text)
3. **Type-Specific Traits**: Relevant fields per character type with appropriate validation
4. **Free Text for Imaginary**: Maximum creativity ("райдужні рога", "хмаринка з очима")
5. **Flat Character List**: No pre-linking to children, dynamic selection during story creation
6. **Database-Driven Plans**: Change features without code deployment, enable A/B testing
