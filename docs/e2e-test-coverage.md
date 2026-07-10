# Playwright e2e coverage

Актуальная матрица e2e-покрытия живёт здесь. Все команды запускаются из корня репозитория. `playwright.config.ts` сам собирает `@wondertales/shared` и поднимает web-версию приложения, если не выставлен `PLAYWRIGHT_START_SERVER=0`.

## Базовые команды

| Цель                                   | Команда                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| Весь e2e-suite                         | `corepack pnpm test:e2e`                                                                     |
| Headed mode                            | `corepack pnpm test:e2e:headed`                                                              |
| Playwright UI                          | `corepack pnpm test:e2e:ui`                                                                  |
| HTML report                            | `corepack pnpm test:e2e:report`                                                              |
| Запуск против уже поднятого приложения | `PLAYWRIGHT_START_SERVER=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:8082 corepack pnpm test:e2e` |

## Матрица покрытия

Сейчас покрыто 23 сценария в 11 spec-файлах.

| Зона                      | Что проверяет                                                                                                 | Spec                                                              | Точечный скрипт                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| Навигация                 | Authenticated desktop drawer routes, mobile tabs + more-menu, public stories tab bar                          | [navigation.spec.ts](../e2e/navigation.spec.ts)                   | `corepack pnpm test:e2e:navigation`          |
| Auth + onboarding         | Auth-store hydration keeps deep links, first child setup from mode selection                                  | [auth-onboarding.spec.ts](../e2e/auth-onboarding.spec.ts)         | `corepack pnpm test:e2e:auth-onboarding`     |
| Parent artisan wizard     | Parent wizard steps and submitted story payload contract                                                      | [artisan-wizard.spec.ts](../e2e/artisan-wizard.spec.ts)           | `corepack pnpm test:e2e:artisan-wizard`      |
| Instant photo story       | Image upload and instant story payload submission                                                             | [instant-upload.spec.ts](../e2e/instant-upload.spec.ts)           | `corepack pnpm test:e2e:instant-upload`      |
| Catalog filters           | Private library filters by audio/scenario/language; public catalog filters by audio/age/language/reading time | [catalog-filters.spec.ts](../e2e/catalog-filters.spec.ts)         | `corepack pnpm test:e2e:catalog-filters`     |
| Story viewer + publishing | Private story reading, generated-content report, parent approval gate for child-created publishing            | [story-viewer.spec.ts](../e2e/story-viewer.spec.ts)               | `corepack pnpm test:e2e:story-viewer`        |
| Child mode                | Child-safe navigation, disabled public stories, child wizard settings and child endpoint payload              | [child-mode.spec.ts](../e2e/child-mode.spec.ts)                   | `corepack pnpm test:e2e:child-mode`          |
| Child access controls     | Child-mode access settings, entering child mode, blocking parent-only direct routes                           | [child-access.spec.ts](../e2e/child-access.spec.ts)               | `corepack pnpm test:e2e:child-access`        |
| Characters                | Child-mode character creation + grid refresh, parent edit/delete flow                                         | [characters.spec.ts](../e2e/characters.spec.ts)                   | `corepack pnpm test:e2e:characters`          |
| Profile + parent gate     | Exit passcode update, return from child mode through parent gate, recovery link request                       | [profile-parent-gate.spec.ts](../e2e/profile-parent-gate.spec.ts) | `corepack pnpm test:e2e:profile-parent-gate` |
| Billing plans             | Currency switch and checkout start for an upgrade                                                             | [billing.spec.ts](../e2e/billing.spec.ts)                         | `corepack pnpm test:e2e:billing`             |

## Что ещё стоит покрыть

Высокий приоритет:

- Auth формы: login/register validation, forgot/reset password UI, OAuth callback success/error states.
- Profile/account settings: avatar upload, locale/theme changes, analytics consent, export/deletion requests.
- Child profile lifecycle: edit child data, child photo upload, child data deletion request, empty/limit states.
- Billing edge flows: hosted portal, success/cancel return routes, bundle purchase path, failed/disabled paid states, native RevenueCat entry points.
- Public stories: public story detail, share/report/rating paths, unlisted story route, author profile from catalog/story.
- Generation lifecycle UI: queue/progress/failure/retry/continuation/regeneration states, including graphic novel and map/artifact surfaces.
- Error/empty/loading states for navigation, library, characters, billing, story viewer, and wizard submit failures.
- Responsive regressions for wizard, library filters, story viewer, uploads, and billing on mobile-width viewports, beyond navigation alone.

Отдельно: admin screens и production smoke-проверки лучше держать отдельным e2e/runbook слоем, чтобы пользовательский Playwright-suite оставался быстрым и стабильным.
