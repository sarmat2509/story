# Prompt Safety Pre-Queue Guard

## Scope

- Added deterministic prompt safety checks for user-provided story text before expensive generation jobs are accepted.
- Covered standard story creation, instant/photo story creation, story continuations, and manual scene image regeneration prompts.
- Added a service-level guard in `createStoryRequest` and `createContinuationRequest` so future route entrypoints still pass through the same pre-queue check.

## Behavior

- Unsafe prompts return `400 PROMPT_SAFETY_BLOCKED`.
- The response includes a safe category/source, but never echoes the original prompt text.
- Blocked decisions are logged with source, category, rule id, prompt length, and a short SHA-256 hash for support correlation without storing raw child/user prompt content.
- The guard runs before concurrent job limits, quota reservations, and queue insertion for the exposed creation routes.

## Covered Categories

- Child exploitation and child sexualization.
- Explicit sexual content.
- Self-harm.
- Graphic violence.
- Dangerous instructions.
- Hate or extremist content.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/promptSafetyService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyQuotaReservation.test.ts`
- `pnpm --filter wondertales-api exec tsx src/prompts/__tests__/directorPromptRules.test.ts`
- `pnpm --filter wondertales-api exec tsx src/domain/story/__tests__/storyDomainTextGeneration.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081/api/v1`: a temporary account received `400 PROMPT_SAFETY_BLOCKED` for an unsafe story prompt and was then deleted.
