# PUB-20 Пустое состояние примеров на языковой версии лендинга
[Назад к index](../README.md)


- ID: `PUB-20`
- Модуль: `Публикация и публичные страницы`
- Приоритет: `P1`

## Что проверяем

Если для языковой версии лендинга нет историй на главной, вместо фейковых карточек показывается локализованное пустое состояние.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Немецкий лендинг | <https://magic-sleep-time.duckdns.org/de/> | Открыть языковую версию лендинга напрямую |
| Немецкий вход | <https://magic-sleep-time.duckdns.org/de/welcome> | CTA пустого состояния на <https://magic-sleep-time.duckdns.org/de/> |

## Предусловия

- `HOME_LANDING_NO_STORIES_DE`
- Для языка `de` нет опубликованных историй с `showOnHomePage=true`.

## Шаги проверки

1. Откройте <https://magic-sleep-time.duckdns.org/de/> в неавторизованной сессии.
2. Прокрутите до секции `Beispiele für magische Geschichten`.
3. Зафиксируйте содержимое блока вместо карточек историй.
4. Нажмите CTA `Meine Geschichte erstellen`.

## Ожидаемый результат

- В секции примеров не отображаются фейковые карточки с заглушечными названиями.
- Вместо карточек показывается пустое состояние с заголовком `In dieser Sprache gibt es noch keine Geschichten`.
- Под заголовком отображается текст `Hier erscheinen bald magische Beispiele. Bis dahin kann deine Geschichte die erste auf dieser Sprachversion werden.`
- CTA `Meine Geschichte erstellen` открывает `https://magic-sleep-time.duckdns.org/de/welcome`.
