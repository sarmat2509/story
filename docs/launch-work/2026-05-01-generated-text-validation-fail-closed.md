# Generated Text Validation Fail-Closed

## Scope

- Changed story text validation so provider content-filter blocks are treated as validation failures, not safe passes.
- Covered both single-scene validation and the existing batch validation API.
- Added a final fail-safe in the orchestration validation loop: if scenes still fail after safety retries, the story request fails instead of saving visible text with `textValidated=true`.

## Behavior

- A provider validation block now produces a `content_policy` violation with `critical` severity.
- Failed scenes still go through the existing regeneration retry loop.
- If regeneration cannot clear validation failures within the configured retry count, the request is marked failed and the generated story text is not saved as validated content.
- Logs include scene ids and violation categories, without logging raw generated child-facing story text in the fail-safe warning.

## Verification

- `pnpm --filter wondertales-api exec tsx src/domain/story/__tests__/storyDomainTextGeneration.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/promptSafetyService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/prompts/__tests__/directorPromptRules.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyPublishSafetyService.test.ts`
- `pnpm --filter wondertales-api build`
