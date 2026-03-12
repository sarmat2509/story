# Plan: usage_events Fix + Wizard Options Analytics

## 1. Fix story_created in usage_events (Backend)

**Problem:** `usage_events` table is empty. `recordUsageEvent('story_created')` is only called in `createStoryRecord`, but the normal flow uses `createStoryStub` → `enrichStoryRecord`. `enrichStoryRecord` does NOT call `recordUsageEvent`.

**Files:**
- `services/api/src/services/storyOrchestration/storyRecords.ts`

**Change:** Add `recordUsageEvent('story_created')` to `enrichStoryRecord` after successful story enrichment (inside the try block, after the transaction).

```typescript
// After enrichStoryRecord transaction completes successfully
const { recordUsageEvent } = await import('../usageEventsService');
await recordUsageEvent(params.userId, 'story_created', 1, {
  childProfileId: params.childProfileId,
  metadata: { storyId },
});
```

**Note:** Avoid duplicate events — `createStoryRecord` already records it. `enrichStoryRecord` is the main path; `createStoryRecord` is only used for recovery when story is missing. No overlap.

---

## 2. Wizard Options Analytics (Frontend)

**Goal:** Track whether users use character selection, child profile, goals, image style, user notes, etc. in the wizard.

**Approach:** Fire `story_generation_started` when user clicks Generate, with all option flags. This event already exists in InstantWizardScreen; add it to WizardScreen.

### 2.1 WizardScreen (Artisan)

**File:** `apps/universal-app/src/screens/wizard/WizardScreen.tsx`

**Add** in `handleGenerate` (before `createStory.mutateAsync`):

```typescript
getAnalytics().capture('story_generation_started', {
  wizard_type: 'artisan',
  scenario_card_id: scenarioCardId ?? undefined,
  has_characters: selectedCharacters.length > 0,
  has_children: selectedChildren.length > 0,
  has_goal: selectedGoals.length > 0,
  has_image_style: !!imageStyle,
  has_user_notes: userNotes.trim().length > 0,
  has_child_profile: !!childProfileId,
  character_count: selectedCharacters.length,
  children_count: selectedChildren.length,
});
```

**Add** to `story_created` in `handleCloseModal` (optional — for correlation):

```typescript
getAnalytics().capture('story_created', {
  story_id: storyId,
  wizard_type: 'artisan',
  // Wizard options used when generation started (stored in ref if needed)
});
```

For `story_created` we don't have easy access to the original options at close time. Option A: store options in a ref when `handleGenerate` runs, pass to `story_created`. Option B: rely on `story_generation_started` for options usage — it fires at the same moment.

**Recommendation:** Use `story_generation_started` for options usage. No need to duplicate in `story_created` — we can correlate by user + timestamp in PostHog.

### 2.2 InstantWizardScreen

**File:** `apps/universal-app/src/screens/wizard/InstantWizardScreen.tsx`

**Already has:** `story_generation_started` with `scenario_card_id`, `has_photos`.

**Add** (optional): `age_group` if we want to track age group selection:

```typescript
getAnalytics().capture('story_generation_started', {
  wizard_type: 'instant',
  scenario_card_id: scenarioCardId ?? undefined,
  has_photos: photos.length > 0,
  age_group: ageGroup ?? undefined,  // e.g. '4-5', '6-7'
  photo_count: photos.length,
});
```

---

## 3. PostHog Insights / Dashboards

After deployment, create in PostHog:

1. **Wizard usage breakdown**
   - Event: `story_generation_started`
   - Breakdown by: `has_characters`, `has_children`, `has_goal`, `has_image_style`, `has_user_notes`
   - Filter: `wizard_type = 'artisan'`

2. **Character selection rate**
   - `has_characters = true` / total `story_generation_started` (artisan)

3. **Child profile usage**
   - `has_children = true` or `has_child_profile = true` / total

4. **Scenario card usage**
   - Breakdown by `scenario_card_id` for artisan wizard

5. **Instant wizard**
   - `has_photos` distribution
   - `photo_count` breakdown

---

## 4. Task Checklist

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 1 | Add `recordUsageEvent('story_created')` to `enrichStoryRecord` | `storyRecords.ts` | Small |
| 2 | Add `story_generation_started` to WizardScreen with option flags | `WizardScreen.tsx` | Small |
| 3 | Add `age_group`, `photo_count` to InstantWizardScreen `story_generation_started` | `InstantWizardScreen.tsx` | Small |
| 4 | Update PostHog docs with new event properties | `docs/posthog-dashboards-setup.md` | Small |

---

## 5. Event Schema (for reference)

### story_generation_started (Artisan)

| Property | Type | Description |
|----------|------|-------------|
| wizard_type | string | `'artisan'` |
| scenario_card_id | string? | Selected scenario card |
| has_characters | boolean | User selected at least one character |
| has_children | boolean | User selected at least one child as character |
| has_goal | boolean | User selected a moral goal |
| has_image_style | boolean | User selected image style |
| has_user_notes | boolean | User added custom notes |
| has_child_profile | boolean | User selected child profile (story for) |
| character_count | number | Number of characters selected |
| children_count | number | Number of children selected |

### story_generation_started (Instant)

| Property | Type | Description |
|----------|------|-------------|
| wizard_type | string | `'instant'` |
| scenario_card_id | string? | Selected scenario |
| has_photos | boolean | User uploaded photos |
| photo_count | number | Number of photos |
| age_group | string? | e.g. '4-5', '6-7' |
