# Playwright e2e specs

Этот каталог содержит пользовательские e2e-сценарии для web-версии WonderTales. Полная матрица покрытия и список оставшихся gaps описаны в [docs/e2e-test-coverage.md](../docs/e2e-test-coverage.md).

## Запуск

| Цель          | Команда                         |
| ------------- | ------------------------------- |
| Весь suite    | `corepack pnpm test:e2e`        |
| Headed mode   | `corepack pnpm test:e2e:headed` |
| Playwright UI | `corepack pnpm test:e2e:ui`     |
| HTML report   | `corepack pnpm test:e2e:report` |

## Spec scripts

| Spec                                                             | Сценарии                                              | Скрипт                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| [navigation.spec.ts](./navigation.spec.ts)                       | Desktop drawer, mobile tabs/more menu, public tab bar | `corepack pnpm test:e2e:navigation`            |
| [auth-onboarding.spec.ts](./auth-onboarding.spec.ts)             | Auth hydration deep link, first child onboarding      | `corepack pnpm test:e2e:auth-onboarding`       |
| [artisan-wizard.spec.ts](./artisan-wizard.spec.ts)               | Parent artisan wizard and story payload               | `corepack pnpm test:e2e:artisan-wizard`        |
| [instant-upload.spec.ts](./instant-upload.spec.ts)               | Photo upload and instant story payload                | `corepack pnpm test:e2e:instant-upload`        |
| [catalog-filters.spec.ts](./catalog-filters.spec.ts)             | Private/public catalog filters                        | `corepack pnpm test:e2e:catalog-filters`       |
| [story-viewer.spec.ts](./story-viewer.spec.ts)                   | Reader, report modal, publish approval gate           | `corepack pnpm test:e2e:story-viewer`          |
| [child-mode.spec.ts](./child-mode.spec.ts)                       | Child-safe navigation and child wizard endpoint       | `corepack pnpm test:e2e:child-mode`            |
| [child-access.spec.ts](./child-access.spec.ts)                   | Access controls, child-mode entry, parent-route block | `corepack pnpm test:e2e:child-access`          |
| [characters.spec.ts](./characters.spec.ts)                       | Child create/refresh, parent edit/delete              | `corepack pnpm test:e2e:characters`            |
| [profile-parent-gate.spec.ts](./profile-parent-gate.spec.ts)     | Exit passcode, parent gate, recovery link             | `corepack pnpm test:e2e:profile-parent-gate`   |
| [billing.spec.ts](./billing.spec.ts)                             | Currency switch and checkout start                    | `corepack pnpm test:e2e:billing`               |
| [admin-validation-bbox.spec.ts](./admin-validation-bbox.spec.ts) | Protected BBox modal image rendering                  | `corepack pnpm test:e2e:admin-validation-bbox` |
