# Ручные тест-кейсы

В этой папке собраны ручные тест-кейсы для приложения и публичных страниц.

## Цели

- Покрыть критические пользовательские сценарии целиком.
- Сделать регрессионные прогоны предсказуемыми и повторяемыми.
- Разделить быстрый smoke и более глубокую функциональную проверку.
- Хранить в одном месте, что проверять, как проверять и какие критерии приемки считать успешными.

## Структура

- Этот файл является index-файлом по всем тест-кейсам.
- Каждый тест-кейс вынесен в отдельный `.md` файл.
- Файлы сгруппированы по тематическим папкам.

## Стандарт написания

### Базовые правила

- Один кейс = один основной сценарий и одна основная причина падения.
- Один файл должен отвечать на один вопрос вида "что именно должен увидеть QA в конце сценария".
- Предусловия должны быть минимальными: оставляйте только те аккаунты, фикстуры и настройки, без которых сценарий нельзя воспроизвести.
- Во всех предусловиях используйте коды фикстур и аккаунтов из этого README: `FREE_USER`, `PAID_USER`, `PUBLIC_AUTHOR_USER`, `CHILD_MINIMAL` и т.д.
- Формулировки вида `подготовлен один пользователь`, `используйте платного пользователя`, `авторизованный пользователь` без кода аккаунта запрещены: указывайте конкретный pre-created аккаунт из этого README.
- Если тест-оракул зависит от фактического получения письма, используйте реальный доступный QA почтовый ящик. Seed-аккаунты вида `qa.*@wondertales.test` не подходят для кейсов, где нужно открыть письмо, ссылку или вложение.
- Формулировки вида `если есть`, `при необходимости`, `optional` запрещены в `P0`, `P1` и `smoke`, если это не оформлено как отдельный обязательный кейс.
- `Что проверяем` формулируется одной короткой фразой. Не копируйте тот же текст в `Чеклист` и `Критерии приемки`.
- Основной тест-оракул должен быть наблюдаемым: конкретный экран, URL, CTA, текст, статус, счетчик, карточка, модалка или редирект.
- Если кейс меняет состояние пользователя, особенно через admin, в нем обязателен `Setup` и `Cleanup` или явное указание на disposable-аккаунт, который разрешено изменять.
- В кейсах выбора голоса и предпрослушивания сэмплов фиксируйте язык истории в предусловиях. Не используйте формулировку `любая история без аудио`.
- В кейсах каталога опубликованных историй с языковым фильтром фиксируйте как минимум две опубликованные истории на разных языках.
- Для одношаговых кейсов предпочтителен блок `Ожидаемый результат` вместо дублирующих `Чеклист` и `Критерии приемки`.

### Рекомендуемая структура кейса

```md
## Что проверяем

Один главный сценарий в одной фразе.

## Точки входа

Только те URL и пути, которые реально используются в этом кейсе.

## Предусловия

- Только обязательные аккаунты и фикстуры по коду.

## Setup

- Только если нужен подготовительный шаг или изменение состояния.

## Шаги проверки

1. ...
2. ...

## Ожидаемый результат

- Наблюдаемые результаты без общих формулировок.

## Cleanup

- Только если кейс изменяет состояние и его нужно восстановить.
```

### Что считать плохим кейсом

- В одном файле смешаны две проверки, которые могут падать независимо.
- В предусловиях перечислены все доступные тестовые аккаунты "на всякий случай".
- Expected result нельзя проверить без интерпретации вроде "контент выглядит корректно".
- Smoke-кейс содержит необязательную публичную ветку или side-check, который не обязателен для smoke-оракула.
- После кейса остаются измененные usage-счетчики, профиль или публикация без cleanup.

## Индекс тест-кейсов

### Авторизация и аккаунт

- [AUTH-01 Регистрация по email с валидными данными](./auth-and-account/AUTH-01.md)
- [AUTH-02 Валидация формы регистрации](./auth-and-account/AUTH-02.md)
- [AUTH-03 Регистрация на уже существующий email](./auth-and-account/AUTH-03.md)
- [AUTH-04 Вход по email с валидными данными](./auth-and-account/AUTH-04.md)
- [AUTH-05 Вход по email с неверными данными](./auth-and-account/AUTH-05.md)
- [AUTH-06 Вход через Google](./auth-and-account/AUTH-06.md)
- [AUTH-07 Вход через Apple](./auth-and-account/AUTH-07.md)
- [AUTH-08 Отмена OAuth или ошибка возврата от провайдера](./auth-and-account/AUTH-08.md)
- [AUTH-09 Запрос на восстановление пароля](./auth-and-account/AUTH-09.md)
- [AUTH-10 Сброс пароля по валидной ссылке](./auth-and-account/AUTH-10.md)
- [AUTH-11 Сброс пароля по невалидной или просроченной ссылке](./auth-and-account/AUTH-11.md)
- [AUTH-12 Сохранение сессии после refresh или relaunch](./auth-and-account/AUTH-12.md)
- [AUTH-13 Выход из аккаунта](./auth-and-account/AUTH-13.md)
- [AUTH-14 Показ пароля и индикатор силы на регистрации](./auth-and-account/AUTH-14.md)
- [AUTH-15 Публичные переходы со страницы входа](./auth-and-account/AUTH-15.md)
- [AUTH-16 Публичные CTA на лендинге](./auth-and-account/AUTH-16.md)

### Онбординг, главная и профиль

- [PROFILE-01 Выбор режима при первом входе](./onboarding-dashboard-profile/PROFILE-01.md)
- [PROFILE-02 Сохранение выбранного режима](./onboarding-dashboard-profile/PROFILE-02.md)
- [PROFILE-03 Загрузка данных на главной](./onboarding-dashboard-profile/PROFILE-03.md)
- [PROFILE-04 Обновление псевдонима](./onboarding-dashboard-profile/PROFILE-04.md)
- [PROFILE-05 Обновление блока «О себе»](./onboarding-dashboard-profile/PROFILE-05.md)
- [PROFILE-06 Загрузка аватара](./onboarding-dashboard-profile/PROFILE-06.md)
- [PROFILE-07 Удаление аватара](./onboarding-dashboard-profile/PROFILE-07.md)
- [PROFILE-08 Смена языка](./onboarding-dashboard-profile/PROFILE-08.md)
- [PROFILE-09 Проверка переводов после смены языка](./onboarding-dashboard-profile/PROFILE-09.md)
- [PROFILE-10 Комплексная проверка сохранения изменений профиля](./onboarding-dashboard-profile/PROFILE-10.md)
- [PROFILE-11 Действия в блоке поддержки](./onboarding-dashboard-profile/PROFILE-11.md)
- [PROFILE-12 Подтверждение выхода](./onboarding-dashboard-profile/PROFILE-12.md)
- [PROFILE-13 Переключение режима из профиля](./onboarding-dashboard-profile/PROFILE-13.md)
- [PROFILE-14 Автоскриншот и вложения в форме «Сообщить о проблеме»](./onboarding-dashboard-profile/PROFILE-14.md)
- [PROFILE-15 Юридические ссылки из профиля](./onboarding-dashboard-profile/PROFILE-15.md)

### Дети

- [CHILD-01 Пустое состояние списка детей](./children/CHILD-01.md)
- [CHILD-02 Создание ребенка только с обязательными полями](./children/CHILD-02.md)
- [CHILD-03 Создание полного профиля ребенка](./children/CHILD-03.md)
- [CHILD-04 Валидация формы ребенка](./children/CHILD-04.md)
- [CHILD-05 Анализ фото ребенка](./children/CHILD-05.md)
- [CHILD-06 Редактирование профиля ребенка](./children/CHILD-06.md)
- [CHILD-07 Удаление профиля ребенка](./children/CHILD-07.md)
- [CHILD-08 Отмена удаления профиля ребенка](./children/CHILD-08.md)
- [CHILD-09 Поведение при лимите профилей детей](./children/CHILD-09.md)

### Персонажи

- [CHAR-01 Пустое состояние списка персонажей](./characters/CHAR-01.md)
- [CHAR-02 Создание персонажа типа «Человек»](./characters/CHAR-02.md)
- [CHAR-03 Создание персонажа типа «Животное»](./characters/CHAR-03.md)
- [CHAR-04 Создание персонажа типа «Выдуманный»](./characters/CHAR-04.md)
- [CHAR-05 Валидация формы персонажа](./characters/CHAR-05.md)
- [CHAR-06 Анализ фото персонажа](./characters/CHAR-06.md)
- [CHAR-07 Редактирование персонажа](./characters/CHAR-07.md)
- [CHAR-08 Удаление персонажа](./characters/CHAR-08.md)
- [CHAR-09 Использование обновленного персонажа в новой истории](./characters/CHAR-09.md)

### Создание истории в мастерском режиме

- [ARTISAN-01 Открытие мастера создания с главной](./story-creation-artisan/ARTISAN-01.md)
- [ARTISAN-02 Создание истории с минимально валидными данными](./story-creation-artisan/ARTISAN-02.md)
- [ARTISAN-03 Создание истории с ребенком и персонажами](./story-creation-artisan/ARTISAN-03.md)
- [ARTISAN-04 Дополнительные настройки](./story-creation-artisan/ARTISAN-04.md)
- [ARTISAN-05 Валидация перед отправкой](./story-creation-artisan/ARTISAN-05.md)
- [ARTISAN-06 Состояние генерации](./story-creation-artisan/ARTISAN-06.md)
- [ARTISAN-07 Обработка ошибки генерации](./story-creation-artisan/ARTISAN-07.md)
- [ARTISAN-08 Консистентность персонажей между сценами](./story-creation-artisan/ARTISAN-08.md)
- [ARTISAN-09 Лимит бесплатного тарифа до submit](./story-creation-artisan/ARTISAN-09.md)
- [ARTISAN-10 Лимит, возвращенный API во время submit](./story-creation-artisan/ARTISAN-10.md)
- [ARTISAN-11 Новая история появляется в «Моих историях»](./story-creation-artisan/ARTISAN-11.md)
- [ARTISAN-12 Защита от повторной отправки](./story-creation-artisan/ARTISAN-12.md)
- [ARTISAN-13 Добавление ребенка и персонажа прямо из мастера](./story-creation-artisan/ARTISAN-13.md)

### Создание истории в мгновенном режиме

- [INSTANT-01 Открытие мгновенного мастера с главной](./story-creation-instant/INSTANT-01.md)
- [INSTANT-02 Создание истории по фотографиям](./story-creation-instant/INSTANT-02.md)
- [INSTANT-03 Валидация загрузки фото](./story-creation-instant/INSTANT-03.md)
- [INSTANT-04 Статус генерации и успешное завершение](./story-creation-instant/INSTANT-04.md)
- [INSTANT-05 Ошибка генерации и путь в поддержку](./story-creation-instant/INSTANT-05.md)
- [INSTANT-06 Консистентность персонажа по загруженным фотографиям](./story-creation-instant/INSTANT-06.md)
- [INSTANT-07 Лимиты в мгновенном режиме](./story-creation-instant/INSTANT-07.md)
- [INSTANT-08 Переключение режима не ломает навигацию](./story-creation-instant/INSTANT-08.md)
- [INSTANT-09 Выбор возрастной группы](./story-creation-instant/INSTANT-09.md)
- [INSTANT-10 Выбор сценария в быстром мастере](./story-creation-instant/INSTANT-10.md)

### Мои истории, экран чтения и серии

- [LIB-01 Загрузка и пустое состояние в «Моих историях»](./library-reader-series/LIB-01.md)
- [LIB-02 Фильтры и пагинация в «Моих историях»](./library-reader-series/LIB-02.md)
- [LIB-03 Открытие истории из «Моих историй»](./library-reader-series/LIB-03.md)
- [LIB-04 Отображение экрана чтения истории](./library-reader-series/LIB-04.md)
- [LIB-05 Генерация аудио](./library-reader-series/LIB-05.md)
- [LIB-06 Проигрывание аудио](./library-reader-series/LIB-06.md)
- [LIB-07 Отображение аудио-виджетов и мини-плеера](./library-reader-series/LIB-07.md)
- [LIB-08 Перемотка и позиция воспроизведения](./library-reader-series/LIB-08.md)
- [LIB-09 Скорость воспроизведения аудио](./library-reader-series/LIB-09.md)
- [LIB-10 Выбор голоса перед генерацией аудио](./library-reader-series/LIB-10.md)
- [LIB-11 Предпрослушивание голосов](./library-reader-series/LIB-11.md)
- [LIB-12 Доступность премиум-голосов на бесплатном тарифе](./library-reader-series/LIB-12.md)
- [LIB-13 Доступность премиум-голосов на платном тарифе](./library-reader-series/LIB-13.md)
- [LIB-14 Удаление своей истории](./library-reader-series/LIB-14.md)
- [LIB-15 Отправка сообщения о проблеме из истории и библиотеки](./library-reader-series/LIB-15.md)
- [LIB-16 Список серий и экран серии](./library-reader-series/LIB-16.md)
- [LIB-17 Генерация продолжения](./library-reader-series/LIB-17.md)
- [LIB-18 Подписка на продолжения истории по расписанию](./library-reader-series/LIB-18.md)
- [LIB-19 Сохранение LLM-персонажа из истории в свои персонажи](./library-reader-series/LIB-19.md)
- [LIB-20 Подсветка текста во время аудио](./library-reader-series/LIB-20.md)
- [LIB-21 Состояния очереди, ошибки и лимита при генерации аудио](./library-reader-series/LIB-21.md)
- [LIB-22 Сохранение настроек библиотеки и вход по breadcrumb-сценарию](./library-reader-series/LIB-22.md)
- [LIB-23 Переходы между частями серии из экрана чтения](./library-reader-series/LIB-23.md)

### Публикация и публичные страницы

- [PUB-01 Публикация истории в каталог](./publication-and-public-pages/PUB-01.md)
- [PUB-02 Публикация истории по ссылке](./publication-and-public-pages/PUB-02.md)
- [PUB-03 Обновление настроек публикации](./publication-and-public-pages/PUB-03.md)
- [PUB-04 Снятие истории с публикации](./publication-and-public-pages/PUB-04.md)
- [PUB-05 Расшаривание опубликованной истории](./publication-and-public-pages/PUB-05.md)
- [PUB-06 Просмотр каталога опубликованных историй](./publication-and-public-pages/PUB-06.md)
- [PUB-07 Фильтр по возрасту](./publication-and-public-pages/PUB-07.md)
- [PUB-08 Фильтр по времени чтения](./publication-and-public-pages/PUB-08.md)
- [PUB-09 Блок автора на публичной истории](./publication-and-public-pages/PUB-09.md)
- [PUB-10 Публичная страница автора](./publication-and-public-pages/PUB-10.md)
- [PUB-11 Блок призыва к действию для неавторизованного пользователя на публичной истории](./publication-and-public-pages/PUB-11.md)
- [PUB-12 Прямое открытие публичных ссылок](./publication-and-public-pages/PUB-12.md)
- [PUB-13 Рейтинг публичной истории](./publication-and-public-pages/PUB-13.md)
- [PUB-14 Повторное голосование за ту же историю](./publication-and-public-pages/PUB-14.md)
- [PUB-15 Публикация из сценария «Поделиться» для неопубликованной истории](./publication-and-public-pages/PUB-15.md)
- [PUB-16 Обложка для расшаривания и псевдоним в диалоге публикации](./publication-and-public-pages/PUB-16.md)
- [PUB-17 Копирование публичной ссылки после публикации на web](./publication-and-public-pages/PUB-17.md)
- [PUB-18 Фильтр по языку истории](./publication-and-public-pages/PUB-18.md)

### Тарифы, биллинг и подписка

- [BILL-01 Страница тарифов для неавторизованного пользователя](./plans-billing-subscription/BILL-01.md)
- [BILL-02 Страница тарифов для авторизованного пользователя](./plans-billing-subscription/BILL-02.md)
- [BILL-03 Переход с бесплатного тарифа на платный](./plans-billing-subscription/BILL-03.md)
- [BILL-04 Экран успешной оплаты](./plans-billing-subscription/BILL-04.md)
- [BILL-05 Управление подпиской](./plans-billing-subscription/BILL-05.md)
- [BILL-06 Отображение отмены на конец периода](./plans-billing-subscription/BILL-06.md)
- [BILL-07 Счетчик историй обновляется после генерации истории](./plans-billing-subscription/BILL-07.md)
- [BILL-08 Paywall лимита историй в мгновенном режиме](./plans-billing-subscription/BILL-08.md)
- [BILL-09 Поведение при выборе более низкого тарифа](./plans-billing-subscription/BILL-09.md)
- [BILL-10 Ошибка биллинга](./plans-billing-subscription/BILL-10.md)
- [BILL-11 Счетчик аудиосказок обновляется после генерации аудио](./plans-billing-subscription/BILL-11.md)
- [BILL-12 Paywall лимита историй в мастерском режиме](./plans-billing-subscription/BILL-12.md)

### Smoke-регрессия

- [SMOKE-01 Новый пользователь может зарегистрироваться и выбрать режим](./smoke-regression/SMOKE-01.md)
- [SMOKE-02 Существующий пользователь может войти по email](./smoke-regression/SMOKE-02.md)
- [SMOKE-03 Можно создать и сохранить профиль ребенка](./smoke-regression/SMOKE-03.md)
- [SMOKE-04 Можно создать и сохранить персонажа](./smoke-regression/SMOKE-04.md)
- [SMOKE-05 Можно сгенерировать историю](./smoke-regression/SMOKE-05.md)
- [SMOKE-06 Можно опубликовать историю и открыть ее публично](./smoke-regression/SMOKE-06.md)
- [SMOKE-07 Можно открыть страницу автора из публичной истории](./smoke-regression/SMOKE-07.md)
- [SMOKE-08 Доступны тарифы и вход в сценарий обновления тарифа](./smoke-regression/SMOKE-08.md)
- [SMOKE-09 Изменения профиля сохраняются](./smoke-regression/SMOKE-09.md)
- [SMOKE-10 Выход из аккаунта работает](./smoke-regression/SMOKE-10.md)

### Admin-панель как инструмент QA

- [ADMIN-QA-01 Найти историю в admin после основного сценария](./admin-qa-observability/ADMIN-QA-01.md)
- [ADMIN-QA-02 Сверка scene data с пользовательской историей](./admin-qa-observability/ADMIN-QA-02.md)
- [ADMIN-QA-03 Проверка environments для истории](./admin-qa-observability/ADMIN-QA-03.md)
- [ADMIN-QA-04 Проверка outfit plates и привязки outfitId](./admin-qa-observability/ADMIN-QA-04.md)
- [ADMIN-QA-05 Проверка image validation по конкретной сцене](./admin-qa-observability/ADMIN-QA-05.md)
- [ADMIN-QA-06 Подтверждение генерации environments и outfits через cost breakdown](./admin-qa-observability/ADMIN-QA-06.md)
- [ADMIN-QA-07 Подготовка usage через admin для лимитных сценариев](./admin-qa-observability/ADMIN-QA-07.md)

## Тестовые данные
Подготовьте эти аккаунты перед полным регрессионным прогоном:

Кейсы, которые меняют usage через admin, должны использовать только disposable-аккаунты из таблицы ниже.

| Код | Назначение |
| --- | --- |
| `FREE_USER` | Новый аккаунт на бесплатном тарифе без истории платежей |
| `PAID_USER` | Аккаунт с активной платной подпиской |
| `CANCELED_USER` | Аккаунт с платным тарифом и отменой на конец периода |
| `ADMIN_USER` | Администратор web-версии с доступом в <https://magic-sleep-time.duckdns.org/admin/*> |
| `FREE_INSTANT_LIMIT_USER` | Disposable-аккаунт на бесплатном тарифе с выбранным `Мгновенный режим`; допустимо менять `Stories used this period` через admin |
| `FREE_ARTISAN_LIMIT_USER` | Disposable-аккаунт на бесплатном тарифе с выбранным `Мастерской режим`, подготовленными `CHILD_MINIMAL` и `CHARACTER_PERSON`; допустимо менять `Stories used this period` через admin |
| `PAID_AUDIO_USER` | Disposable-аккаунт с активной платной подпиской и историями `DRAFT_STORY_NO_AUDIO_ES` и/или другими `DRAFT_STORY_NO_AUDIO_<LANG>`; допустимо менять `Audio stories used this period` через admin |
| `PROFILE_EDIT_USER` | Disposable-аккаунт для smoke-проверок профиля; базовые значения: псевдоним `Profile QA`, `О себе` = `Profile baseline bio` |
| `PUBLIC_AUTHOR_USER` | Пользователь с псевдонимом, аватаром, блоком `О себе` и минимум двумя опубликованными историями на разных языках для проверки language filter |
| `REAL_MAILBOX_USER` | Ручной QA-аккаунт на реальном почтовом ящике; использовать в кейсах, где нужно фактически получить письмо и открыть ссылку из inbox |
| `REAL_NEW_MAILBOX` | Реальный QA почтовый ящик или alias, еще не зарегистрированный в системе; использовать в кейсах, где письмо должно прийти на новый email |
| `REAL_GOOGLE_OAUTH_USER` | Ручной QA-аккаунт Google на реальной почте; использовать только для реального login flow через Google |
| `REAL_APPLE_OAUTH_USER` | Ручной QA-аккаунт Apple на реальной почте; использовать только для реального login flow через Apple |

### Креды seed-аккаунтов

Если аккаунты подготовлены скриптом `pnpm --dir services/api seed:test-accounts` с дефолтными env, используйте такие креды:

- Email-шаблон: `qa.<code в нижнем регистре>@wondertales.test`
- Пароль для всех password-аккаунтов: `ChangeMe123!`

| Код | Email | Способ входа |
| --- | --- | --- |
| `FREE_USER` | `qa.free_user@wondertales.test` | Email + пароль `ChangeMe123!` |
| `PAID_USER` | `qa.paid_user@wondertales.test` | Email + пароль `ChangeMe123!` |
| `CANCELED_USER` | `qa.canceled_user@wondertales.test` | Email + пароль `ChangeMe123!` |
| `ADMIN_USER` | `qa.admin_user@wondertales.test` | Email + пароль `ChangeMe123!` |
| `FREE_INSTANT_LIMIT_USER` | `qa.free_instant_limit_user@wondertales.test` | Email + пароль `ChangeMe123!` |
| `FREE_ARTISAN_LIMIT_USER` | `qa.free_artisan_limit_user@wondertales.test` | Email + пароль `ChangeMe123!` |
| `PAID_AUDIO_USER` | `qa.paid_audio_user@wondertales.test` | Email + пароль `ChangeMe123!` |
| `PROFILE_EDIT_USER` | `qa.profile_edit_user@wondertales.test` | Email + пароль `ChangeMe123!` |
| `PUBLIC_AUTHOR_USER` | `qa.public_author_user@wondertales.test` | Email + пароль `ChangeMe123!` |

Если на окружении были переопределены `QA_TEST_EMAIL_DOMAIN`, `QA_TEST_EMAIL_PREFIX` или `QA_TEST_DEFAULT_PASSWORD`, фактические креды будут отличаться от таблицы выше.

`REAL_MAILBOX_USER`, `REAL_NEW_MAILBOX`, `REAL_GOOGLE_OAUTH_USER` и `REAL_APPLE_OAUTH_USER` не создаются seed-скриптом. Их нужно поддерживать вручную на реальных QA inbox и provider accounts.

Подготовьте эти фикстуры контента:

| Код | Назначение |
| --- | --- |
| `CHILD_MINIMAL` | Профиль ребёнка только с обязательными полями |
| `CHILD_FULL` | Полный профиль ребёнка с фото, предпочтениями и детальными данными |
| `CHARACTER_PERSON` | Персонаж-человек с изображением и чертами |
| `CHARACTER_ANIMAL` | Персонаж-животное с изображением и чертами |
| `DRAFT_STORY` | Сгенерированная, но не опубликованная история |
| `DRAFT_STORY_NO_AUDIO` | Сгенерированная история без созданного аудио; конкретный язык истории должен быть указан в предусловиях кейса |
| `DRAFT_STORY_NO_AUDIO_ES` | Сгенерированная история без аудио с языком истории `es` |
| `PUBLISHED_PUBLIC_STORY` | История, опубликованная в каталог |
| `PUBLISHED_PUBLIC_STORY_UK` | История, опубликованная в каталог, с языком истории `uk` |
| `PUBLISHED_PUBLIC_STORY_ES` | История, опубликованная в каталог, с языком истории `es` |
| `PUBLISHED_PUBLIC_STORIES_MULTI_LANGUAGE` | Набор минимум из двух опубликованных историй в каталоге с разными значениями языка истории, например `uk` и `es` |
| `PUBLISHED_UNLISTED_STORY` | История, опубликованная по ссылке |
| `SERIES_WITH_MULTIPLE_PARTS` | Серия историй минимум из 2 частей |

## Окружения

Прогоняйте набор как минимум на этих поверхностях:

| Поверхность | Минимальное покрытие |
| --- | --- |
| Веб на десктопе | Chrome последней версии |
| Веб на мобильном | iPhone viewport в devtools или реальное устройство |
| Native iOS | Минимум одно реальное устройство или симулятор |
| Native Android | Минимум одно реальное устройство или эмулятор, если поддерживается командой |

## Правило для URL

Используйте `https://magic-sleep-time.duckdns.org` как основной адрес web-версии.

Для staging или локального запуска меняйте только хост, сохраняя тот же путь:

| Окружение | Пример |
| --- | --- |
| Production | <https://magic-sleep-time.duckdns.org/register> |
| Local web | `http://localhost:8081/register` |
| Deep link | `wondertales://register`, если маршрут поддерживается сборкой |

Если флоу открывается из модалки, bottom sheet или внутреннего действия приложения и не имеет отдельного URL, в тест-кейсе должен быть указан точный родительский экран и путь по кликам.

## Лучшие практики

- По возможности сбрасывайте состояние перед каждым критическим сценарием.
- Сохраняйте скриншоты для визуальных регрессий и спорных дефектов.
- Проверяйте network requests и консоль, если поведение UI неоднозначно.
- Покрывайте и позитивные, и негативные сценарии.
- Проверяйте аналитически важные флоу, если на них завязаны продуктовые решения.
- Используйте стабильные тестовые данные для публичных страниц и подписок.
- Проверяйте сохранение данных после refresh, relaunch и повторного логина там, где это важно.

## Приоритеты

| Приоритет | Значение |
| --- | --- |
| `P0` | Блокер, auth, деньги, потеря данных |
| `P1` | Поломка ключевого сценария создания или чтения контента |
| `P2` | Важная, но не блокирующая проблема |
| `P3` | Косметика, тексты или редкий крайний случай |

## Правила выполнения

- Для каждого тест-кейса фиксируйте фактический результат, окружение и идентификатор сборки.
- Если кейс падает, прикладывайте логи, скриншоты и релевантные сетевые трассировки.
- Для публичных страниц всегда отдельно проверяйте поведение для авторизованного и неавторизованного пользователя, если это применимо.
