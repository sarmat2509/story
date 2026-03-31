# BILL-07 Счетчик историй обновляется после генерации истории
[Назад к index](../README.md)


- ID: `BILL-07`
- Модуль: `Тарифы, биллинг и подписка`
- Приоритет: `P1`

## Что проверяем

После одной успешной генерации истории счетчик оставшихся историй в профиле уменьшается ровно на 1.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Профиль | <https://magic-sleep-time.duckdns.org/profile> | Раздел `Профиль` |
| Создание истории | <https://magic-sleep-time.duckdns.org/wizard> | Раздел `Создать` под `FREE_ARTISAN_LIMIT_USER` |
| Пользователи в admin | <https://magic-sleep-time.duckdns.org/admin/users> | Web-only: `Профиль` -> `Admin` -> `Admin / Users` |

## Предусловия

- `FREE_ARTISAN_LIMIT_USER`
- `CHILD_MINIMAL`
- `CHARACTER_PERSON`
- Используется только disposable-аккаунт из README.

## Setup

1. Под `ADMIN_USER` откройте <https://magic-sleep-time.duckdns.org/admin/users>.
2. Найдите `FREE_ARTISAN_LIMIT_USER` по email и нажмите `Edit`.
3. Зафиксируйте исходное значение `Stories used this period`.
4. Установите `Stories used this period = 0` и нажмите `Save`.
5. Войдите под `FREE_ARTISAN_LIMIT_USER`, откройте <https://magic-sleep-time.duckdns.org/profile> и зафиксируйте стартовое значение `N` из блока `Осталось {{stories}} сказок и {{audio}} аудиосказок`.

## Шаги проверки

1. Под `FREE_ARTISAN_LIMIT_USER` откройте <https://magic-sleep-time.duckdns.org/wizard>.
2. Создайте одну историю с минимально валидными данными, используя `CHILD_MINIMAL` и `CHARACTER_PERSON`.
3. Дождитесь успешного завершения генерации и появления новой истории в `Мои истории` или на экране чтения.
4. Вернитесь в <https://magic-sleep-time.duckdns.org/profile> и обновите экран.

## Ожидаемый результат

- До генерации в профиле отображается стартовое значение `N`, где `N > 0`.
- После одной успешной генерации блок подписки показывает `N-1` оставшихся историй.
- Количество оставшихся аудиосказок в том же блоке не меняется.
- Во время сценария не появляется paywall `Достигнут лимит историй`.

## Cleanup

1. Под `ADMIN_USER` снова откройте `Edit` для `FREE_ARTISAN_LIMIT_USER`.
2. Верните исходное значение `Stories used this period`, зафиксированное в setup.
3. Нажмите `Save` и убедитесь, что в таблице `Admin / Users` восстановлено исходное значение.
