# PUB-21 sitemap.xml содержит локализованные landing и pricing URL
[Назад к index](../README.md)


- ID: `PUB-21`
- Модуль: `Публикация и публичные страницы`
- Приоритет: `P2`

## Что проверяем

`sitemap.xml` отдает XML и включает локализованные landing/pricing страницы.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Sitemap | <https://magic-sleep-time.duckdns.org/sitemap.xml> | Открыть URL напрямую в браузере |

## Предусловия

- Нет обязательных аккаунтов или фикстур.

## Шаги проверки

1. Откройте <https://magic-sleep-time.duckdns.org/sitemap.xml>.
2. Убедитесь, что браузер показывает XML, а не SPA shell.
3. Найдите в документе URL `https://magic-sleep-time.duckdns.org/`.
4. Найдите в документе URL `https://magic-sleep-time.duckdns.org/en/`.
5. Найдите в документе URL `https://magic-sleep-time.duckdns.org/pricing`.
6. Найдите в документе URL `https://magic-sleep-time.duckdns.org/en/pricing`.

## Ожидаемый результат

- `sitemap.xml` открывается как XML-документ без HTML shell приложения.
- В sitemap присутствует корневой landing URL `https://magic-sleep-time.duckdns.org/`.
- В sitemap присутствует хотя бы один локализованный landing URL, например `https://magic-sleep-time.duckdns.org/en/`.
- В sitemap присутствует корневой pricing URL `https://magic-sleep-time.duckdns.org/pricing`.
- В sitemap присутствует хотя бы один локализованный pricing URL, например `https://magic-sleep-time.duckdns.org/en/pricing`.
