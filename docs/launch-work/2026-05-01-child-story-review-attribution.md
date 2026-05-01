# Child story review attribution

Date: 2026-05-01

## What changed

- Added child-mode attribution fields to `story_requests`:
  - `created_by_mode`
  - `created_by_child_profile_id`
  - `parent_review_required`
- Added child-mode attribution/review fields to `stories`:
  - `created_by_mode`
  - `created_by_child_profile_id`
  - `parent_review_status`
- Added a normalization service that:
  - defaults parent-created stories to `parent` and `not_required`
  - requires `createdByChildProfileId` for child-created stories
  - marks child-created stories as `pending` when parent review is required
- Wired attribution through story request creation, story stubs, story enrichment, direct story creation, and the instant character setup stub path.
- Added shared story/request API type fields for child attribution and review status.

## Safety notes

- Existing parent-created stories remain `created_by_mode = parent`.
- The child-safe generation endpoint is still not enabled; this change prepares the storage and async pipeline for it.
- Parent review workflow UI still needs a dedicated follow-up.

## Migration

- Applied `services/api/drizzle/0088_story_child_mode_review_fields.sql` in the dev API container.
- Migration is additive only and avoids `DROP`/`TRUNCATE`.

## Verification

- `pnpm exec tsx src/services/__tests__/storyCreationAttributionService.test.ts`
- `pnpm --filter @wondertales/shared build`
- `pnpm exec tsx src/scripts/checkMigrationFiles.ts`
- `pnpm build` in `services/api`
