# Story Generation API (Milestone 3)

## Overview

The Story Generation API enables creation of personalized, AI-generated bedtime stories for children. Stories are created asynchronously using Gemini API with age-appropriate content safety policies.

**Base URL:** `/api/v1/stories`

**Authentication:** Required (Bearer token)

## Key Features

- ✅ AI-powered story generation with Gemini 2.5 Flash
- ✅ Age-adaptive content (0-1, 1y, 2-3, 4-5, 6-8, 9-12)
- ✅ Multi-language support (Ukrainian, Russian, English, Spanish)
- ✅ Content policy engine with database-driven rules
- ✅ Asynchronous generation with progress tracking
- ✅ Scene-by-scene structure for future image generation (M4)
- ✅ Customizable story goals, tones, and scenarios

---

## Endpoints

### 1. Create Story Request

**POST** `/api/v1/stories`

Creates a new story generation request. The story is generated asynchronously.

#### Request Body

```json
{
  "childProfileId": "uuid",           // Optional: Link to child profile
  "uiLocale": "uk",                   // UI language: uk|ru|en|es|de|fr
  "storyLanguage": "uk",              // Story text language: uk|ru|en|es|de|fr
  "goal": "friendship",               // Optional: Story moral theme (from DB)
  "tone": "calm",                     // Optional: Story tone (from DB)
  "scenarioCardId": "lost_toy_find_with_friend",  // Optional: Scenario template (from DB)
  "userNotes": "сьогодні посварилась з подругою",  // Optional: Parent context (max 500 chars)
  "includeFamily": true,              // Optional: Include family members
  "selectedCharacters": ["uuid1"]     // Optional: Character IDs (max 5)
}
```

#### Response (201 Created)

```json
{
  "status": "success",
  "request": {
    "id": "uuid",
    "status": "pending",
    "progress": 0,
    "createdAt": "2026-01-26T10:00:00Z"
  }
}
```

#### Status Values

- `pending` - In queue
- `generating_outline` - Creating story structure
- `generating_text` - Generating full text
- `policy_check` - Content safety validation
- `completed` - Story ready
- `failed` - Generation error

---

### 2. Check Story Request Status

**GET** `/api/v1/stories/requests/:id/status`

Poll this endpoint to track generation progress.

#### Response (200 OK)

```json
{
  "status": "success",
  "request": {
    "id": "uuid",
    "status": "generating_text",
    "progress": 65,
    "storyId": null,          // Populated when completed
    "errorMessage": null,      // Populated if failed
    "createdAt": "2026-01-26T10:00:00Z"
  }
}
```

**Polling Recommendation:** Every 2-3 seconds until `status === 'completed'`

---

### 3. Get Story

**GET** `/api/v1/stories/:id`

Retrieve a completed story.

#### Response (200 OK)

```json
{
  "status": "success",
  "story": {
    "id": "uuid",
    "title": "Загублена зірка дружби",
    "language": "uk",
    "ageGroup": "6-8",
    "moralTheme": "friendship",
    "tone": "adventure",
    "scenes": [
      {
        "sceneId": 1,
        "text": "Одного ясного вечора...",  // Scene text (1-3 paragraphs)
        "visualPrompt": "Cozy bedroom at twilight...",  // For M4 image generation
        "imageUrl": null,              // Populated in M4
        "imageGeneratedAt": null
      }
    ],
    "fullText": "Одного ясного вечора...",  // Complete story for reading
    "wordCount": 650,
    "estimatedReadMinutes": 4,
    "outline": { /* ... */ },          // Story structure metadata
    "characters": [                    // Linked characters
      {
        "id": "uuid",
        "name": "Барсик",
        "type": "pet",
        "role": "companion"
      }
    ],
    "isFavorite": false,
    "createdAt": "2026-01-26T10:05:00Z"
  }
}
```

#### Story Structure (M3 with M4 Preparation)

Stories are stored scene-by-scene to enable:
- Sequential reading
- Per-scene image generation (M4)
- Audio chapter markers (M5)
- Interactive storytelling features

---

### 4. List Stories

**GET** `/api/v1/stories`

Get user's stories with filtering and pagination.

#### Query Parameters

- `child_profile_id` (optional) - Filter by child
- `language` (optional) - Filter by language (uk/ru/en/es/de/fr)
- `limit` (optional) - Max results (default: 20)
- `offset` (optional) - Pagination offset (default: 0)

#### Response (200 OK)

```json
{
  "status": "success",
  "stories": [
    {
      "id": "uuid",
      "title": "Загублена зірка дружби",
      "language": "uk",
      "ageGroup": "6-8",
      "wordCount": 650,
      "estimatedReadMinutes": 4,
      "isFavorite": false,
      "createdAt": "2026-01-26T10:05:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1
  }
}
```

---

### 5. Delete Story

**DELETE** `/api/v1/stories/:id`

Delete a story.

#### Response (200 OK)

```json
{
  "status": "success",
  "message": "Story deleted successfully"
}
```

---

## Story Configuration Endpoints

### Get Story Themes

**GET** `/api/v1/dictionaries/story-themes?locale=uk`

Get available story goals, tones, and scenario cards (database-driven).

#### Response (200 OK)

```json
{
  "status": "success",
  "data": {
    "goals": [
      {
        "slug": "friendship",
        "name": "Friendship",
        "description": "Building and maintaining friendships...",
        "minAge": 2
      }
    ],
    "tones": [
      {
        "slug": "calm",
        "name": "Calm & Soothing",
        "description": "Gentle, peaceful narrative...",
        "writingStyle": {
          "pacing": "slow",
          "emotionalIntensity": "low",
          "sensoryFocus": "soft sounds..."
        }
      }
    ],
    "scenarioCards": [
      {
        "id": "lost_toy_find_with_friend",
        "name": "scenario.lost_toy.name",     // i18n key (TODO M4)
        "description": "scenario.lost_toy.description",
        "icon": "🧸",
        "suggestedGoals": ["friendship", "help_parents"],
        "ageGroups": ["2-3", "4-5", "6-8"]
      }
    ]
  }
}
```

---

## Age-Adaptive Story Generation

Stories are automatically adapted based on child's age:

| Age Group | Scenes | Words | Max Sentence | Vocabulary | Themes |
|-----------|--------|-------|--------------|------------|--------|
| 0-1       | 3      | 100-200 | 8 words    | Simple     | Bedtime, family |
| 1y        | 3      | 150-250 | 10 words   | Simple     | Routines, animals |
| 2-3       | 4      | 200-350 | 12 words   | Basic      | Friendship, emotions |
| 4-5       | 5      | 300-500 | 15 words   | Basic      | Problem-solving |
| 6-8       | 6      | 500-800 | 18 words   | Intermediate | Mystery, teamwork |
| 9-12      | 7      | 800-1200 | 20 words  | Advanced   | Complex emotions |

---

## Content Safety Policy

All stories are validated against:

### Critical Rules
- ❌ No graphic violence or harm
- ❌ No scary/traumatizing content for young ages
- ❌ No sexual/romantic content
- ❌ No self-harm or severe mental health themes
- ❌ No dangerous instructions children might imitate
- ❌ No hate speech or discrimination
- ❌ No substance abuse

### Positive Requirements
- ✅ Must have happy, safe ending
- ✅ Show problem-solving through communication
- ✅ Include emotional validation
- ✅ Characters learn and grow
- ✅ Family/friends provide support

---

## Generation Flow

```
1. POST /api/v1/stories
   └─> Create request (status: pending)
       └─> Add to job queue

2. Background Processing
   ├─> Load policy profile from DB
   ├─> Generate outline with Gemini (status: generating_outline)
   │   └─> Validate outline against policy
   ├─> Generate text with Gemini (status: generating_text)
   │   └─> Validate text content
   └─> Save story (status: completed)

3. GET /api/v1/stories/requests/:id/status
   └─> Poll until status === 'completed'

4. GET /api/v1/stories/:storyId
   └─> Retrieve complete story
```

**Average Generation Time:** 10-30 seconds

---

## Error Handling

### Common Errors

**400 Bad Request**
```json
{
  "status": "error",
  "message": "Validation failed",
  "errors": [...]
}
```

**404 Not Found**
```json
{
  "status": "error",
  "message": "Story request not found"
}
```

**500 Server Error**
```json
{
  "status": "error",
  "message": "Failed to create story request"
}
```

### Policy Violations

If AI generates inappropriate content:
- Story request status → `failed`
- `errorMessage` contains violation details
- User can retry with different parameters

---

## Future Enhancements (Roadmap)

- **M4 (Image Generation):** Per-scene image generation with visual prompts
- **M5 (Audio):** Text-to-speech narration with prosody
- **M6+ (Features):**
  - Story series with continuity
  - Interactive story choices
  - Character consistency across stories
  - Share links for stories
  - PDF/Video export

---

## Technical Details

### AI Provider
- **Model:** Gemini 2.5 Flash
- **Output:** Structured JSON with schema validation
- **Cost:** ~$0.008 per story (with context caching: ~$0.005)
- **Retry Logic:** 2 retries for transient failures

### Job Queue
- **Type:** In-memory (M3 MVP)
- **Future:** Migrate to BullMQ/Redis for production
- **Concurrency:** 1 story at a time
- **Retention:** 1 minute for completed jobs

### Database
- **Configuration:** All goals, tones, policies, rules in database
- **Dynamic:** Content team can update without code changes
- **Seed Data:** 11 goals, 5 tones, 9 policy rules, 6 age groups, 10 scenarios

---

## Environment Variables

```bash
# Required for M3
GEMINI_API_KEY=your_gemini_api_key
AI_TEXT_VENDOR=gemini
AI_MODEL_VERSION=gemini-2.5-flash
AI_MAX_RETRIES=3
AI_TIMEOUT_MS=30000
```

---

## Example Usage

### Complete Story Creation Flow

```bash
# 1. Create story request
curl -X POST https://api.example.com/api/v1/stories \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "childProfileId": "uuid",
    "uiLocale": "uk",
    "storyLanguage": "uk",
    "goal": "friendship",
    "tone": "calm",
    "userNotes": "про друзів в садочку"
  }'

# Response: {"status": "success", "request": {"id": "req-uuid", "status": "pending"}}

# 2. Poll status (every 2-3 seconds)
curl https://api.example.com/api/v1/stories/requests/req-uuid/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response: {"status": "success", "request": {"status": "completed", "storyId": "story-uuid"}}

# 3. Get completed story
curl https://api.example.com/api/v1/stories/story-uuid \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response: Full story with scenes, text, metadata
```

---

**Last Updated:** January 26, 2026  
**Milestone:** 3 (AI Story Generation Engine)  
**Status:** ✅ Implemented & Ready for Testing
