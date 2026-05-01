# Generated Image Validation Gate

## Scope

- Changed generated image persistence so failing validation attempts are not saved as completed child-facing assets.
- Kept rejected/debug image persistence for support diagnostics, but blocked upload to the normal story asset path when validation is enabled and no attempt passes the configured score threshold.
- Changed scene image regeneration to keep the previous image until the replacement is successfully generated, validated, saved, and attached.

## Behavior

- With image validation enabled, only images with validation score strictly above `IMAGE_VALIDATION_MIN_ACCEPT_SCORE` are persisted as completed assets.
- Images with score at or below the threshold fail closed before asset upload.
- Image validation transport failures also fail closed before asset upload.
- Regeneration failures no longer delete the previous scene image first.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/computeValidationScore.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/assetAccessService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/buildExpectedCharactersForValidation.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyPublishSafetyService.test.ts`
- `pnpm --filter wondertales-api build`
