# BILL-01 Страница тарифов для неавторизованного пользователя
[Назад к index](../README.md)


- ID: `BILL-01`
- Модуль: `Тарифы, биллинг и подписка`
- Приоритет: `P1`

## Что проверяем

Неавторизованный пользователь открывает локализованную SSR-страницу тарифов и с CTA тарифа попадает на локализованный `Welcome`, а не в checkout или закрытый сценарий.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Тарифы | <https://magic-sleep-time.duckdns.org/en/pricing> | Прямой URL локализованной pricing-страницы |
| Вход | <https://magic-sleep-time.duckdns.org/en/welcome> | CTA `Subscribe` на <https://magic-sleep-time.duckdns.org/en/pricing> |

## Предусловия

- Нет активной авторизованной сессии.

## Шаги проверки

1. Откройте <https://magic-sleep-time.duckdns.org/en/pricing> в чистой сессии браузера.
2. Убедитесь, что страница загрузилась без редиректа.
3. Зафиксируйте H1 `Pricing Plans` и subtitle `Choose the perfect plan for your family`.
4. Найдите любую карточку платного тарифа и нажмите CTA `Subscribe`.

## Ожидаемый результат

- Открывается страница `https://magic-sleep-time.duckdns.org/en/pricing` с H1 `Pricing Plans`.
- На странице виден subtitle `Choose the perfect plan for your family`.
- На карточках тарифов есть CTA `Subscribe`.
- Нажатие `Subscribe` переводит пользователя на экран `Welcome` по маршруту `https://magic-sleep-time.duckdns.org/en/welcome`.
- Пользователь не попадает в checkout, пустой экран или 404.
