# Child Profile Deletion Anonymization

## Scope

- Changed child profile deletion for profiles already referenced by stories or story requests.
- Unused child profiles still hard-delete after storage cleanup.
- Used child profiles now delete reference/turnaround files, revoke child sessions, and replace profile data with a neutral tombstone instead of preserving child-specific data.

## Scrubbed Fields

- Name is replaced with `Deleted child profile`.
- Birth date is replaced with `1970-01-01` because the column is required.
- Languages become an empty array.
- Reference photos, turnaround sheet metadata, appearance traits, personality, interests, sensitivities, family cast, clothing, distinctive features, AI-generated description, translated description, and description language are cleared.
- `isActive` is set to `false`.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/childProfileService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/userDeletionService.test.ts`
- `pnpm --filter wondertales-api exec tsx src/services/__tests__/storyDeletionService.test.ts`
- `pnpm --filter wondertales-api build`
