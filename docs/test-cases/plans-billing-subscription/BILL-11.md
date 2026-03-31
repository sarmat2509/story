# BILL-11 Счетчик аудиосказок обновляется после генерации аудио
[Назад к index](../README.md)


- ID: `BILL-11`
- Модуль: `Тарифы, биллинг и подписка`
- Приоритет: `P1`

## Что проверяем

После одной успешной генерации аудио счетчик оставшихся аудиосказок в профиле уменьшается ровно на 1.

## Точки входа

| Раздел | Web URL | Навигация внутри приложения |
| --- | --- | --- |
| Профиль | <https://magic-sleep-time.duckdns.org/profile> | Раздел `Профиль` |
| Своя история на экране чтения | `https://magic-sleep-time.duckdns.org/me/stories/<storyId>` | Открыть `DRAFT_STORY_NO_AUDIO` у `PAID_AUDIO_USER` |
| Пользователи в admin | <https://magic-sleep-time.duckdns.org/admin/users> | Web-only: `Профиль` -> `Admin` -> `Admin / Users` |

## Предусловия

- `PAID_AUDIO_USER`
- `DRAFT_STORY_NO_AUDIO`
- Используется только disposable-аккаунт из README.

## Setup

1. Под `ADMIN_USER` откройте <https://magic-sleep-time.duckdns.org/admin/users>.
2. Найдите `PAID_AUDIO_USER`, нажмите `Edit` и зафиксируйте исходное значение `Audio stories used this period`.
3. Установите `Audio stories used this period = 0` и нажмите `Save`.
4. Войдите под `PAID_AUDIO_USER`, откройте <https://magic-sleep-time.duckdns.org/profile> и зафиксируйте стартовое значение `M` из блока `Осталось {{stories}} сказок и {{audio}} аудиосказок`.

## Шаги проверки

1. Под `PAID_AUDIO_USER` откройте `DRAFT_STORY_NO_AUDIO` на экране чтения.
2. Запустите генерацию аудио для истории.
3. Дождитесь успешного завершения генерации и появления аудиоплеера или playback controls на экране истории.
4. Вернитесь в <https://magic-sleep-time.duckdns.org/profile> и обновите экран.

## Ожидаемый результат

- До генерации в профиле отображается стартовое значение `M`, где `M > 0`.
- После одной успешной генерации блок подписки показывает `M-1` оставшихся аудиосказок.
- Количество оставшихся историй в том же блоке не меняется.
- На экране истории после завершения генерации доступен аудиоплеер вместо исходного состояния без аудио.

## Cleanup

1. Под `ADMIN_USER` снова откройте `Edit` для `PAID_AUDIO_USER`.
2. Верните исходное значение `Audio stories used this period`, зафиксированное в setup.
3. Нажмите `Save` и убедитесь, что значение восстановлено.
