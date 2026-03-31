# ADMIN-QA-07 Подготовка usage через admin для лимитных сценариев
[Назад к index](../README.md)


- ID: `ADMIN-QA-07`
- Модуль: `Admin-панель как инструмент QA`
- Приоритет: `P1`

## Контекст

Этот кейс нужен как QA-helper для сценариев лимитов и счетчиков. Его задача не проверить бизнес-логику лимита, а подготовить и затем восстановить usage тестового пользователя через UI admin.

## Что проверяем

QA может через `Admin / Users` изменить `Stories used this period` и `Audio stories used this period` у disposable-аккаунта и затем восстановить исходные значения.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Пользователи в admin | <https://magic-sleep-time.duckdns.org/admin/users> | Web-only: `Профиль` -> `Admin` -> `Admin / Users` |
| Профиль | <https://magic-sleep-time.duckdns.org/profile> | Раздел `Профиль` под подготовленным пользователем |

## Предусловия

- Есть пользователь `ADMIN_USER` с ролью admin.
- Проверка выполняется в web-версии.
- Используется только один disposable-аккаунт из README: `FREE_INSTANT_LIMIT_USER`, `FREE_ARTISAN_LIMIT_USER` или `PAID_AUDIO_USER`.

## Setup

1. Войдите под `ADMIN_USER` и откройте <https://magic-sleep-time.duckdns.org/admin/users>.
2. Найдите disposable-аккаунт по email.
3. До изменения значений зафиксируйте исходные значения колонок `Stories` и `Audio`.

## Шаги проверки

1. В строке нужного пользователя нажмите `Edit`.
2. Измените `Stories used this period` и/или `Audio stories used this period` на требуемые тестовые значения.
3. Нажмите `Save`.
4. Убедитесь, что в таблице `Admin / Users` обновились колонки `Stories` и `Audio`.
5. Войдите под этим же пользователем и откройте <https://magic-sleep-time.duckdns.org/profile>.
6. Обновите экран профиля один раз.

## Ожидаемый результат

- Новые значения usage сохраняются через UI admin без ручного обновления БД.
- После сохранения таблица `Admin / Users` показывает те же значения `Stories` и `Audio`, которые ввел QA.
- В профиле пользователя блок подписки показывает остаток, соответствующий новым usage-значениям.
- Изменение usage можно выполнить и откатить без побочных изменений роли, плана или других полей пользователя.

## Cleanup

1. Под `ADMIN_USER` снова откройте `Edit` того же пользователя.
2. Верните исходные значения `Stories used this period` и `Audio stories used this period`, зафиксированные в setup.
3. Нажмите `Save`.
4. Убедитесь, что в таблице и в профиле пользователя восстановились исходные значения.
