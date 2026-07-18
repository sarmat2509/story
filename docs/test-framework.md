# Тестовый фреймворк WonderTales

## Принцип

Тест вызывает существующий route/service/domain method и проверяет его вход и выход. Подменяются только внешние границы: AI provider, repository, storage, очередь или платёжный провайдер.

Внутри mock запрещены:

- выбор ответа через `prompt.includes(...)`;
- ветвление по бизнес-данным или номеру вызова;
- повторение production-валидации, расчётов и переходов статуса;
- замена самого проверяемого service/domain method.

AI mock — это строгая очередь заранее подготовленных данных. Каждый шаг задаёт точный endpoint (`text`, `structured`, `generate`, `edit`, `synthesize`) и `operation`. Неожиданный вызов, другая operation или неиспользованный fixture завершают тест ошибкой.

## Центральные AI mocks

Экспорты находятся в `services/api/src/testing/ai`:

- `MockTextProvider` — plain/structured LLM;
- `MockImageProvider` — generate/edit/batch images;
- `MockAudioProvider` — TTS;
- `MockAlignmentProvider` — forced alignment;
- `MockEmbeddingGenerator` — embeddings;
- `fixtures.ts` — валидные фиксированные ответы основных production-схем.

Минимальный шаблон:

```ts
const llm = new MockTextProvider().queueStructured('text_quiz_generate', mockStoryQuizPayload());

installAiServiceTestOverrides({ textProvider: llm });
try {
  const result = await productionService.generateQuiz(input);
  assert.equal(result.payload.activities.length, 9);
  assert.equal(llm.structuredRequests[0].operation, 'text_quiz_generate');
  llm.assertExhausted();
} finally {
  clearAiServiceTestOverrides();
}
```

Ответ fixture остаётся данными. Парсинг, нормализацию, policy checks, retries и итоговый результат выполняет production-код.

## HTTP contracts

Route tests запускают настоящий Express app на случайном локальном порту. Авторизация проходит через настоящий middleware и JWT. Для happy path разрешены фиксированные repository outputs через `installRepositoryTestOverrides`; route/service/domain logic не заменяется.

- `httpEndpointRegistryContract.test.ts` — все `200/200` mounted endpoints обязаны точно совпадать с explicit manifest и иметь существующий test owner.
- `clientApiAuthorizationContract.test.ts` — все `143/143` защищённых endpoints без токена должны вернуть `401`.
- `adminApiAuthorizationContract.test.ts` — все `46/46` admin-only endpoints с обычной authenticated user session должны вернуть `403`.
- `sessionModeAuthorizationContract.test.ts` — parent-only и strict child-only routes должны отвергать неправильный session mode с `403`.
- `publicClientApiContract.test.ts` — публичные frontend endpoints возвращают `200`.
- `coreGenerationHttpContract.test.ts` — story/graphic-novel/mixed-story create и representative `400/404` через production routes и queue boundary.
- `childModeGenerationHttpContract.test.ts` — Child Artisan, Child Instant и Parent Instant create через production routes; Instant policy deny проверяется отдельно.
- `childModeParentalPermissionsContract.test.ts` — реальные parental settings, scopes, public/family access и `403/429/200/201` outcomes.
- `storyAudioAlignmentHttpContract.test.ts` — audio/alignment create/read `200/202` и representative `400/404`.
- В этом же слое проверяются profile, artifacts, quiz, map tile, webhooks, health/ops, assets, SSR, session lifecycle и representative admin operations.

Полная матрица статусов и текущих gaps: `docs/api-test-coverage.md`.

## Защита от платных вызовов

`scripts/run-tests.mjs` всегда запускает тестовые процессы с `NODE_ENV=test` и очищенными AI credentials. Поэтому обычные команды не наследуют ключи из shell:

```bash
pnpm test:ai-mocked
pnpm test:api-contracts
pnpm test:infra-integration
pnpm test:components
pnpm test:e2e
pnpm test
```

Infrastructure test локально делает controlled skip, пока не задан `RUN_INFRA_INTEGRATION=1` вместе с отдельными `TEST_DATABASE_URL` и `TEST_REDIS_URL`. GitHub Actions поднимает PostgreSQL и Redis services и запускает этот режим реально.

Live story LLM integration не входит в обычный прогон и требует одновременно:

```bash
RUN_STORY_TEXT_LLM=1 ALLOW_PAID_AI_TESTS=1 <direct integration command>
```

Новый AI-вызов должен идти через factory в `services/aiService.ts` либо через отдельно зарегистрированную внешнюю границу, как embeddings. Прямое создание vendor provider в route/service/job делает вызов немокаемым и не допускается.

## Component и browser tests

`pnpm test:components` запускает Jest + React Native Testing Library только для `*.component.tsx`. Эти тесты рендерят настоящий component tree и проверяют conditional UI, accessibility state и локальный callback после press. Они не читают исходник регулярными выражениями и не вызывают API.

`pnpm test:e2e` проверяет Playwright-сценарии: что пользователь видит, куда переходит интерфейс и как он реагирует на click/tap/input. API здесь задаётся декларативными последовательностями готовых responses. Неизвестный API request обязан падать; browser test не проверяет Express status/schema и не повторяет request serialization, уже принадлежащие HTTP contracts.

Все пять release-gate слоёв — API, AI/worker, infrastructure, components и Playwright — запускаются в GitHub Actions до deploy.

## Добавление сценария

1. Найти production method и его provider `operation`.
2. Добавить статический валидный fixture в общий каталог либо рядом с узким domain test.
3. Поставить ответы в строгую очередь в фактическом порядке вызовов.
4. Вызвать production method или реальный HTTP endpoint.
5. Проверить результат и зафиксированный provider request.
6. Вызвать `assertExhausted()` и очистить overrides в `finally`.
7. Добавить сценарий в один из целевых scripts и обновить матрицу покрытия.
