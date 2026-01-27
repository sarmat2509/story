# Child Profiles API

## Overview

Child profiles enable personalized storytelling with age-appropriate content, character descriptions, and family context.

## Key Features

- **Age Calculation**: Automatic age computation from `birthDate`
- **Birthday Detection**: Special stories on birthdays
- **Multi-language**: Support for bilingual children
- **Privacy Options**: Photo references OR structured traits
- **Feature Limits**: Enforced per plan (1 profile on Free, 2 on Premium, 4 on Family)

## Age Groups

Age groups determine story complexity and content:

| Age Group | Age Range | Months | Story Focus |
|-----------|-----------|--------|-------------|
| 0-1 | 0-11 months | 0-11 | Sensory, simple |
| 1y | 1 year | 12-23 | Basic emotions |
| 2-3 | 2-3 years | 24-47 | Simple plots |
| 4-5 | 4-5 years | 48-71 | Problem-solving |
| 6-8 | 6-8 years | 72-107 | Complex stories |
| 9-12 | 9-12 years | 108-180 | Advanced themes |

## API Endpoints

### GET /api/v1/children

List all child profiles for the authenticated user.

**Authentication:** Required (JWT)

**Response:**
```json
{
  "status": "success",
  "children": [
    {
      "id": "uuid",
      "name": "Оленка",
      "birthDate": "2019-03-15",
      "age": {
        "years": 6,
        "months": 10,
        "totalMonths": 82,
        "ageGroup": "6-8",
        "isBirthdayToday": false,
        "daysUntilBirthday": 48
      },
      "gender": "girl",
      "languages": ["uk", "ru"],
      "appearanceTraits": {
        "hairColor": "blonde",
        "hairStyle": "curly",
        "eyeColor": "blue",
        "skinTone": "light",
        "distinctiveFeatures": ["freckles", "dimples"]
      },
      "personality": {
        "traits": ["curious", "brave", "creative"],
        "favoriteActivities": ["reading", "drawing"]
      },
      "interests": ["dinosaurs", "space", "animals"],
      "sensitivities": {
        "fearLevel": "low",
        "commonFears": ["dark"],
        "avoidTopics": ["darkness"]
      },
      "familyCast": { "momName": "Мама", "dadName": "Тато" },
      "referencePhotos": [
        {
          "url": "https://...",
          "purpose": "face",
          "uploadedAt": "2026-01-25T..."
        }
      ],
      "isActive": true,
      "createdAt": "2026-01-25T...",
      "updatedAt": "2026-01-25T..."
    }
  ],
  "limit": 1,
  "canCreateMore": false
}
```

### POST /api/v1/children

Create a new child profile.

**Authentication:** Required (JWT)

**Feature Check:** Enforces `child_profiles_limit` from user's plan

**Request Body:**
```json
{
  "name": "Оленка",
  "birthDate": "2019-03-15",
  "gender": "girl",
  "languages": ["uk"],
  "appearanceTraits": {
    "hairColor": "blonde",
    "hairStyle": "curly",
    "eyeColor": "blue",
    "skinTone": "light",
    "distinctiveFeatures": ["freckles", "dimples"]
  },
  "personality": {
    "traits": ["curious", "brave"],
    "favoriteActivities": ["reading", "drawing"]
  },
  "interests": ["dinosaurs", "space"],
  "sensitivities": {
    "fearLevel": "low",
    "commonFears": ["dark"],
    "avoidTopics": ["darkness"]
  },
  "familyCast": { "momName": "Мама", "dadName": "Тато" }
}
```

**Validation:**
- `name`: 1-100 characters (required)
- `birthDate`: Valid date, not in future (required)
- `gender`: `girl`, `boy`, or `other` (optional)
- `languages`: 1-3 language codes from `['uk', 'ru', 'en', 'es', 'de', 'fr']` (required)
- `appearanceTraits`: All values must be from predefined enums (see dictionaries endpoint)
- `personality.traits`: Max 5, from `PERSONALITY_TRAITS` enum
- `personality.favoriteActivities`: Max 5, from `FAVORITE_ACTIVITIES` enum
- `interests`: Max 7, from `INTERESTS` enum
- `sensitivities.commonFears`: Max 5, from `COMMON_FEARS` enum
- `sensitivities.avoidTopics`: Max 5, from `AVOID_TOPICS` enum
- `familyCast`: Free text names, max 100 chars each

**Response:** `201 Created`
```json
{
  "status": "success",
  "child": {
    "id": "uuid",
    "name": "Оленка",
    "birthDate": "2019-03-15",
    "age": {
      "years": 6,
      "months": 10,
      "totalMonths": 82,
      "ageGroup": "6-8",
      "isBirthdayToday": false,
      "daysUntilBirthday": 48
    },
    ...
  }
}
```

**Errors:**
- `403` - Child profiles limit reached for your plan
- `400` - Validation failed (invalid enum values, missing required fields)

### PATCH /api/v1/children/:id

Update an existing child profile.

**Authentication:** Required (JWT)

**Ownership:** User must own the profile

**Request Body:** Same as POST, all fields optional

**Response:** `200 OK` with updated profile

**Errors:**
- `404` - Child profile not found
- `400` - Validation failed

### DELETE /api/v1/children/:id

Delete a child profile (soft delete).

**Authentication:** Required (JWT)

**Ownership:** User must own the profile

**Response:** `204 No Content`

**Errors:**
- `404` - Child profile not found

**Note:** This is a soft delete - `isActive` is set to `false`, data is not removed.

## Appearance Options

Parents have 3 options for describing their child's appearance:

### 1. Photo References (Best consistency)
```json
{
  "referencePhotos": [
    {
      "url": "s3://bucket/photo.jpg",
      "purpose": "face",
      "uploadedAt": "2026-01-25T..."
    }
  ]
}
```

Used for IP-Adapter/InstantID image generation.

### 2. Structured Traits (Privacy-friendly)
```json
{
  "appearanceTraits": {
    "hairColor": "blonde",
    "hairStyle": "curly",
    "eyeColor": "blue",
    "skinTone": "light",
    "distinctiveFeatures": ["freckles", "dimples"]
  }
}
```

All values from predefined enums.

### 3. No Description
Generic character appearance in stories.

## Age Calculation

Age data is computed dynamically from `birthDate`:

```typescript
{
  "age": {
    "years": 6,           // Full years
    "months": 10,         // Remaining months
    "totalMonths": 82,    // Total age in months
    "ageGroup": "6-8",    // Story complexity group
    "isBirthdayToday": false,
    "daysUntilBirthday": 48
  }
}
```

**Benefits:**
- Automatic age updates
- Birthday notifications
- Age-appropriate content adaptation
- "Тобі вже 7 років і 3 місяці!" personalization

## Dictionaries Endpoint

Get predefined constants for UI dropdowns:

```bash
GET /api/v1/dictionaries/character-traits?type=child
```

Returns all valid enum values for child profile fields.

See separate documentation for character traits dictionaries.

## Example Workflows

### Create Minimal Profile
```bash
curl -X POST http://localhost:3000/api/v1/children \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Оленка",
    "birthDate": "2019-03-15",
    "languages": ["uk"]
  }'
```

### Create Full Profile with All Details
```bash
curl -X POST http://localhost:3000/api/v1/children \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Оленка",
    "birthDate": "2019-03-15",
    "gender": "girl",
    "languages": ["uk", "ru"],
    "appearanceTraits": {
      "hairColor": "blonde",
      "hairStyle": "curly",
      "eyeColor": "blue",
      "skinTone": "light",
      "distinctiveFeatures": ["freckles"]
    },
    "personality": {
      "traits": ["curious", "brave", "creative"],
      "favoriteActivities": ["reading", "drawing", "nature"]
    },
    "interests": ["dinosaurs", "space", "animals", "magic"],
    "sensitivities": {
      "fearLevel": "low",
      "commonFears": ["dark"],
      "avoidTopics": ["darkness", "scary_creatures"]
    },
    "familyCast": {
      "momName": "Мама Оля",
      "dadName": "Тато Максим",
      "sibling": "Братик Артем"
    }
  }'
```

### Update Interests
```bash
curl -X PATCH http://localhost:3000/api/v1/children/<id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"interests": ["space", "robots", "science"]}'
```

## Feature Limits by Plan

| Plan | Child Profiles Limit |
|------|---------------------|
| Free | 1 |
| Premium | 2 |
| Family | 4 |

Attempting to create more profiles than allowed returns `403 Forbidden`.
