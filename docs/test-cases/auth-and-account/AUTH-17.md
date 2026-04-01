# AUTH-17 Локализованный /welcome сохраняет locale в URL
[Назад к index](../README.md)


- ID: `AUTH-17`
- Модуль: `Авторизация и аккаунт`
- Приоритет: `P1`

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Локализованный вход | <https://magic-sleep-time.duckdns.org/en/welcome> | Открыть URL напрямую в новой вкладке |
| Локализованные тарифы | <https://magic-sleep-time.duckdns.org/en/pricing> | Кнопка `View plans` на <https://magic-sleep-time.duckdns.org/en/welcome> |
| Локализованный каталог | <https://magic-sleep-time.duckdns.org/en/stories> | Кнопка `Browse published stories` на <https://magic-sleep-time.duckdns.org/en/welcome> |

## Предусловия

- Нет активной авторизованной сессии.

## Что проверяем

Locale-prefixed маршрут входа не схлопывается в URL без языкового префикса.

## Чеклист

- [ ] Locale-prefixed маршрут входа не схлопывается в URL без языкового префикса.
- [ ] Публичные переходы с экрана входа сохраняют тот же locale в URL.
- [ ] Во время выполнения сценария не возникает критических ошибок, сломанной верстки или необработанных состояний.

## Шаги проверки

1. Откройте <https://magic-sleep-time.duckdns.org/en/welcome> в новой неавторизованной вкладке.
2. Дождитесь полной загрузки страницы и не выполняйте никаких действий 3-5 секунд.
3. Зафиксируйте фактический URL и subtitle под логотипом.
4. Нажмите `View plans`.
5. Зафиксируйте фактический URL страницы тарифов.
6. Вернитесь назад на <https://magic-sleep-time.duckdns.org/en/welcome>.
7. Нажмите `Browse published stories`.
8. Зафиксируйте фактический URL каталога.

## Критерии приемки

- После полной загрузки страницы URL остается `https://magic-sleep-time.duckdns.org/en/welcome` и не меняется на `/welcome`.
- На экране входа отображается subtitle `Personalized illustrated fairy tales`.
- Нажатие `View plans` открывает `https://magic-sleep-time.duckdns.org/en/pricing`.
- Нажатие `Browse published stories` открывает `https://magic-sleep-time.duckdns.org/en/stories`.
- Во время выполнения сценария не возникает критических ошибок, сломанной верстки или необработанных состояний.
