# Матрица тестового покрытия API и AI-запросов

Состояние на 2026-07-17. Документ описывает фактическое автоматизированное покрытие, а не только наличие route или UI mock.

## Результат аудита

| Слой | Фактический объём | Последний проверенный результат | Что гарантирует |
| --- | ---: | ---: | --- |
| Реестр HTTP endpoints | 200 routes | 200/200 представлены в manifest | Новый, удалённый или переименованный route ломает registry contract; у каждого route есть access class, ожидаемые статусы и test owner |
| Защищённые routes | 143 | 143/143 возвращают `401` без credentials | Базовая auth-защита всех явно защищённых endpoints |
| Admin-only routes | 46 | 46/46 возвращают `403` обычному пользователю | Role boundary для admin API |
| API/domain contracts | 44 test-файла | 44/44 passed | Настоящие Express routes или production domain/service methods с подменой внешних границ |
| AI/worker contracts | 22 test-файла | 22/22 passed | Production AI orchestration, validation/repair, persistence seams и worker state transitions без платных вызовов |
| PostgreSQL/Redis integration | 1 opt-in test | 1/1 passed; локально без env выполняется controlled skip | В CI — реальный PostgreSQL transaction/idempotency constraint и Redis TTL/delete |
| Component tests | 8 suites / 17 tests | 17/17 passed | Conditional UI и mutations для выбранных React Native компонентов |
| Playwright | 13 spec-файлов / 45 tests | 45/45 passed | Пользовательские web-сценарии с декларативными API responses |

Команды `test:api-contracts`, `test:ai-mocked`, `test:infra-integration`, `test:components` и `test:e2e` входят в GitHub Actions quality gate. CI поднимает PostgreSQL 16 и Redis 7 для infrastructure test.

## Как интерпретировать покрытие

- **HTTP contract** запускает настоящий Express app, middleware и route. Подменяются repository, queue, storage, payment или AI provider.
- **Domain/worker contract** вызывает production service/job method и проверяет его состояния и side effects.
- **Access-only** подтверждает `401`/`403`, но не доказывает успешный input-output сценарий конкретного endpoint.
- **Validator contract** подтверждает, что запрос дошёл до production validation и вернул ожидаемый `400`; это не happy path.
- **Playwright API mock** проверяет клиентский сценарий, но не Express implementation.
- **Infrastructure integration** использует настоящие PostgreSQL/Redis процессы, но пока не весь production schema/queue pipeline.

Поэтому наличие всех 200 routes в manifest не означает 200 happy-path contracts. Manifest защищает полноту учёта и назначает владельца теста; глубина владельца зависит от риска route.

## Что закрыто по системным областям

| Область | Покрытые production-сценарии | Остаток |
| --- | --- | --- |
| Route inventory и access | Exact discovery ↔ explicit manifest; `143/143` auth `401`; `46/46` admin-role `403`; parent/child session boundaries | Нет обязательного happy path для каждого из 200 endpoints; низкорисковые/admin mutations частично покрыты только access/validation |
| Auth и sessions | Register/login/password reset contracts; refresh current и legacy token; current/all logout; OAuth-unavailable response; Google start redirect; session and linked-provider management | Нет sandbox callback/token-exchange с реальными Google/Apple providers и нет email delivery integration |
| Child Mode | Parent/child scopes, policy flags, limits, mode switching, session creation, story create, public/family visibility | Нет реального multi-device session/revocation test и native client E2E |
| Story create | Normal, Child Mode и Instant create через Express; input failures; quota accounting; text validation/repair | Нет одного infrastructure test, который проходит HTTP → BullMQ → writer → image workers → PostgreSQL final story |
| Continuations | Parent/child authorization, series context, schedule/cancel/conflict, concurrent limit, request status; worker image-batch state; Playwright fail/retry/process/complete flow | Нет full queue lifecycle с настоящими Redis/BullMQ и DB repositories |
| Story images | Production generate → segmented validation → edit → revalidation → fallback → asset/validation persistence | Нет real object-storage/CDN integration и paid image-provider smoke в обычном gate |
| Graphic novels | Create/read/status; quota rollback; multi-page worker; panel generation/validation/edit/recompose; persistence | Нет infrastructure-level multi-page queue recovery test и browser failure/retry flow |
| Mixed stories | Create/input contract; script generation and shared comic renderer | Нет отдельного mixed-story persistence/restart lifecycle |
| Instant photo stories | Upload/analyze chain; consent and scope denials; identity/character analysis; turnaround; worker re-enqueue/idempotency | Нет object-storage integration и full Instant → final story infrastructure test |
| Audio/alignment | Create/cached/read/status; quota and plan errors; TTS persistence/cache; worker; prosody fallback; alignment generate/read | Нет real TTS/alignment/storage provider smoke in CI |
| Quiz | Generate/read/candidate/answer; missing/invalid cases; progress domain logic | Provider timeout/block/cache-force branches не полностью проверены через HTTP |
| Map tiles/artifacts | Generate/dry-run, collect/idempotency, ownership/collision, layout and lists; semantic artifact selection | Нет Playwright collection/layout lifecycle и real image/storage integration |
| Billing | Checkout/bundle/usage contracts; quota side effects; Stripe HMAC webhook; RevenueCat authorization | Нет Stripe/RevenueCat sandbox round trip, hosted portal return or native purchase E2E |
| Assets | Public artifact and voice sample; authenticated turnaround/photo ownership, missing and forbidden cases | Нет S3/Spaces signed delivery/CDN test |
| SSR/public web | Static SSR routes, blog ETag `304`, sitemap XML, missing/unlisted/author/blog/share-card `404`; public catalog/rating/rate-limit | Нет browser SEO/share-card visual regression or crawler smoke against deployment |
| Operations/admin | Health/public ops; detailed/queue/rate-limiter admin endpoints; representative runtime, discount and app-release success paths; all admin access boundaries | Большая часть admin CRUD/media/content-config/regeneration routes не имеет полноценного successful input-output contract |

## Наиболее важные оставшиеся пробелы

### P0 — инфраструктурный generation lifecycle

Добавить test harness с настоящими PostgreSQL + Redis + BullMQ workers:

1. `POST /api/v1/stories` создаёт request и quota event.
2. Writer job сохраняет текст и ставит image batch.
3. Image worker сохраняет scenes/assets и очищает intermediate state.
4. Request получает `completed`, story становится читаемой.
5. Повторная доставка job не удваивает quota/assets/events.
6. Worker restart между text и image stages продолжает, а не начинает pipeline заново.

Сейчас каждый production seam проверен отдельно, но не весь распределённый lifecycle в одном test.

### P0 — persistence и migration compatibility

Текущий infrastructure test использует временную quota table и Redis keys. Нужен отдельный CI job, который:

- применяет production migrations к пустой test database;
- запускает repository contracts против реальных таблиц;
- проверяет uniqueness/foreign keys для story requests, usage events, assets и generation state;
- по возможности проверяет upgrade с предыдущего schema snapshot.

### P1 — внешние sandbox contracts

Обычный gate правильно не делает платные вызовы. Нужен scheduled/manual smoke layer с отдельными credentials для:

- Stripe + RevenueCat sandbox;
- object storage and signed/public asset delivery;
- email provider;
- Google/Apple OAuth test apps;
- по одному минимальному AI/TTS/image/alignment provider request с budget guard.

Эти проверки не должны блокировать каждый pull request, но должны давать сигнал о provider/schema drift.

### P1 — глубина admin API

Manifest назначает owner всем 46 admin endpoints, однако `adminFunctionalHttpContract` даёт happy paths только representative operations. Следующий batch: app-release CRUD/media, content-config CRUD, privacy export/resolve, moderation/image validation actions и manual scene/page regeneration.

### P1 — browser error/empty states

Continuation failure/retry теперь покрыт. Остаются:

- initial story creation failure/retry and interrupted polling;
- graphic-novel generation/retry;
- map-tile/artifact collect/layout;
- auth callback errors, billing cancel/failure and public share/rating;
- admin screens and native RevenueCat flows.

## Правила для новых endpoints

Новый route считается учтённым только если:

1. Добавлен в `services/api/src/testing/httpEndpointManifest.ts` с `accessClass`, ожидаемыми статусами и `testOwner`.
2. Registry contract видит точное совпадение method/path с mounted Express routes.
3. Protected route входит в соответствующую `401`/`403` matrix.
4. Для create/mutate, billing, privacy, auth, generation, assets и admin actions добавлен route-specific happy/error contract.
5. Если route вызывает AI, queue, storage, payment или email, mock находится только на внешней границе.
6. Матрица обновлена, а нужный test pattern включён в package script и CI.

## Команды проверки

```bash
pnpm test:api-contracts
pnpm test:ai-mocked
pnpm test:infra-integration
pnpm test:components
pnpm test:e2e
```

Для реального infrastructure run локально нужны изолированные test services:

```bash
RUN_INFRA_INTEGRATION=1 \
TEST_DATABASE_URL=postgresql://wondertales_test:wondertales_test@127.0.0.1:5432/wondertales_test \
TEST_REDIS_URL=redis://127.0.0.1:6379 \
pnpm test:infra-integration
```

Никогда не направлять integration command на production database или Redis.
