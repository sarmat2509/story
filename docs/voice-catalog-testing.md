# Voice Catalog & Age Groups Testing Guide

## Testing Overview

This guide covers testing for the Voice Catalog and Age Groups Reference System (M5 Migration 0008).

## Prerequisites

1. **Database Migration Applied:**
   ```bash
   cd services/api
   npm run db:migrate
   psql $DATABASE_URL -f drizzle/0008_add_voice_catalog_and_age_groups.sql
   ```

2. **Voice Catalog Seeded:**
   ```bash
   npm run seed:voices
   ```

3. **Test User with Stories:**
   - Free plan user
   - Premium plan user (or upgrade test user)

## Manual Testing Checklist

### 1. Database Schema Verification

```bash
# Verify age_groups table exists
psql $DATABASE_URL -c "
  SELECT id, slug, name_key, min_months, max_months, sort_order 
  FROM age_groups 
  ORDER BY sort_order;
"

# Expected output: 5 rows (1y, 2-3, 4-5, 6-8, 9-12)
```

```bash
# Verify voice_age_groups junction table
psql $DATABASE_URL -c "
  SELECT v.name, ag.slug 
  FROM tts_voices v
  JOIN voice_age_groups vag ON v.id = vag.voice_id
  JOIN age_groups ag ON vag.age_group_id = ag.id
  ORDER BY v.name, ag.sort_order;
"

# Expected output: Voice names with associated age groups
```

```bash
# Verify stories.age_group_id migration
psql $DATABASE_URL -c "
  SELECT s.id, s.age_group, ag.slug, s.age_group_id 
  FROM stories s
  LEFT JOIN age_groups ag ON s.age_group_id = ag.id
  LIMIT 5;
"

# Expected: age_group (string) and age_group_id (UUID) should match via ag.slug
```

```bash
# Verify tts_voices new columns
psql $DATABASE_URL -c "
  SELECT name, language, role_type, voice_tags, 
         provider_preview_url IS NOT NULL as has_preview
  FROM tts_voices 
  WHERE is_active = true;
"

# Expected: role_type populated, voice_tags array, preview URL present
```

### 2. Voice Selection Logic Testing

#### Test A: Free Plan - Narrator Voice

```bash
# Create story for free user
curl -X POST http://localhost:3000/api/v1/stories \
  -H "Authorization: Bearer $FREE_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "childProfileId": "child-uuid",
    "language": "uk",
    "tone": "calm",
    "goal": "sleep"
  }'

# Generate audio (should auto-select narrator voice)
curl -X POST http://localhost:3000/api/v1/stories/{storyId}/tts \
  -H "Authorization: Bearer $FREE_USER_TOKEN"

# Check audio_assets record
psql $DATABASE_URL -c "
  SELECT voice_name, language FROM audio_assets 
  WHERE story_id = '{storyId}';
"

# Expected: Narrator voice selected automatically
```

#### Test B: Premium Plan - Narrator Voice (M6+ will test multi-voice)

```bash
# Upgrade user to premium or use premium user
curl -X POST http://localhost:3000/api/v1/stories \
  -H "Authorization: Bearer $PREMIUM_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "childProfileId": "child-uuid",
    "language": "uk",
    "tone": "calm",
    "goal": "adventure"
  }'

curl -X POST http://localhost:3000/api/v1/stories/{storyId}/tts \
  -H "Authorization: Bearer $PREMIUM_USER_TOKEN"

# Expected: Narrator voice selected (multi-voice in M6+)
```

#### Test C: Age Group Filtering

```bash
# Create story for different age groups
# Child: 18 months (1y age group)
curl -X POST http://localhost:3000/api/v1/stories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "childProfileId": "18mo-child-uuid",
    "language": "uk"
  }'

# Verify correct age group UUID assigned
psql $DATABASE_URL -c "
  SELECT s.id, ag.slug 
  FROM stories s
  JOIN age_groups ag ON s.age_group_id = ag.id
  WHERE s.id = '{storyId}';
"

# Expected: age_group_id matches '1y' slug

# Generate audio
curl -X POST http://localhost:3000/api/v1/stories/{storyId}/tts \
  -H "Authorization: Bearer $TOKEN"

# Verify voice selection respected age group
psql $DATABASE_URL -c "
  SELECT v.name, ag.slug 
  FROM audio_assets aa
  JOIN tts_voices v ON aa.voice_id = v.id
  JOIN voice_age_groups vag ON v.id = vag.voice_id
  JOIN age_groups ag ON vag.age_group_id = ag.id
  WHERE aa.story_id = '{storyId}';
"

# Expected: Voice suitable for '1y' age group
```

#### Test D: Explicit Voice ID Override

```bash
# Generate audio with explicit voice ID
curl -X POST http://localhost:3000/api/v1/stories/{storyId}/tts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"voiceId": "specific-elevenlabs-voice-id"}'

# Check audio_assets record
psql $DATABASE_URL -c "
  SELECT voice_name FROM audio_assets WHERE story_id = '{storyId}';
"

# Expected: Uses explicit voice ID, not auto-selected
```

### 3. Voice Catalog API Testing

```bash
# Get all voices
curl http://localhost:3000/api/v1/voices \
  -H "Authorization: Bearer $TOKEN"

# Expected: List of voices with provider_preview_url

# Filter by language
curl http://localhost:3000/api/v1/voices?language=uk \
  -H "Authorization: Bearer $TOKEN"

# Expected: Only Ukrainian voices
```

### 4. Backward Compatibility Testing

```bash
# Verify old age_group string column still exists
psql $DATABASE_URL -c "
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'stories' 
  AND column_name IN ('age_group', 'age_group_id');
"

# Expected: Both age_group (varchar) and age_group_id (uuid) present

# Verify both columns are consistent
psql $DATABASE_URL -c "
  SELECT s.age_group as old_string, ag.slug as new_slug
  FROM stories s
  JOIN age_groups ag ON s.age_group_id = ag.id
  WHERE s.age_group != ag.slug
  LIMIT 5;
"

# Expected: No rows (perfect consistency)
```

### 5. Edge Cases

#### Test E: No Voices for Language

```bash
# Try to generate audio for language without voices (e.g., Spanish if not seeded)
curl -X POST http://localhost:3000/api/v1/stories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"childProfileId": "child-uuid", "language": "es"}'

curl -X POST http://localhost:3000/api/v1/stories/{storyId}/tts \
  -H "Authorization: Bearer $TOKEN"

# Expected: 400 or 500 error with "No voice available for language: es"
```

#### Test F: Invalid Voice ID

```bash
curl -X POST http://localhost:3000/api/v1/stories/{storyId}/tts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"voiceId": "non-existent-voice-id"}'

# Expected: Falls back to auto-selection with warning logged
```

#### Test G: Missing Age Group

```bash
# Manually create story without age_group_id (shouldn't happen in prod)
psql $DATABASE_URL -c "
  UPDATE stories SET age_group_id = NULL WHERE id = '{storyId}';
"

curl -X POST http://localhost:3000/api/v1/stories/{storyId}/tts \
  -H "Authorization: Bearer $TOKEN"

# Expected: Should still work, skips age group filtering
```

## Automated Testing (Future)

### Unit Tests

```typescript
// tests/domain/audio/AudioDomainService.test.ts

describe('AudioDomainService - Voice Selection', () => {
  it('should select narrator voice for free plan', async () => {
    // Test free plan uses single narrator
  });
  
  it('should filter voices by age group', async () => {
    // Test age group filtering via junction table
  });
  
  it('should prefer non-premium voices', async () => {
    // Test free voice preference
  });
  
  it('should use explicit voice if provided', async () => {
    // Test voiceId override
  });
  
  it('should fallback if no age-matched voices', async () => {
    // Test graceful fallback
  });
});
```

### Integration Tests

```typescript
// tests/integration/audio-generation.test.ts

describe('Audio Generation E2E', () => {
  it('should generate audio with age-appropriate voice', async () => {
    // Create story → generate audio → verify voice selection
  });
  
  it('should respect user plan type', async () => {
    // Test free vs premium voice selection
  });
});
```

## Performance Testing

```bash
# Test voice selection query performance
psql $DATABASE_URL -c "
  EXPLAIN ANALYZE
  SELECT v.* 
  FROM tts_voices v
  INNER JOIN voice_age_groups vag ON v.id = vag.voice_id
  WHERE v.language = 'uk'
  AND v.is_active = true
  AND vag.age_group_id = (SELECT id FROM age_groups WHERE slug = '4-5');
"

# Expected: Query time < 10ms, uses indexes
```

## Rollback Plan

If critical issues found:

1. **Keep both columns**: Old `age_group` string still works
2. **Disable auto-selection**: Fall back to explicit voice IDs only
3. **Rollback migration** (last resort):

```sql
-- Rollback Script (use with caution)
ALTER TABLE stories DROP COLUMN age_group_id;
ALTER TABLE age_engine_rules DROP COLUMN age_group_id;
DROP TABLE voice_age_groups;
DROP TABLE age_groups;
ALTER TABLE tts_voices DROP COLUMN role_type;
ALTER TABLE tts_voices DROP COLUMN voice_tags;
ALTER TABLE tts_voices DROP COLUMN provider_preview_url;
```

## Success Criteria

✅ All age groups seeded correctly
✅ Voice-age associations created
✅ Voice selection respects age groups
✅ Free plan uses single narrator voice
✅ Explicit voice ID overrides work
✅ Backward compatibility maintained
✅ No breaking changes to existing stories
✅ API responses include new fields
✅ Query performance acceptable (<10ms)
✅ Linter errors from new code: 0

## Known Limitations

1. **Hardcoded age groups**: Still referenced in 37+ places (see `docs/age-group-refactoring-todo.md`)
2. **Multi-voice narration**: Not yet implemented (M6+)
3. **Voice samples**: Uses ElevenLabs preview only (no custom samples)
4. **Admin UI**: Voice management via seeding script only (admin UI in future milestone)

## Next Steps

1. Monitor production logs for voice selection patterns
2. Track cache hit rates after voice selection changes
3. Gather user feedback on automatic voice selection
4. Plan M6 multi-voice implementation
5. Plan admin UI for voice catalog management
