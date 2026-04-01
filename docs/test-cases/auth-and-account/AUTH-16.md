# AUTH-16 Локализованные CTA на лендинге
[Назад к index](../README.md)


- ID: `AUTH-16`
- Модуль: `Авторизация и аккаунт`
- Приоритет: `P2`

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Локализованный лендинг | <https://magic-sleep-time.duckdns.org/en/> | Открыть языковую версию лендинга напрямую |
| Локализованный вход | <https://magic-sleep-time.duckdns.org/en/welcome> | CTA `Create your first story` на <https://magic-sleep-time.duckdns.org/en/> |
| Локализованные тарифы | <https://magic-sleep-time.duckdns.org/en/pricing> | CTA `Pricing Plans` или переход на тарифы с лендинга |

## Предусловия

- Нет активной авторизованной сессии.

## Что проверяем

Локализованный SSR-лендинг сохраняет locale в CTA и переводах.

## Чеклист

- [ ] Локализованный SSR-лендинг сохраняет locale в CTA и переводах.
- [ ] Открывается правильный URL без неожиданного схлопывания locale до корня.
- [ ] Тексты на открытых страницах соответствуют выбранному языку.
- [ ] Во время выполнения сценария не возникает критических ошибок, сломанной верстки или необработанных состояний.

## Шаги проверки

1. Откройте <https://magic-sleep-time.duckdns.org/en/> в чистой неавторизованной сессии.
2. Дождитесь полной загрузки страницы и зафиксируйте, что в hero есть английский CTA `Create your first story`.
3. Нажмите `Create your first story`.
4. Зафиксируйте URL и текст под логотипом на открывшемся экране.
5. Вернитесь назад на <https://magic-sleep-time.duckdns.org/en/>.
6. Перейдите на тарифы через CTA или прямой URL <https://magic-sleep-time.duckdns.org/en/pricing>.
7. Зафиксируйте URL, H1 и subtitle страницы тарифов.

## Критерии приемки

- После открытия <https://magic-sleep-time.duckdns.org/en/> URL остается `.../en/`, а лендинг показывает английский CTA `Create your first story`.
- Нажатие `Create your first story` открывает <https://magic-sleep-time.duckdns.org/en/welcome>, а не `/welcome` без locale.
- На экране <https://magic-sleep-time.duckdns.org/en/welcome> под логотипом отображается текст `Personalized illustrated fairy tales`.
- Страница тарифов открывается по адресу <https://magic-sleep-time.duckdns.org/en/pricing> с H1 `Pricing Plans` и subtitle `Choose the perfect plan for your family`.
- Во время выполнения сценария не возникает критических ошибок, сломанной верстки или необработанных состояний.
