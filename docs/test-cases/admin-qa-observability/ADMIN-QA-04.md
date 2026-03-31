# ADMIN-QA-04 Проверка outfit plates и привязки outfitId
[Назад к index](../README.md)


- ID: `ADMIN-QA-04`
- Модуль: `Admin-панель как инструмент QA`
- Приоритет: `P1`

## Контекст

Этот файл не описывает отдельный регресс админки как продукта.

Его задача: подсказать QA, что можно посмотреть в <https://magic-sleep-time.duckdns.org/admin>, чтобы подтвердить работоспособность основного пользовательского функционала:

- создание и публикацию историй
- image validations
- генерацию и привязку environments
- генерацию и привязку outfit plates
- соответствие scene data тому, что пользователь видит в истории

## Как использовать

- Сначала выполните основной пользовательский сценарий в продукте.
- Потом откройте admin и используйте его как источник подтверждения состояния данных и пайплайна.
- Не заводите баг на admin как на отдельный продукт, если цель прогона была проверить основной пользовательский flow.
- Заводите дефект основного функционала, если admin показывает, что story, scene, validation, environment или outfit сформированы неверно.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Список историй в admin | <https://magic-sleep-time.duckdns.org/admin/stories> | Web-only: `Профиль` -> `Admin` или пункт `Admin` в меню |
| Детали истории в admin | `https://magic-sleep-time.duckdns.org/admin/stories/<storyId>` | В <https://magic-sleep-time.duckdns.org/admin/stories> нажать `Open story` |
| Список image validations | <https://magic-sleep-time.duckdns.org/admin/validations> | Открыть раздел `Admin / Validations` |
| Детали image validation | `https://magic-sleep-time.duckdns.org/admin/validations/<id>` | В <https://magic-sleep-time.duckdns.org/admin/validations> нажать `Open` |

## Предусловия

- Есть пользователь `ADMIN_USER` с ролью admin.
- Проверки выполняются в web-версии.
- Под рукой есть хотя бы одна недавно созданная история, которую QA проверяет в основном продукте.
- Для проверок публикации, environments и outfits удобнее использовать историю с несколькими сценами и минимум одним человеком среди персонажей.

## Что проверяем

У сцен и персонажей есть корректная связка между `outfitId` в camera composition и карточками outfit plates.

## Чеклист

- [ ] У сцен и персонажей есть корректная связка между `outfitId` в camera composition и карточками outfit plates.
- [ ] Во время выполнения сценария не возникает критических ошибок, сломанной верстки или необработанных состояний.

## Шаги проверки

1. Откройте `https://magic-sleep-time.duckdns.org/admin/stories/<storyId>`.
2. В блоке `CAMERA COMPOSITION` у персонажей найдите поле `outfitId`.
3. Нажмите на `outfitId`, если он отображается ссылкой.
4. Пролистайте до секции `Outfits`.
5. Сравните `outfitId`, `characterName`, описание и изображение outfit card с тем, как персонаж выглядит в пользовательской истории.

## Критерии приемки

- У сцен и персонажей есть корректная связка между `outfitId` в camera composition и карточками outfit plates.
- Во время выполнения сценария не возникает критических ошибок, сломанной верстки или необработанных состояний.
