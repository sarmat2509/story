# Playwright e2e coverage

Состояние на 2026-07-17: **45 tests в 13 spec-файлах**, последний полный прогон — **45/45 passed**.

Playwright проверяет web UI с декларативными API responses. Неизвестный API request немедленно проваливает test. Express status/schema проверяются отдельно в API contracts.

## Команды

| Цель | Команда |
| --- | --- |
| Весь e2e-suite | `pnpm test:e2e` |
| Headed mode | `pnpm test:e2e:headed` |
| Playwright UI | `pnpm test:e2e:ui` |
| HTML report | `pnpm test:e2e:report` |
| Уже поднятый web app | `PLAYWRIGHT_START_SERVER=0 PLAYWRIGHT_BASE_URL=http://127.0.0.1:8082 pnpm test:e2e` |

`playwright.config.ts` сам собирает `@wondertales/shared` и поднимает web-версию приложения, если `PLAYWRIGHT_START_SERVER` не равен `0`.

## Матрица покрытия

| Зона | Что проверяет | Spec |
| --- | --- | --- |
| Навигация | Authenticated desktop drawer, mobile tabs/more-menu, public stories tab | `navigation.spec.ts` |
| Auth + onboarding | Auth-store hydration/deep links и первая child setup | `auth-onboarding.spec.ts` |
| Parent artisan wizard | Полный parent wizard и completed story result | `artisan-wizard.spec.ts` |
| Instant photo story | Upload фотографии и completed Instant result | `instant-upload.spec.ts` |
| Creation modes | Parent/child Instant/Artisan routing, ограничения формы, сохранение mode при новой session | `creation-modes.spec.ts` |
| Catalog filters | Private/public filters по audio, scenario, language, age и reading time | `catalog-filters.spec.ts` |
| Story viewer | Private reading, content report, parent approval/publish и continuation fail → retry → processing → completed navigation | `story-viewer.spec.ts` |
| Child Mode | Family Series allow/deny и restricted child wizard | `child-mode.spec.ts` |
| Child access | Все parent-managed permissions, update controls, child-mode entry и блокировка прямого доступа | `child-access.spec.ts` |
| Parental outcomes | Story create/continue/public/free-text/audio/quiz/sibling/review flags в child UI | `parental-permissions.spec.ts` |
| Characters | Child create/grid refresh, parent edit/delete и mode-specific editor visibility | `characters.spec.ts` |
| Profile + parent gate | Exit passcode update, recovery и возврат из Child Mode | `profile-parent-gate.spec.ts` |
| Billing | Currency switch и checkout start | `billing.spec.ts` |

## Оставшиеся browser gaps

Высокий приоритет:

- Story creation: submit failure, retry, interrupted/stale polling и recovery после reload.
- Graphic novel/mixed story: progress, first-page readiness, failure/retry и final viewer.
- Map tiles/artifacts: reward modal, collect/idempotent collect, collection layout and collision UI.
- Auth: login/register validation, forgot/reset UI, OAuth callback success/error.
- Billing: portal, success/cancel return routes, bundle purchase, unavailable/failed paid states и native RevenueCat.
- Public surfaces: story detail, share/report/rating, unlisted route и author profile.
- Profile/child data: avatar/photo upload, locale/theme/consent, privacy export/deletion и limits/empty states.
- Error/loading/empty states для library, characters, billing и viewer.
- Responsive coverage для wizard, viewer, uploads и billing, кроме уже покрытой navigation.

Admin UI, deployment smoke и native-store flows следует держать отдельными e2e/runbook слоями, чтобы основной browser suite оставался быстрым.
