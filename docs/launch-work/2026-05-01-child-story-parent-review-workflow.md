# Child Story Parent Review Workflow

Date: 2026-05-01

## Scope

- Added parent review management for child-created stories that require adult approval.
- Kept the implementation on existing `stories.parent_review_status` and child-mode attribution fields; no migration was needed.

## Changes

- Added `PATCH /api/v1/stories/:id/parent-review` for parent sessions to approve or reject pending child-created stories.
- Added backend review state validation so only child-created pending stories can be reviewed.
- Added publish safety checks that block pending or rejected child-created stories from public or unlisted sharing.
- Added parent-review-approved predicates to public and unlisted story lookups.
- Included child attribution and parent review status in owner story summaries and manifests.
- Added review badges to library story cards.
- Added story-viewer review panel with approve/reject actions, blocked publish/share controls until approval, and localized status/toast copy.
- Added `storyParentReviewService` coverage and included it in `scripts/launch-gate.sh`.
- Updated `LAUNCH_ROADMAP.md` to mark parent review workflow UI and sharing guardrails as done.

## Verification

- `node -e '...JSON.parse...'` for all shared i18n JSON files.
- `pnpm --dir services/api exec tsx src/services/__tests__/storyParentReviewService.test.ts`
- `pnpm --dir services/api exec tsx src/services/__tests__/storyPublishSafetyService.test.ts`
- `pnpm --filter wondertales-api build`
- `pnpm --filter @wondertales/shared build`
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-universal-app build:web`
- `pnpm launch:gate`
- Chrome DevTools smoke on `http://localhost:8081/me/stories/review-story-1` with a mocked parent API session:
  - pending review panel rendered in the story viewer;
  - publish control was disabled while pending;
  - approve action changed the panel to approved and re-enabled publishing;
  - console had no errors after the mock API response shape was corrected.
- Chrome DevTools smoke on `http://localhost:8081/me/stories`:
  - library story card rendered the pending review badge;
  - console had no errors after the mock dictionary response shape was corrected.
- Docker logs checked after DevTools and launch gate:
  - `wondertales-api-dev` had normal shared-i18n hot-reload restarts and no application errors;
  - `wondertales-nginx-dev` returned successful page and bundle responses, with the known pre-existing IPv6 Metro upstream fallback noise still present before successful `200` responses.

## Remaining Related Work

- OAuth-only parent gate fallback remains the only local Child Mode P0 product gap.
- Production-domain OAuth, email, CSP, TLS, and post-deploy smoke checks remain outside this local workflow batch.
