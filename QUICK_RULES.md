# Quick Reference: WonderTales

Read this after `.cursorrules`.

## Always

- routes call services only
- services own orchestration and business logic
- repositories own database access
- middleware handles cross-cutting concerns only
- use `logger`, not `console.log`
- validate external input with `zod`
- update shared types when API contracts change

## Never

- import repositories in routes
- import `db` in routes
- import repositories in middleware
- import `db` in middleware
- put business logic in routes
- return Express responses from services

## Fast Review Checklist

- [ ] route -> service -> repository layering is intact
- [ ] no new direct DB access outside repositories
- [ ] input validation exists
- [ ] logging uses `logger`
- [ ] API response changes are reflected in shared/client types
- [ ] new DB tables/filters have indexes where needed

## New Session Reminder

Use `.cursor/agent_bootstrap.md` as the startup prompt for new sessions or agent settings.
