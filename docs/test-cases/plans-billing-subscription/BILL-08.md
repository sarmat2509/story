# BILL-08 Paywall лимита историй в мгновенном режиме
[Назад к index](../README.md)


- ID: `BILL-08`
- Модуль: `Тарифы, биллинг и подписка`
- Приоритет: `P0`

## Что проверяем

В `Мгновенном режиме` пользователь с нулевым остатком историй получает paywall-модалку с CTA `Обновить план` вместо старта генерации.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Создание истории | <https://magic-sleep-time.duckdns.org/wizard> | Раздел `Создать` под `FREE_INSTANT_LIMIT_USER` |
| Профиль | <https://magic-sleep-time.duckdns.org/profile> | Раздел `Профиль` |
| Пользователи в admin | <https://magic-sleep-time.duckdns.org/admin/users> | Web-only: `Профиль` -> `Admin` -> `Admin / Users` |
| Тарифы | <https://magic-sleep-time.duckdns.org/pricing> | Экран после CTA `Обновить план` |

## Предусловия

- `FREE_INSTANT_LIMIT_USER`
- Есть одна валидная JPG или PNG фотография для загрузки в instant wizard.
- Используется только disposable-аккаунт из README.

## Setup

1. Под `ADMIN_USER` откройте <https://magic-sleep-time.duckdns.org/admin/users>.
2. Найдите `FREE_INSTANT_LIMIT_USER`, нажмите `Edit` и зафиксируйте исходное значение `Stories used this period`.
3. Установите `Stories used this period` так, чтобы в профиле пользователя отображалось `Осталось 0 сказок`.
4. Войдите под `FREE_INSTANT_LIMIT_USER`, откройте <https://magic-sleep-time.duckdns.org/profile> и убедитесь, что остаток историй равен `0`.

## Шаги проверки

1. Под `FREE_INSTANT_LIMIT_USER` откройте <https://magic-sleep-time.duckdns.org/wizard>.
2. Заполните instant wizard минимально валидными данными: загрузите фото и выберите обязательные поля до доступности кнопки создания.
3. Нажмите кнопку запуска генерации.
4. В paywall-модалке нажмите `Обновить план`.

## Ожидаемый результат

- После нажатия кнопки генерации не открывается progress-модалка и не стартует создание истории.
- На текущем экране появляется модалка с заголовком `Достигнут лимит историй`.
- В модалке отображается сообщение `Вы использовали {{used}} из {{limit}} историй в этом месяце.` или fallback `Лимит историй на этот месяц исчерпан.`.
- В модалке доступны CTA `Обновить план` и `Отмена`.
- Нажатие `Обновить план` переводит пользователя на маршрут `/pricing`, где открыт экран `Тарифы`.

## Cleanup

1. Под `ADMIN_USER` снова откройте `Edit` для `FREE_INSTANT_LIMIT_USER`.
2. Верните исходное значение `Stories used this period`, зафиксированное в setup.
3. Нажмите `Save`.
