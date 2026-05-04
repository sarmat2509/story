# Child Mode product refactor

## Implemented

- Removed the standalone Child Mode wizard screen from navigation and deleted the old `ChildModeScreen` view.
- Child sessions now use the same dashboard, story library, story viewer, character library, and wizard screens as parent sessions.
- Parent-only areas are hidden or blocked for child sessions: children profiles, child detail settings, tariff plans, profile, and story series.
- Child dashboard no longer fetches `/children` or links to child profile management.
- Public story navigation remains available to children unless the parent disables public stories in child access settings.
- The wizard defaults child sessions to the active child profile and hides parent-only child selection. Parent sessions still choose which child a story is for.
- Child story generation respects parent access controls: story generation, public story access, free text prompts, audio generation, theme/language/character allowlists, sibling character access, daily story limits, daily audio limits, and parent review before publishing.
- Child sessions can create stories with photo upload and request audio for their own stories when allowed.
- Child sessions can only read their own private stories. Sibling stories stay hidden unless they are publicly published.
- Parent sessions still see stories for all children.
- Characters are now scoped by `childProfileId`: parents see all characters, children see only their own, and parent-created characters are assigned to a child profile.
- Published stories can now have a child author. Child authors use child profile pseudonym/about fields and the front turnaround image as avatar.
- Child publish flow can save child author pseudonym/about-me before publishing.
- Child detail page was added with two tabs: profile settings and access settings.
- Children list page was simplified to profile cards that open the dedicated child detail page.
- Child profile deletion tombstone now clears child author public fields.

## Data model

- Added migration `services/api/drizzle/0091_child_authors_character_scope_and_child_access.sql`.
- New child profile columns: `author_pseudonym`, `author_about_me`, `child_mode_passcode_hash`, `child_mode_passcode_set_at`.
- New character column: `child_profile_id`.
- New story author columns: `author_type`, `author_child_profile_id`.
- Child mode default settings are now open by default for generation, audio, free text, public stories, and publishing without parent review.

## Verified locally

- Applied `0091_child_authors_character_scope_and_child_access.sql` to the local dev database.
- Browser QA through dev nginx (`http://localhost:8081/welcome`):
  - Parent login opens the normal dashboard.
  - Children list opens the dedicated child detail page.
  - Child detail has profile and access tabs.
  - Parent can set a child mode passcode, enable child mode, and enter a child session.
  - Child session uses the shared dashboard and wizard, with no parent child selector.
  - Child navigation hides children, profile, and tariff plan entry points.
  - Child characters page shows only the active child's scoped characters.
- API QA:
  - Child stories endpoint returns the active child's stories.
  - Child characters endpoint returns only active-child scoped characters.
  - Public stories return `403 CHILD_PUBLIC_STORIES_DISABLED` when disabled by parent settings.
  - Children management endpoint returns `403 PARENT_SESSION_REQUIRED` for child sessions.
- `pnpm --filter wondertales-universal-app type-check`
- `pnpm --filter wondertales-api build`
- `pnpm --filter @wondertales/shared build`
- `pnpm exec tsx src/services/__tests__/childStoryAccessService.test.ts`
- `pnpm exec tsx src/services/__tests__/childModeControlsService.test.ts`
- `pnpm exec tsx src/services/__tests__/childModePolicyService.test.ts`
- `git diff --check`

## Remaining follow-up

- Decide whether child sessions should be allowed to edit their author profile outside the publish dialog.
- Optionally add integration tests for child story publish, child author public profile, and child-scoped character CRUD.
