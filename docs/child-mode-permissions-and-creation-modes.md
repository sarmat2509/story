# Child Mode: родительские разрешения и Instant/Artisan

Состояние проверки: 2026-07-15.

## Две независимые оси

`storyCreationMode` (`instant | artisan`) выбирает мастер создания и форму входных данных. Это UX-настройка аккаунта родителя или профиля ребёнка, а не серверное право доступа.

Реальные права детской сессии задают `childModeEnabled`, `childModeSettings` и scopes сессии. Поэтому тесты не должны считать, что режим Instant автоматически запрещает Artisan endpoint или наоборот: такой проверки в production API сейчас нет.

## Матрица родительских разрешений

| Настройка                   | Production-эффект                                                                       | HTTP contract                                                          | Playwright-владелец                                     |
| --------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `childModeEnabled`          | разрешает создать/сохранить детскую сессию; выключение отзывает сессии                  | parent PATCH/POST и отказ disabled-session                             | вход и выход из Child Mode                              |
| `storyGenerationEnabled`    | запрещает оба детских story creation flow                                               | `403` для `/stories/child-mode` и `/stories/instant`; allow-case `201` | Create скрыт/disabled или недоступен                    |
| `storyContinuationEnabled`  | запрещает продолжение истории ребёнком                                                  | deny `403`; positive `202` остаётся gap                                | кнопка продолжения появляется/исчезает                  |
| `publicStoriesEnabled`      | запрещает ребёнку public stories/authors                                                | child JWT: deny `403`, allow `200`                                     | пункт Stories и direct navigation                       |
| `dailyGenerationLimit`      | ограничивает новые истории/продолжения за день                                          | exhausted `429`                                                        | только видимое состояние лимита, если UI его показывает |
| `monthlyGenerationLimit`    | ограничивает новые истории/продолжения за месяц                                         | exhausted `429`                                                        | только видимое состояние лимита, если UI его показывает |
| `dailyAudioGenerationLimit` | ограничивает генерацию аудио за день                                                    | exhausted `429`                                                        | видимый результат действия в viewer                     |
| `allowedThemeSlugs`         | валидирует выбранную тему                                                               | disallowed `403`; allow-case в policy unit                             | Artisan wizard фильтрует темы                           |
| `allowedLanguageCodes`      | валидирует язык                                                                         | disallowed `403`; allow-case в creation contract                       | оба wizard показывают разрешённые языки                 |
| `allowedCharacterIds`       | валидирует выбранных персонажей; собственный child character имеет исключение           | disallowed `403`; self exception в policy unit                         | Artisan wizard фильтрует персонажей                     |
| `freeTextPromptsEnabled`    | запрещает непустые notes/free-text                                                      | notes `403`, empty input allowed                                       | Artisan скрывает/блокирует свободный текст              |
| `audioGenerationEnabled`    | запрещает детскую генерацию аудио                                                       | child deny `403`; общий audio success contract                         | audio action появляется/исчезает                        |
| `quizGenerationEnabled`     | запрещает детскую генерацию квиза                                                       | child deny `403`; общий quiz success contract                          | quiz action появляется/исчезает                         |
| `parentReviewRequired`      | созданная ребёнком история получает pending review и не публикуется до решения родителя | create attribution + publish denial `403`                              | viewer показывает состояние review/publish              |
| `allowSiblingCharacters`    | разрешает использовать персонажей других детей семьи                                    | deny `403`; allow-case в policy unit                                   | Artisan character chooser allow/deny                    |
| `allowSharedFamilyStories`  | добавляет `family_stories:read` и расширяет выборку историй семьи                       | session scopes + filtered read                                         | Series/library navigation deny/allow                    |

HTTP-тест вызывает настоящий Express route и production policy/service. Подменяются только repository, queue, storage и provider boundaries. Ожидание строится по status/body/наблюдаемому side effect; тест не повторяет правила policy.

Playwright не доказывает HTTP status и не вычисляет ответ из request body. Каждый scenario заранее задаёт API response и проверяет только видимую реакцию приложения на действие пользователя.

## Разница Instant и Artisan

| Область                 | Instant                                                                        | Artisan                                                          |
| ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Источник режима         | `user.mode` у родителя; `childProfile.storyCreationMode` у ребёнка             | те же поля                                                       |
| Экран                   | `InstantWizardScreen`                                                          | `WizardScreen`                                                   |
| Endpoint родителя       | `POST /stories/instant`                                                        | `POST /stories`, `/graphic-novels` или `/mixed-stories`          |
| Endpoint ребёнка        | `POST /stories/instant` с child session                                        | `POST /stories/child-mode`                                       |
| Основной ввод           | 1–5 загруженных фото, возраст, scenario, язык                                  | формат, тема/goal, язык, ребёнок, стиль, персонажи, notes        |
| Возраст в child session | берётся из активного профиля; ручной выбор скрыт                               | профиль ребёнка участвует в запросе                              |
| Форматы в child session | story                                                                          | Artisan UI также фиксирует story; comic/mixed недоступны ребёнку |
| Ручные персонажи        | UI запрещает создание/редактирование                                           | UI разрешает открыть character editor                            |
| Выбор детей             | активный профиль                                                               | у родителя selectable; у ребёнка только активный профиль         |
| Очередь                 | request помечается `intermediateData.instantMode`, начинается с photo analysis | сразу обычный text-generation flow                               |
| Родительские разрешения | применяются к child session независимо от режима                               | применяются к child session независимо от режима                 |

## Обязательные проверки режима

- Parent Instant открывает Instant wizard; Parent Artisan — Artisan wizard.
- Child Instant открывает Instant wizard, не показывает ручной возраст и manual character creation.
- Child Artisan открывает Artisan wizard, не показывает других детей и comic/mixed, но позволяет открыть character editor.
- После сохранения `user.mode` или `childProfile.storyCreationMode` следующий вход в Create открывает правильный wizard.
- Реальные HTTP success contracts проходят для Parent Artisan, Parent Instant, Child Artisan и Child Instant.
- Детские Instant и Artisan запросы одинаково подчиняются parental permissions; различается только вход и orchestration.
- Внешние photo/LLM/image/audio ответы берутся только из строгих data-only fixtures; неожиданный provider call завершает тест ошибкой.

## Результат Batch 3

- Real Express parental-permission contract: 23 cases — 16 deny и 7 allowed/observable.
- Real Express creation-mode contract: Parent Artisan, Parent Instant, Child Artisan и Child Instant имеют `201`; Child Instant дополнительно имеет policy deny `403`.
- Playwright: 10 child-visible permission outcomes, отдельный parent-controls flow и 6 Instant/Artisan scenarios. Полный browser suite: 42/42.
- React Native Testing Library: `CharactersScreen` реально рендерится для четырёх parent/child × Instant/Artisan combinations; manual character action проверяется через существующий callback/modal.
- Старые source-regex guards для Instant/Profile mode и instant photo input удалены после runtime-замены.

## Оставшиеся gaps и production-риски

- Positive continuation `202` для parent/child и сохранение `generationKind` ещё не имеют real HTTP contract.
- Child-specific daily/monthly story limit и daily audio limit применяются сервером (`429`), но UI не показывает корректный proactive state; story limit попадает в общий subscription paywall.
- При `publicStoriesEnabled=false` навигация скрывается и API отвечает `403`, но прямой client route `/stories` не имеет отдельного route guard.
- `audioGenerationEnabled=false` запрещает создание нового аудио; воспроизведение уже созданного аудио остаётся доступным.
- Instant route обещает hidden auto-created characters, но queue сейчас создаёт их с `isHidden: false`.
- Child Artisan UI запрещает comic/mixed creation, но continuation endpoint сохраняет исходный comic/mixed `generationKind`; ребёнок потенциально может продолжить доступную enhanced story.
- Нет цельного integration test всей Instant queue цепочки `photo groups → character reuse/create → turnaround → text queue`; отдельные сервисы этой цепочки покрыты строгими AI fixtures.
- Оставшиеся frontend source-regex tests требуют отдельной миграции в component/Playwright/pure-function layers и не учитываются как runtime coverage.

## Не считать покрытием

- regex/readFileSync-проверку production source вместо запуска компонента или route;
- Playwright assertion по request payload/status вместо видимого UI outcome;
- mock, который сам фильтрует characters/stories или вычисляет permission outcome из тела запроса;
- тестовую копию `assertChildStoryRequestAllowed` или логики выбора wizard.
