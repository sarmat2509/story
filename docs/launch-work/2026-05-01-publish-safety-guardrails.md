# Publish safety guardrails

Date: 2026-05-01

## What changed

- Added a publish-time safety check before a story can become public or unlisted.
- Hidden stories are blocked from publishing.
- Incomplete stories with empty text are blocked from publishing.
- Stories without `policyChecks.textValidated === true` are blocked from publishing.
- Public catalog publishing checks final completed image assets when image validation is enabled.
- Public catalog publishing requires each completed image asset to have a persisted validation score strictly above `IMAGE_VALIDATION_MIN_ACCEPT_SCORE`, matching generation acceptance behavior.
- Added user-safe publish error codes: `STORY_HIDDEN`, `STORY_INCOMPLETE`, `STORY_TEXT_NOT_VALIDATED`, `IMAGE_VALIDATION_REQUIRED`, and `IMAGE_VALIDATION_FAILED`.

## Notes

- Unlisted sharing still requires validated text. Image-score gating is currently limited to public catalog publishing because existing unlisted flows may include older generated images without validation rows.
- This uses existing generation signals instead of adding a second moderation system: `policyChecks.textValidated` and `image_validation_results`.

## Verification

- Added direct coverage in `services/api/src/services/__tests__/storyPublishSafetyService.test.ts`.
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyPublishSafetyService.test.ts`
- `pnpm --filter wondertales-api build`
- Live API smoke: a parent-owned story with `policyChecks.textValidated = false` is rejected on public publish with `409 STORY_TEXT_NOT_VALIDATED`.
