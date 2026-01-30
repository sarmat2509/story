# Checkpoint-Based Retry Implementation - Verification Guide

## Summary

Successfully implemented checkpoint-based retry logic to prevent wasteful re-generation of expensive LLM calls when story generation fails at the database save step.

## Changes Made

### 1. Database Migration
- **File**: `services/api/drizzle/0013_add_story_request_intermediate_data.sql`
- **Action**: Added `intermediate_data` JSONB column to `story_requests` table
- **Status**: ✅ Migration applied successfully

### 2. Schema Update
- **File**: `services/api/src/db/schema.ts`
- **Action**: Added `intermediateData: jsonb('intermediate_data')` field to `storyRequests` table
- **Status**: ✅ Schema updated

### 3. Orchestration Logic
- **File**: `services/api/src/services/storyOrchestrationService.ts`
- **Changes**:
  - Added checkpoint restore logic at the start of `processStoryRequest()`
  - Added checkpoint save after outline generation
  - Added checkpoint save after text generation
  - Added checkpoint save after validation
  - Added checkpoint cleanup after successful story save
- **Status**: ✅ All checkpoints implemented

### 4. Package Scripts
- **File**: `services/api/package.json`
- **Action**: Added `db:migrate:intermediate` script for easy migration
- **Status**: ✅ Script added and tested

## How It Works

### Before (Wasteful)
```
Attempt 1: Outline ($) → Text ($$$) → Validation ($$) → Save (FAILS)
Attempt 2: Outline ($) → Text ($$$) → Validation ($$) → Save (FAILS)
Attempt 3: Outline ($) → Text ($$$) → Validation ($$) → Save (SUCCESS)
Total Cost: 3x, Total Time: ~3 minutes
```

### After (Efficient)
```
Attempt 1: Outline ($) → Text ($$$) → Validation ($$) → Save (FAILS)
           ↓ Checkpoint saved in DB
Attempt 2: [Restore from checkpoint] → Save (FAILS)
           ↓ Still has checkpoint
Attempt 3: [Restore from checkpoint] → Save (SUCCESS) → Clear checkpoint
Total Cost: 1x, Total Time: ~1 minute (67% savings)
```

## Checkpoint Structure

The `intermediate_data` JSONB field stores:
```typescript
{
  outline: EpisodeOutline,           // After outline generation
  spec: StorySpec,                   // Story specification (without policyProfile)
  selectedCharacters: CharacterData[], // User-selected characters
  text: EpisodeText,                 // After text generation
  mergedCharacters: CharacterData[], // After character merging
  validationComplete: boolean,       // After validation passes
  validatedText: EpisodeText         // Final validated text
}
```

## Testing Instructions

### Test 1: Simulate Database Failure

1. **Temporarily break `saveStory()` function**:
   ```typescript
   // In storyOrchestrationService.ts, around line 350
   const storyId = await saveStory(request, spec, outline, text, mergedCharacters, Date.now() - startTime);
   // Add before it:
   throw new Error('SIMULATED DB FAILURE FOR TESTING');
   ```

2. **Trigger story generation**:
   - Use the web UI or API to create a new story request
   - Watch the logs in Terminal 3

3. **Expected Behavior**:
   - First attempt: Generates outline, text, validation → Fails at save
   - Logs should show: `"Checkpoint saved"` for outline, text, and validation
   - Job processor retries (check Terminal 3)
   - Second attempt: Logs show `"Reusing existing outline from checkpoint"`
   - Logs show `"Reusing existing text from checkpoint"`
   - Logs show `"Reusing validated text from checkpoint"`
   - Still fails at save (because of simulated error)

4. **Verify in Database**:
   ```sql
   SELECT id, status, intermediate_data 
   FROM story_requests 
   WHERE id = '<your-request-id>';
   ```
   - Should see `intermediate_data` populated with outline, text, etc.

5. **Remove test error and verify success**:
   - Remove the `throw new Error(...)` line
   - Trigger hot reload: `touch services/api/src/index.ts`
   - Next retry should:
     - Restore from checkpoint (no regeneration)
     - Successfully save story
     - Clear `intermediate_data` (set to null)
     - Log: `"Checkpoints cleared after successful save"`

### Test 2: Verify No Checkpoints on Success

1. **Generate a new story** (without simulated errors)
2. **Check database**:
   ```sql
   SELECT id, status, intermediate_data 
   FROM story_requests 
   WHERE status = 'completed' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
3. **Expected**: All completed requests should have `intermediate_data = null`

### Test 3: Verify Cost Savings

1. **Monitor Gemini API calls**:
   - Search logs for: `"Generating structured content with Gemini"`
   - Count calls for outline, text, validation

2. **Without checkpoint** (3 retries):
   - Expected: ~24 Gemini calls (1 outline + 1 text + 6 validations) × 3

3. **With checkpoint** (3 retries):
   - Expected: ~8 Gemini calls (1 outline + 1 text + 6 validations) × 1
   - Subsequent retries: 0 Gemini calls (uses checkpoints)

## Logs to Look For

### Checkpoint Save
```
[timestamp] INFO: Checkpoint saved
    requestId: "..."
    checkpoint: "outline"
```

### Checkpoint Restore
```
[timestamp] INFO: Reusing existing outline from checkpoint
    requestId: "..."
```

### Checkpoint Clear
```
[timestamp] INFO: Checkpoints cleared after successful save
    requestId: "..."
    checkpoint: "cleared"
```

## Rollback Instructions (if needed)

If issues arise, rollback by:
1. Comment out checkpoint logic in `storyOrchestrationService.ts`
2. Set `intermediateData: null` for all in-progress requests:
   ```sql
   UPDATE story_requests 
   SET intermediate_data = null 
   WHERE status IN ('pending', 'processing');
   ```
3. Server will continue working without checkpoints

## Performance Impact

### Storage
- Each checkpoint: ~50-200KB (depending on story size)
- Cleared on success → minimal long-term storage impact
- Failed requests keep checkpoints for manual review/debugging

### Query Performance
- JSONB column indexed by default (PostgreSQL)
- No performance degradation expected
- Consider cleanup job for old failed requests (optional)

## Future Enhancements

1. **Stale Checkpoint Cleanup**:
   ```typescript
   // Run periodically (e.g., daily)
   UPDATE story_requests 
   SET intermediate_data = null 
   WHERE status = 'failed' 
   AND updated_at < NOW() - INTERVAL '24 hours';
   ```

2. **Checkpoint Expiry TTL**:
   - Add `checkpoint_created_at` timestamp
   - Auto-expire after X hours

3. **Multi-Node Support**:
   - Move checkpoints to Redis/external cache
   - Enable horizontal scaling

4. **Manual Retry from Checkpoint**:
   - Admin UI to view failed generations
   - Button to manually retry from checkpoint
   - Useful for transient failures (network, DB locks, etc.)

## Status

✅ **Implementation Complete**
✅ **Migration Applied**
✅ **Schema Updated**
✅ **Logic Implemented**
✅ **Server Restarted**
⏳ **Testing Pending** (awaiting user verification)

---

**Next Steps**: User should test the retry behavior as described above to confirm checkpoints are working correctly.
