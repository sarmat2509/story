# P0 Web Type-Check Fix

Date: 2026-05-01

## Roadmap Item

- `LAUNCH_ROADMAP.md` -> P0 "Build and CI Health"

## Changes

- Removed the unsupported React Native style property `textWrap` from `StoryCard` grid titles.
- Kept the visual title constraints through the existing `numberOfLines`, text shadow, and `maxWidth` settings.

## Verification

- `pnpm --filter wondertales-universal-app type-check` -> passed.

## Notes

- No database migration was needed.
- This only addresses the current web type-check blocker called out in the roadmap. API build and web build remain separate launch-gate checks.
