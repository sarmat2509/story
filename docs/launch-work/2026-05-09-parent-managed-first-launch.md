# Parent-Managed First Launch Flow

## What Changed

- Replaced the old authenticated first-launch gate from global `instant` / `artisan` account mode selection to a parent-managed onboarding flow.
- New users now create the first child profile, choose that child's default story setup mode, then choose one of three next actions:
  - create a story as the parent for that child;
  - start Child Mode for that child;
  - add another child profile.
- Existing users are marked as already onboarded by migration, so the new flow does not interrupt current accounts.
- Story setup mode is now stored on `child_profiles.story_creation_mode`, with `instant` as the default and `artisan` retained as the internal value for the more detailed "Master Mode" flow.
- The wizard route can receive `childId` and `storyCreationMode`, so parent-created stories can open directly in the selected child's configured flow.
- Parent wizard screens now preselect the child passed through navigation. Child sessions continue to use the active child automatically.
- Removed the old global mode selector entry from Profile; story setup now belongs to child profiles instead of the parent account.
- Lightweight child profile creation is allowed during onboarding without requiring photos or AI description first. Turnaround generation still runs later when a profile has a reference photo or description.

## Data Model

- Added `users.onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE`.
- Added `child_profiles.story_creation_mode VARCHAR(20) NOT NULL DEFAULT 'instant'`.
- Added a check constraint for `story_creation_mode IN ('instant', 'artisan')`.
- Migration `0094_parent_managed_onboarding_and_child_story_mode.sql` marks existing users as `onboarding_completed = TRUE`.

## UX Notes

- The first launch is intentionally short: it asks only for child name, birth date, default story language, data consent, and default story setup.
- Child Mode launch still requires the parent-level exit passcode. If the passcode is missing, the onboarding CTA routes the parent to Profile to set it once for the whole family.
- "Master Mode" is display copy only for now. The persisted value remains `artisan` to avoid rewriting existing wizard logic.

## Follow-Up Ideas

- Add analytics around onboarding drop-off per step.
- Add a tiny child-profile summary card to the final step if visual reassurance is needed.
- Consider a first-story template suggestion after onboarding if empty-state activation needs a boost.
