# PUB-19 Примеры историй на языковой версии лендинга фильтруются по языку
[Назад к index](../README.md)


- ID: `PUB-19`
- Модуль: `Публикация и публичные страницы`
- Приоритет: `P1`

## Что проверяем

На языковой версии SSR-лендинга в блоке примеров показываются только истории того же языка.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Украинский лендинг | <https://magic-sleep-time.duckdns.org/> | Открыть корень приложения |
| Испанский лендинг | <https://magic-sleep-time.duckdns.org/es/> | Открыть языковую версию лендинга напрямую |

## Предусловия

- `HOME_LANDING_STORY_UK`
- `HOME_LANDING_STORY_ES`
- Обе истории опубликованы в каталог, имеют `publishedSlug`, выставленный `showOnHomePage=true` и видимы на соответствующих языковых версиях лендинга.

## Шаги проверки

1. Откройте <https://magic-sleep-time.duckdns.org/>.
2. Прокрутите до секции `Приклади чарівних історій`.
3. Зафиксируйте карточку `HOME_LANDING_STORY_UK`.
4. Убедитесь, что карточки `HOME_LANDING_STORY_ES` нет в этой секции.
5. Откройте <https://magic-sleep-time.duckdns.org/es/>.
6. Прокрутите до секции `Ejemplos de historias mágicas`.
7. Зафиксируйте карточку `HOME_LANDING_STORY_ES`.
8. Убедитесь, что карточки `HOME_LANDING_STORY_UK` нет в этой секции.

## Ожидаемый результат

- На <https://magic-sleep-time.duckdns.org/> в секции примеров отображается `HOME_LANDING_STORY_UK`, а `HOME_LANDING_STORY_ES` отсутствует.
- На <https://magic-sleep-time.duckdns.org/es/> в секции примеров отображается `HOME_LANDING_STORY_ES`, а `HOME_LANDING_STORY_UK` отсутствует.
- В обеих языковых версиях не появляются карточки опубликованных историй с другим языком.
