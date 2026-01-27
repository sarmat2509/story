# Plans & Features API

## Overview

Kazka+ implements a flexible, database-driven plans and features system that enables:
- Dynamic pricing tiers without code deployment
- Granular feature control per plan
- Usage tracking and limits
- Trial and promotional support (stub for Milestone 10)

## Architecture

### Core Tables

1. **`plans`** - Subscription tiers (Free, Premium, Family)
2. **`features`** - Available features (stories_per_day, images_per_story, etc.)
3. **`plan_features`** - Mapping of plans to features with values
4. **`user_subscriptions`** - User's current plan and usage counters

### Feature Types

1. **Boolean** - On/off features
   - Example: `export_pdf`, `premium_voices`, `series_enabled`
   - Value: `{ "enabled": true }`

2. **Numeric** - Quantified limits
   - Example: `stories_per_day`, `images_per_story`, `child_profiles_limit`
   - Value: `{ "limit": 5 }`

3. **Enum** - Selection from predefined options
   - Example: `image_quality`
   - Value: `{ "selected": "high", "options": ["low", "medium", "high"] }`

## API Endpoints

### GET /api/v1/plans

List all active plans with their features.

**Authentication:** None (public endpoint)

**Response:**
```json
{
  "status": "success",
  "plans": [
    {
      "id": "uuid",
      "slug": "free",
      "name": "Безкоштовний",
      "description": "Базовий план для знайомства з платформою",
      "priceMonthly": 0,
      "pricingCurrency": "UAH",
      "billingPeriod": "monthly",
      "sortOrder": 1
    },
    {
      "id": "uuid",
      "slug": "premium",
      "name": "Преміум",
      "description": "1-2 історії на день, 8-12 ілюстрацій, преміум голоси",
      "priceMonthly": 10000,
      "pricingCurrency": "UAH",
      "billingPeriod": "monthly",
      "sortOrder": 2
    },
    {
      "id": "uuid",
      "slug": "family",
      "name": "Сімейний",
      "description": "До 4 дітей, необмежені серії, експорт PDF",
      "priceMonthly": 17900,
      "pricingCurrency": "UAH",
      "billingPeriod": "monthly",
      "sortOrder": 3
    }
  ]
}
```

### GET /api/v1/entitlements

Get current user's subscription, features, and usage.

**Authentication:** Required (JWT)

**Response:**
```json
{
  "status": "success",
  "subscription": {
    "plan": {
      "slug": "free",
      "name": "Безкоштовний"
    },
    "status": "active",
    "trialEndsAt": null,
    "currentPeriodEnd": "2026-02-25T00:00:00Z"
  },
  "features": {
    "stories_per_day": {
      "type": "numeric",
      "limit": 1,
      "used": 0,
      "remaining": 1
    },
    "images_per_story": {
      "type": "numeric",
      "limit": 3
    },
    "image_quality": {
      "type": "enum",
      "selected": "low",
      "options": ["low", "medium", "high"]
    },
    "audio_minutes_per_month": {
      "type": "numeric",
      "limit": 10,
      "used": 2,
      "remaining": 8
    },
    "series_enabled": {
      "type": "boolean",
      "enabled": false
    },
    "premium_voices": {
      "type": "boolean",
      "enabled": false
    },
    "export_pdf": {
      "type": "boolean",
      "enabled": false
    },
    "share_enabled": {
      "type": "boolean",
      "enabled": true
    },
    "child_profiles_limit": {
      "type": "numeric",
      "limit": 1
    }
  },
  "resetAt": "2026-02-25T00:00:00Z"
}
```

## Feature Gating

### Middleware Protection

Use feature middleware to protect API endpoints:

```typescript
import { requireFeature, requireFeatureLimit } from '../middleware/featureMiddleware';

// Boolean feature check
router.post('/stories/:id/export/pdf',
  requireAuth,
  requireFeature('export_pdf'),
  async (req, res) => { /* ... */ }
);

// Numeric limit check
router.post('/stories',
  requireAuth,
  requireFeatureLimit('stories_per_day', 1),
  async (req, res) => { /* ... */ }
);

// Plan tier check
router.post('/premium-endpoint',
  requireAuth,
  requirePlan('premium'),
  async (req, res) => { /* ... */ }
);
```

### Service Layer Checks

Check features programmatically in service code:

```typescript
import * as planService from './planService';

// Check boolean feature
const hasExport = await planService.hasFeature(userId, 'export_pdf');
if (!hasExport) {
  throw new Error('PDF export not available in your plan');
}

// Check numeric limit
const { allowed, remaining } = await planService.checkUsageLimit(
  userId,
  'stories_per_day',
  1
);
if (!allowed) {
  throw new Error('Daily story limit reached');
}

// Get feature limit value
const maxChildren = await planService.getFeatureLimit(userId, 'child_profiles_limit');
```

## Plan Comparison

| Feature | Free | Premium | Family |
|---------|------|---------|--------|
| Stories/day | 1 | 2 | 5 |
| Images/story | 3 | 12 | 12 |
| Image quality | Low | Medium | High |
| Audio minutes/month | 10 | 120 | 300 |
| Story series | ❌ | ✅ | ✅ |
| Premium voices | ❌ | ✅ | ✅ |
| PDF export | ❌ | ✅ | ✅ |
| Video export | ❌ | ❌ | ✅ |
| Story from drawing | ❌ | ✅ | ✅ |
| Child profiles | 1 | 2 | 4 |

## Usage Tracking

Usage counters are stored in `user_subscriptions` table:
- `storiesUsed` - Tracks daily story creation
- `audioMinutesUsed` - Tracks monthly audio synthesis
- `resetAt` - When counters reset (monthly)

Counters automatically reset at the start of each billing period.

## Trial Support (Stub)

Database structure supports trials:
- `trialEndsAt` field in `user_subscriptions`
- `status` can be `trialing`

Full trial logic will be implemented in Milestone 10 (Payment Integration).

## Adding New Features

1. Insert into `features` table:
```sql
INSERT INTO features (slug, name, feature_type, default_value, category)
VALUES ('new_feature', 'New Feature', 'boolean', '{"value": false}', 'premium');
```

2. Add to plan mappings in `plan_features`:
```sql
INSERT INTO plan_features (plan_id, feature_id, value)
SELECT p.id, f.id, '{"enabled": true}'::jsonb
FROM plans p, features f
WHERE p.slug = 'premium' AND f.slug = 'new_feature';
```

3. Use in code:
```typescript
const hasFeature = await planService.hasFeature(userId, 'new_feature');
```

## Adding New Plans

1. Insert into `plans` table:
```sql
INSERT INTO plans (slug, name, description, price_monthly, sort_order)
VALUES ('pro', 'Pro Plan', 'Professional tier', 15000, 4);
```

2. Add feature mappings in `plan_features`

3. Plan appears automatically in `/api/v1/plans` endpoint

## Error Codes

- `403` - Feature not available in current plan
- `429` - Usage limit exceeded
- `402` - Plan upgrade required
- `404` - Plan/feature not found
