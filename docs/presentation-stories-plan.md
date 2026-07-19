# Презентационные истории: план, профили и библия персонажей

> Единый рабочий документ для подготовки публичного демонстрационного каталога WonderTales.
>
> Актуальность: 19 июля 2026 года. Все дети, взрослые, животные и фантастические герои в документе вымышлены и создаются без фотографий.

## 1. Цель

Подготовить и опубликовать 21 презентационную историю, чтобы посетители публичного каталога могли увидеть и прочитать примеры всех поддерживаемых форматов.

- 7 языков: украинский, русский, английский, испанский, немецкий, французский и польский.
- На каждом языке: одна обычная история, один комикс и одна mixed-история.
- Все 17 существующих тем должны встретиться хотя бы один раз.
- Должны быть представлены все возрастные группы и все 7 доступных оттенков кожи.
- Для обычной истории используется тариф с 3 иллюстрациями.
- Комикс ориентировочно состоит из 8 страниц.
- Mixed-история сочетает прозу и 3 комикс-блока.
- Значок «3 персонализированные иллюстрации» в публичном каталоге не показываем.
- Консистентность демонстрируется повторением одних и тех же детей и закреплённых за ними персонажей в разных языках, сюжетах и форматах.

## 2. Ограничения тарифа и производства

Golden допускает 20 историй и 5 комиксов за расчётный период. Для демонстрационного аккаунта настроено условное расширение текущего периода: до исчерпания отображаются и применяются обычные 20/5; при расходе 20 историй становится доступна ещё одна история, а при расходе 5 комиксов — ещё два комикса. Итоговые пределы после срабатывания: 21 история и 7 комиксов.

Расширение привязано к точным датам текущего периода и не переносится в следующий. Так вся серия создаётся на одном аккаунте: профили детей и персонажей сохраняются без дублирования, а визуальная консистентность не зависит от смены аккаунта.

Для возрастов `1y` и `2-3` в текущем каталоге нет подходящих scenario cards. Эти сюжеты нужно создавать через точные пользовательские инструкции.

## 3. Продуктовые предпосылки до массовой генерации

Публичная часть реализована и проверена:

- `storyFormat` входит в публичный контракт со значениями `story`, `graphic_novel`, `mixed_story`;
- для комикса публично возвращаются `comicPages`, изображение каждой страницы и структурированный `textOverlay.items` для пузырей и подписей;
- для mixed-истории публично возвращается `mixedStoryReadingOrder`;
- публичные app-reader и SSR-reader отображают комикс и mixed в правильном порядке;
- карточки app-каталога и SSR-каталога показывают «История», «Комикс» или «История + комикс»;
- отметка «3 персонализированные иллюстрации» не добавлена;
- в prompt детского turnaround передаётся текущий возраст из `birthDate`, а в `aiGeneratedDescription` возраст не дублируется.

Реализация публичных форматов зафиксирована коммитом `6c71ef2f`. Проверки `publicStoryFormatContract`, `renderPublishedStoryHtml`, `renderPublicStoriesCatalogHtml`, shared build, app type-check и production smoke проходят.

## 4. Канонический состав

### 4.1. Дети

| Профиль | Пол | Дата рождения | Возраст на 18.07.2026 | Группа | Оттенок кожи | Языки профиля | Постоянные признаки |
|---|---|---:|---:|---|---|---|---|
| Ноа | мальчик | 10.05.2025 | 1 год | `1y` | `very light` | украинский | Рыжевато-медные кудри, серо-голубые глаза, жёлтый комбинезон |
| Лина | девочка | 18.04.2023 | 3 года | `2-3` | `light` | английский, немецкий, польский | Светлое каре, голубые глаза, круглые красные очки |
| Майя | девочка | 10.03.2021 | 5 лет | `4-5` | `medium` | испанский, французский, польский | Волнистые тёмные волосы, карие глаза, веснушки |
| Сами | мальчик | 14.02.2019 | 7 лет | `6-8` | `tan` | русский, испанский, французский | Короткие чёрные кудри, зелёная куртка, фиолетовые очки |
| Амара | девочка | 01.04.2018 | 8 лет | `6-8` | `brown` | немецкий, английский, украинский | Шесть длинных кос с жёлтыми бусинами, джинсовый комбинезон |
| Рави | мальчик | 16.02.2016 | 10 лет | `9-12` | `dark brown` | немецкий, английский, польский | Боковой пробор, родинка на левой щеке, оранжевое худи |
| Зури | девочка | 08.03.2014 | 12 лет | `9-12` | `very dark` | французский, испанский, русский | Два объёмных пучка, бирюзовые очки, фиолетовая куртка |

Даты рождения фиксированы. Перед длительным производством нужно проверить, не перевёл ли фактический возраст ребёнка в другую продуктовую группу. Если это случится, дату рождения для демонстрационного профиля следует сдвинуть, сохранив целевой возраст и группу.

### 4.2. Собственные миры детей

Каждый ребёнок имеет отдельный постоянный состав. В первой серии презентационных историй персонажи не переходят между детскими мирами. Это позволяет явно показать консистентность внешности и отношений.

| Ребёнок | Родитель | Животное | Выдуманные герои |
|---|---|---|---|
| Ноа | Мара, мама | Пип, кролик | Тилли, лунная моль |
| Лина | нет отдельного постоянного профиля | Момо, кот | Кико, улитка-фонарь |
| Майя | нет отдельного постоянного профиля | Пико, корги | Орби, воздушный скат |
| Сами | нет отдельного постоянного профиля | — | Лума, дракон; Руни, дух-компас |
| Амара | Тео, папа | — | Физз, облачный дух; Эмбер, огненная саламандра |
| Рави | нет отдельного постоянного профиля | — | Нова, робот; Квилл, бумажная сова |
| Зури | нет отдельного постоянного профиля | — | Веспер, космическая рысь |

«Нет отдельного постоянного профиля» не означает, что у ребёнка нет семьи. Родители могут упоминаться в тексте или появляться как второстепенные неперсонализированные фигуры, но для них не создаётся переиспользуемый model sheet.

Итого: 15 постоянных персонажей — 2 родителя, 3 животных и 10 выдуманных героев. Это соответствует лимиту Golden в 15 генераций персонажей.

В одной истории следует использовать ребёнка и 1–2 закреплённых персонажа. Хотя тариф допускает до пяти персонажей, небольшой состав даёт более стабильные лица, одежду, масштаб и пропорции.

## 5. Как создаём детские профили: фактический контракт приложения

### 5.1. Точка входа

Профиль создаётся через:

```http
POST /api/v1/children
```

Запрос требует авторизованную родительскую сессию. Согласие на обработку данных ребёнка обязательно; для нашего демонстрационного аккаунта в запросе передаём `childDataConsentAccepted: true`.

Источник истины для входного контракта — `CreateChildProfileSchema` в `packages/shared/src/schemas/index.ts`. Приложение вызывает этот endpoint через `useCreateChild` из `apps/universal-app/src/api/children.ts`.

### 5.2. Контракт запроса

```ts
type CreateDemoChildProfileRequest = {
  name: string;                         // 1–100 символов
  birthDate: string;                    // YYYY-MM-DD, не в будущем
  languages: Array<'uk' | 'ru' | 'en' | 'es' | 'de' | 'fr' | 'pl'>; // 1–3
  storyCreationMode?: 'instant' | 'artisan';
  storyTextSizeMultiplier?: 0.9 | 0.95 | 1 | 1.05 | 1.1;

  referencePhotos?: Array<{
    url: string;                        // максимум 5 фотографий
    uploadedAt?: string;
  }>;

  appearanceTraits?: {
    hairColor?: HairColor;
    hairLength?: HairLength;
    hairStyle?: HairStyle;
    eyeColor?: EyeColor;
    skinTone?: SkinTone;
    distinctiveFeatures?: DistinctiveFeature[]; // API: максимум 5, UI: максимум 3
  };

  personality?: {
    traits?: PersonalityTrait[];        // максимум 5
    favoriteActivities?: FavoriteActivity[]; // максимум 5
  };

  interests?: Interest[];               // максимум 7

  sensitivities?: {
    fearLevel?: 'none' | 'low' | 'medium' | 'high';
    commonFears?: CommonFear[];         // максимум 5
    avoidTopics?: AvoidTopic[];         // максимум 5
  };

  familyCast?: Record<string, string>;  // свободные ключи и имена, значение до 100 символов
  aiGeneratedDescription?: string;      // подробное описание, максимум 5000 символов
  descriptionLanguage?: string;         // для наших описаний: 'en'
  authorPseudonym?: string | null;       // максимум 100 символов
  authorAboutMe?: string | null;         // максимум 1000 символов

  childDataConsentAccepted: true;       // поле route envelope, не часть Zod-схемы профиля
};
```

Для демонстрационных профилей без фотографий используем следующий режим:

- `referencePhotos` не передаём;
- `storyCreationMode` ставим `artisan`, потому что презентационные истории создаются по управляемой матрице;
- `storyTextSizeMultiplier` ставим `1`;
- подробную внешность передаём на английском в `aiGeneratedDescription`;
- `descriptionLanguage` ставим `en`;
- `authorPseudonym` и `authorAboutMe` пока передаём как `null`, если публичный профиль автора не нужен;
- точные данные внешности дополнительно дублируем доступными enum-значениями в `appearanceTraits`.

В контракте нет отдельных полей `gender`, `height`, `clothing`, точной текстуры волос, положения родинки, количества кос или цвета аксессуаров. Эти признаки обязательно записываются в `aiGeneratedDescription`. Возраст и `ageGroup` не передаются: сервер вычисляет их из `birthDate`.

Возраст не включаем в `aiGeneratedDescription`. Он должен вычисляться из `birthDate` непосредственно перед каждой генерацией или перегенерацией turnaround, чтобы prompt всегда соответствовал возрасту ребёнка «на сейчас».

`familyCast` хранит только свободную карту имён. Оно не создаёт персонажей и не связывает профиль ребёнка с записями из `characters`. Мару, Тео, животных и выдуманных героев создаём отдельно через контракт персонажей, после чего выбираем их при генерации истории.

### 5.3. Допустимые enum-значения

```ts
type HairColor =
  | 'blonde' | 'light_brown' | 'dark_brown' | 'black' | 'red'
  | 'auburn' | 'grey' | 'white' | 'salt_and_pepper';

type HairLength = 'very_short' | 'short' | 'medium' | 'long' | 'very_long';

type HairStyle =
  | 'straight' | 'wavy' | 'curly' | 'coily' | 'braided' | 'ponytail'
  | 'bun' | 'afro' | 'dreadlocks' | 'mohawk' | 'side_part' | 'slicked_back';

type EyeColor =
  | 'blue' | 'light_blue' | 'dark_blue' | 'green'
  | 'hazel' | 'brown' | 'dark_brown' | 'grey';

type SkinTone =
  | 'very_light' | 'light' | 'medium' | 'tan'
  | 'brown' | 'dark_brown' | 'very_dark';

type DistinctiveFeature =
  | 'freckles' | 'dimples' | 'glasses' | 'birthmark' | 'round_face'
  | 'oval_face' | 'braces' | 'earrings' | 'curly_hair' | 'straight_hair'
  | 'braids' | 'ponytail' | 'kind_smile' | 'bright_eyes'
  | 'long_eyelashes' | 'rosy_cheeks';

type PersonalityTrait =
  | 'curious' | 'brave' | 'shy' | 'energetic' | 'calm' | 'thoughtful'
  | 'playful' | 'creative' | 'analytical' | 'empathetic' | 'independent'
  | 'sociable' | 'careful' | 'adventurous' | 'sensitive' | 'confident'
  | 'patient' | 'impulsive';

type FavoriteActivity =
  | 'reading' | 'drawing' | 'painting' | 'sports' | 'football' | 'swimming'
  | 'dancing' | 'singing' | 'music' | 'playing_instruments' | 'building'
  | 'crafts' | 'cooking' | 'nature' | 'animals' | 'computers' | 'puzzles'
  | 'board_games';

type Interest =
  | 'dinosaurs' | 'space' | 'animals' | 'cars' | 'trains' | 'planes' | 'ships'
  | 'princesses' | 'knights' | 'dragons' | 'magic' | 'science' | 'nature'
  | 'ocean' | 'forest' | 'robots' | 'superheroes' | 'fairy_tales'
  | 'adventure' | 'family' | 'friends' | 'school' | 'sports';

type CommonFear =
  | 'dark' | 'loud_noises' | 'monsters' | 'being_alone' | 'strangers'
  | 'heights' | 'animals' | 'doctors' | 'thunder' | 'separation_from_parents';

type AvoidTopic =
  | 'darkness' | 'scary_creatures' | 'violence' | 'being_lost'
  | 'abandonment' | 'death' | 'illness' | 'conflict' | 'loud_situations';
```

### 5.4. Канонические структурированные поля семи профилей

Длинное значение `aiGeneratedDescription` для каждого ребёнка находится в его разделе ниже. Остальные поля задаём так:

#### Ноа

```json
{
  "name": "Ноа",
  "birthDate": "2025-05-10",
  "languages": ["uk"],
  "storyCreationMode": "artisan",
  "storyTextSizeMultiplier": 1,
  "descriptionLanguage": "en",
  "appearanceTraits": {
    "hairColor": "red",
    "hairLength": "short",
    "hairStyle": "curly",
    "eyeColor": "grey",
    "skinTone": "very_light",
    "distinctiveFeatures": ["curly_hair", "round_face", "rosy_cheeks"]
  },
  "personality": {
    "traits": ["calm", "careful", "curious"],
    "favoriteActivities": ["animals", "nature"]
  },
  "interests": ["animals", "family", "fairy_tales"],
  "sensitivities": {
    "fearLevel": "low",
    "commonFears": ["separation_from_parents"],
    "avoidTopics": ["loud_situations"]
  },
  "familyCast": { "mother": "Мара" },
  "authorPseudonym": null,
  "authorAboutMe": null,
  "childDataConsentAccepted": true
}
```

#### Лина

```json
{
  "name": "Лина",
  "birthDate": "2023-04-18",
  "languages": ["en", "de", "pl"],
  "storyCreationMode": "artisan",
  "storyTextSizeMultiplier": 1,
  "descriptionLanguage": "en",
  "appearanceTraits": {
    "hairColor": "blonde",
    "hairLength": "short",
    "hairStyle": "straight",
    "eyeColor": "blue",
    "skinTone": "light",
    "distinctiveFeatures": ["glasses", "straight_hair", "round_face"]
  },
  "personality": {
    "traits": ["sociable", "curious", "careful"],
    "favoriteActivities": ["puzzles", "drawing", "reading"]
  },
  "interests": ["animals", "friends", "family"],
  "sensitivities": {
    "fearLevel": "low",
    "commonFears": ["loud_noises"],
    "avoidTopics": ["loud_situations"]
  },
  "authorPseudonym": null,
  "authorAboutMe": null,
  "childDataConsentAccepted": true
}
```

#### Майя

```json
{
  "name": "Майя",
  "birthDate": "2021-03-10",
  "languages": ["es", "fr", "pl"],
  "storyCreationMode": "artisan",
  "storyTextSizeMultiplier": 1,
  "descriptionLanguage": "en",
  "appearanceTraits": {
    "hairColor": "dark_brown",
    "hairLength": "long",
    "hairStyle": "wavy",
    "eyeColor": "brown",
    "skinTone": "medium",
    "distinctiveFeatures": ["freckles", "bright_eyes", "oval_face"]
  },
  "personality": {
    "traits": ["creative", "sociable", "curious"],
    "favoriteActivities": ["drawing", "painting", "music"]
  },
  "interests": ["forest", "nature", "adventure", "family"],
  "sensitivities": { "fearLevel": "none" },
  "authorPseudonym": null,
  "authorAboutMe": null,
  "childDataConsentAccepted": true
}
```

#### Сами

```json
{
  "name": "Сами",
  "birthDate": "2019-02-14",
  "languages": ["ru", "es", "fr"],
  "storyCreationMode": "artisan",
  "storyTextSizeMultiplier": 1,
  "descriptionLanguage": "en",
  "appearanceTraits": {
    "hairColor": "black",
    "hairLength": "short",
    "hairStyle": "curly",
    "eyeColor": "brown",
    "skinTone": "tan",
    "distinctiveFeatures": ["glasses", "dimples", "curly_hair"]
  },
  "personality": {
    "traits": ["brave", "adventurous", "careful", "curious"],
    "favoriteActivities": ["sports", "swimming", "building"]
  },
  "interests": ["dragons", "ocean", "adventure", "magic"],
  "sensitivities": { "fearLevel": "low" },
  "authorPseudonym": null,
  "authorAboutMe": null,
  "childDataConsentAccepted": true
}
```

#### Амара

```json
{
  "name": "Амара",
  "birthDate": "2018-04-01",
  "languages": ["uk", "en", "de"],
  "storyCreationMode": "artisan",
  "storyTextSizeMultiplier": 1,
  "descriptionLanguage": "en",
  "appearanceTraits": {
    "hairColor": "black",
    "hairLength": "long",
    "hairStyle": "braided",
    "eyeColor": "dark_brown",
    "skinTone": "brown",
    "distinctiveFeatures": ["braids", "bright_eyes", "oval_face"]
  },
  "personality": {
    "traits": ["confident", "empathetic", "brave", "patient"],
    "favoriteActivities": ["sports", "dancing", "music"]
  },
  "interests": ["superheroes", "sports", "friends"],
  "sensitivities": { "fearLevel": "none" },
  "familyCast": { "father": "Тео" },
  "authorPseudonym": null,
  "authorAboutMe": null,
  "childDataConsentAccepted": true
}
```

#### Рави

```json
{
  "name": "Рави",
  "birthDate": "2016-02-16",
  "languages": ["de", "en", "pl"],
  "storyCreationMode": "artisan",
  "storyTextSizeMultiplier": 1,
  "descriptionLanguage": "en",
  "appearanceTraits": {
    "hairColor": "black",
    "hairLength": "short",
    "hairStyle": "side_part",
    "eyeColor": "dark_brown",
    "skinTone": "dark_brown",
    "distinctiveFeatures": ["birthmark", "straight_hair", "oval_face"]
  },
  "personality": {
    "traits": ["analytical", "thoughtful", "curious", "patient"],
    "favoriteActivities": ["computers", "building", "puzzles", "reading"]
  },
  "interests": ["robots", "science", "space", "adventure"],
  "sensitivities": { "fearLevel": "low" },
  "authorPseudonym": null,
  "authorAboutMe": null,
  "childDataConsentAccepted": true
}
```

#### Зури

```json
{
  "name": "Зури",
  "birthDate": "2014-03-08",
  "languages": ["ru", "es", "fr"],
  "storyCreationMode": "artisan",
  "storyTextSizeMultiplier": 1,
  "descriptionLanguage": "en",
  "appearanceTraits": {
    "hairColor": "black",
    "hairLength": "medium",
    "hairStyle": "bun",
    "eyeColor": "dark_brown",
    "skinTone": "very_dark",
    "distinctiveFeatures": ["glasses", "bright_eyes", "oval_face"]
  },
  "personality": {
    "traits": ["independent", "analytical", "thoughtful", "confident"],
    "favoriteActivities": ["reading", "puzzles", "computers", "drawing"]
  },
  "interests": ["space", "magic", "science", "adventure"],
  "sensitivities": { "fearLevel": "none" },
  "authorPseudonym": null,
  "authorAboutMe": null,
  "childDataConsentAccepted": true
}
```

Во все семь фактических запросов добавляется соответствующее полное значение `aiGeneratedDescription` из раздела 6.

### 5.5. Что приложение делает после POST

1. Проверяет авторизацию, родительскую сессию, согласие и лимит `child_profiles_limit`.
2. Валидирует вход через `CreateChildProfileSchema`.
3. Создаёт запись в `child_profiles`.
4. Автоматически создаёт зеркальную запись в `characters` с `type: 'person'`, `subtype: 'child'` и ссылкой `childProfileId`.
5. Если есть фото, генерирует turnaround по фото. Если фото нет, но есть `aiGeneratedDescription`, генерирует turnaround по описанию.
6. Если генерация turnaround завершается ошибкой, удаляет только что созданный профиль и возвращает `500 Failed to generate character model`.
7. Повторно читает профиль и возвращает его вместе с вычисленным возрастом и данными turnaround.

Создание блокирует HTTP-ответ до завершения генерации образа; клиент использует timeout 120 секунд.

**Реализовано:** непосредственно перед генерацией `routes/children.ts` вычисляет `currentAgeMonths` через `getAgeData(new Date(profile.birthDate))`. Для детского вызова `generateTurnaroundSheetFromReference` и для `generateTurnaroundSheetFromDescription` это обязательный внутренний параметр. Он проходит через `turnaroundSheetService`, `ImageDomainService` и оба prompt builder — для генерации по фотографии и по текстовому описанию.

Prompt builder переводит количество месяцев в отдельную строку, например `CURRENT AGE: 1 year and 2 months`, и помечает серверный возраст как авторитетный для пропорций тела и зрелости лица. Клиент по-прежнему не вычисляет и не присылает возраст отдельно: источником истины остаётся `birthDate`.

Ожидаемые значения на 18.07.2026:

| Ребёнок | `totalMonths` | Строка для prompt |
|---|---:|---|
| Ноа | 14 | `CURRENT AGE: 1 year and 2 months` |
| Лина | 39 | `CURRENT AGE: 3 years and 3 months` |
| Майя | 64 | `CURRENT AGE: 5 years and 4 months` |
| Сами | 89 | `CURRENT AGE: 7 years and 5 months` |
| Амара | 99 | `CURRENT AGE: 8 years and 3 months` |
| Рави | 125 | `CURRENT AGE: 10 years and 5 months` |
| Зури | 148 | `CURRENT AGE: 12 years and 4 months` |

### 5.6. Контракт успешного ответа

```ts
type CreateChildProfileResponse = {
  status: 'success';
  child: {
    id: string;
    userId: string;
    name: string;
    birthDate: string;
    languages: string[];
    storyCreationMode: 'instant' | 'artisan';
    storyTextSizeMultiplier: number;
    referencePhotos?: Array<{ url: string; uploadedAt?: string }>;
    appearanceTraits?: Record<string, unknown>;
    personality?: Record<string, unknown>;
    interests?: string[];
    sensitivities?: Record<string, unknown>;
    familyCast?: Record<string, string>;
    aiGeneratedDescription?: string;
    descriptionLanguage?: string;
    turnaroundSheet?: {
      url: string;
      frontUrl?: string;
      frontThumbnailUrl?: string;
      generatedAt?: string;
      sourcePhotoUrl?: string;
    };
    age: {
      years: number;
      months: number;
      totalMonths: number;
      ageGroup: string;
      isBirthdayToday: boolean;
      daysUntilBirthday: number;
    };
    isActive: boolean;
  };
};
```

## 6. Подробные профили детей

### 6.1. Ноа

**Идентификатор:** `noa`
**Пол и возраст:** мальчик, 1 год
**Дата рождения:** 10.05.2025
**Группа:** `1y`
**Язык профиля:** украинский (`uk`)
**Оттенок кожи:** `very light`

Ноа ростом около 78 см, с правдоподобными пропорциями годовалого ребёнка: большая круглая голова, короткая шея, пухлые руки и ноги, небольшой живот, широкая неуверенная стойка. Кожа очень светлая, нейтрально-персиковая с лёгким розовым подтоном. Лицо круглое, лоб высокий, щёки полные. Глаза большие, прохладного серо-голубого оттенка; брови очень светлые и тонкие. Нос маленький, короткий и округлый, губы небольшие.

Волосы короткие, мягкие, рыжевато-медные, с редкими детскими кудрями. Обязательный якорь — один выраженный завиток по центру лба. Одежда: горчично-жёлтый комбинезон с длинными рукавами, кремовым круглым воротником и кремовыми манжетами; на груди маленький вышитый полумесяц без текста; бледно-бирюзовые носки. Обувь для домашнего образа не используется.

Характер и пластика: спокойный, наблюдательный, сначала осторожно тянется к новому предмету, затем улыбается; движения маленькие и немного неуверенные. Нельзя изображать его как трёхлетнего ребёнка, делать длинные ноги, густую взрослую причёску или менять комбинезон.

**Значение `aiGeneratedDescription`, передаваемое в генератор:**

```text
Boy named Noa, approximately 78 cm tall, with a large round head, short neck, chubby arms and legs, small belly, and a wide slightly unsteady stance. Very light neutral peach-pink skin, round face, high forehead, full cheeks, large cool gray-blue eyes, very light thin eyebrows, tiny short rounded nose, small lips. Short soft copper-red baby curls with one clearly recognizable curl centered on the forehead. Mustard-yellow long-sleeve romper, cream Peter Pan collar and cream cuffs, one tiny embroidered crescent on the chest, pale teal socks, no shoes. Calm cautious expression. Preserve curl placement, colors, body shape, and outfit in every view.
```

### 6.2. Лина

**Идентификатор:** `lina`
**Пол и возраст:** девочка, 3 года
**Дата рождения:** 18.04.2023
**Группа:** `2-3`
**Языки профиля:** английский (`en`), немецкий (`de`), польский (`pl`)
**Оттенок кожи:** `light`

Лина ростом около 98 см. Пропорции трёхлетнего ребёнка: голова всё ещё крупная, туловище компактное, руки и ноги короткие, колени слегка округлые. Кожа светлая, нейтрально-тёплая. Лицо овально-круглое, щёки мягкие. Глаза широкие, ясные, голубые; нос маленький и слегка вздёрнутый; губы розовые. Главный лицевой якорь — матовые круглые красные очки одинакового размера, не закрывающие брови.

Волосы светло-русые с золотистым оттенком, прямое аккуратное каре до подбородка, ровная короткая чёлка на 1–1,5 см выше бровей. Концы каре слегка завёрнуты внутрь. Одежда: мятное платье А-силуэта до колена с двумя большими круглыми тёмно-красными карманами, тёмно-синие легинсы, кремовые носки и красные туфли на липучке. Никаких заколок и украшений.

Характер и пластика: разговорчивая, любопытная, любит понятные ритуалы и сначала проверяет, всё ли лежит на своём месте. Нельзя менять форму очков, добавлять длинные волосы или делать фигуру школьницы.

**Значение `aiGeneratedDescription`, передаваемое в генератор:**

```text
Girl named Lina, approximately 98 cm tall, with a relatively large head, compact torso, short limbs, and softly rounded knees. Light neutral-warm skin, oval-round face, soft cheeks, wide clear blue eyes, small slightly upturned nose, pink lips. Straight light-blonde chin-length bob with a subtle golden tone, blunt short bangs sitting 1 to 1.5 cm above the eyebrows, ends gently curving inward. Matte round red eyeglass frames, identical size and shape in every view. Mint A-line knee-length dress with exactly two large dark-red round pockets, navy leggings, cream socks, red hook-and-loop shoes. No hair clips or jewelry. Curious friendly expression. Preserve the glasses, bob silhouette, pockets, body shape, and outfit exactly.
```

### 6.3. Майя

**Идентификатор:** `maya`
**Пол и возраст:** девочка, 5 лет
**Дата рождения:** 10.03.2021
**Группа:** `4-5`
**Языки профиля:** испанский (`es`), французский (`fr`), польский (`pl`)
**Оттенок кожи:** `medium`

Майя ростом около 112 см, с энергичными пропорциями пятилетней девочки: голова умеренно крупная, конечности уже вытянуты, но сохраняют детскую мягкость. Кожа средняя, тёплого золотисто-бежево-коричневого оттенка. Лицо овальное с полными щеками. Глаза миндалевидные, тёмно-карие; брови густые. На носу и верхней части щёк находится постоянная россыпь мелких золотисто-коричневых веснушек.

Волосы густые, тёмно-коричневые, волнистые типа 2C, длиной чуть ниже плеч. Пробор слева; передняя прядь справа закреплена одной бирюзовой заколкой. Одежда: коралловая футболка, кремовая джинсовая жилетка без рисунка, бирюзовые брюки, жёлтые кеды с белой подошвой. На левом запястье простой бирюзовый браслет.

Характер и пластика: творческая, общительная, быстро замечает необычные детали, часто наклоняет голову, когда слушает. Нельзя убирать веснушки, менять сторону пробора и заколки, выпрямлять волосы или превращать жилетку в куртку.

**Значение `aiGeneratedDescription`, передаваемое в генератор:**

```text
Girl named Maya, approximately 112 cm tall, with a moderately large head and slightly lengthened but still soft child limbs. Medium warm golden beige-brown skin, oval face with full cheeks, almond-shaped dark-brown eyes, thick eyebrows, and a stable scatter of small golden-brown freckles across the nose and upper cheeks. Thick dark-brown type 2C wavy hair falling slightly below the shoulders, left side part, one front lock on her right held by a single teal hair clip. Coral T-shirt, plain cream denim vest, teal trousers, yellow sneakers with white soles, simple teal bracelet on the left wrist. Bright observant expression. Preserve freckles, part direction, clip position, hair length, body shape, and outfit exactly.
```

### 6.4. Сами

**Идентификатор:** `sami`
**Пол и возраст:** мальчик, 7 лет
**Дата рождения:** 14.02.2019
**Группа:** `6-8`
**Языки профиля:** русский (`ru`), испанский (`es`), французский (`fr`)
**Оттенок кожи:** `tan`

Сами ростом около 126 см, худощавый и подвижный, с пропорциями семилетнего ребёнка. Кожа тёплая золотисто-бронзовая. Лицо мягко-прямоугольное, глаза тёмно-карие, брови густые, нос широкий и короткий. На правой щеке при улыбке появляется заметная ямочка.

Волосы чёрные, короткие, очень густые, кудрявые типа 3C; силуэт округлый и аккуратный, без выбритых линий. Очки фиолетовые, со скруглённо-прямоугольной оправой. Одежда: зелёная куртка-бомбер без принтов, горчичная футболка, тёмно-синие джоггеры, серо-белые кроссовки с зелёными шнурками. На правой шлёвке брюк закреплён один маленький оранжевый карабин.

Характер и пластика: смелый исследователь, но не безрассудный; сначала задаёт вопрос, затем пробует. Нельзя менять оправу на круглую, добавлять выбритые узоры, переставлять карабин или изображать подростковые пропорции.

**Значение `aiGeneratedDescription`, передаваемое в генератор:**

```text
Boy named Sami, approximately 126 cm tall, lean and active. Warm golden-bronze tan skin, softly rectangular face, dark-brown eyes, thick eyebrows, broad short nose, and one visible smile dimple on the right cheek. Short dense black type 3C curls forming a neat rounded silhouette, no shaved lines. Violet softly rectangular eyeglass frames. Plain green bomber jacket, mustard T-shirt, navy joggers, gray-and-white sneakers with green laces, exactly one small orange carabiner attached to the right trouser belt loop. Brave inquisitive expression. Preserve glasses, curl silhouette, right-cheek dimple, body shape, and carabiner location exactly.
```

### 6.5. Амара

**Идентификатор:** `amara`
**Пол и возраст:** девочка, 8 лет
**Дата рождения:** 01.04.2018
**Группа:** `6-8`
**Языки профиля:** немецкий (`de`), английский (`en`), украинский (`uk`)
**Оттенок кожи:** `brown`

Амара ростом около 132 см, спортивная, но с естественными детскими пропорциями: прямые плечи, сильные ноги, без взрослой мускулатуры. Кожа насыщенного тёплого коричнево-каштанового оттенка. Лицо овальное, глаза большие тёмно-карие, брови густые и слегка изогнутые, нос широкий, губы полные.

Волосы очень тёмные, текстура 4A, центральный пробор. Причёска всегда состоит ровно из шести длинных кос: по три с каждой стороны. На конце каждой косы ровно по две жёлтые бусины — всего 12. Одежда: синий джинсовый комбинезон с длинными штанинами, кремовая футболка в широкую терракотовую полоску, бледно-голубые носки, жёлтые высокие кеды. На правом запястье тёмно-фиолетовый спортивный браслет.

Характер и пластика: уверенная, честная, соревнуется с собой и поддерживает других. Нельзя менять количество кос или бусин, делать кожу светлее, добавлять макияж или взрослые пропорции.

**Значение `aiGeneratedDescription`, передаваемое в генератор:**

```text
Girl named Amara, approximately 132 cm tall, athletic with straight shoulders and strong legs, without adult musculature. Rich warm brown chestnut skin, oval face, large dark-brown eyes, thick gently arched eyebrows, broad nose, full lips. Very dark type 4A hair with a precise center part, styled into exactly six long braids, three on each side. Exactly two yellow beads at the end of every braid, twelve beads total. Blue full-length denim overalls, cream T-shirt with broad terracotta stripes, pale-blue socks, yellow high-top sneakers, dark-violet sport wristband on the right wrist. Confident kind expression. Preserve exact braid and bead counts, skin tone, body shape, and outfit.
```

### 6.6. Рави

**Идентификатор:** `ravi`
**Пол и возраст:** мальчик, 10 лет
**Дата рождения:** 16.02.2016
**Группа:** `9-12`
**Языки профиля:** немецкий (`de`), английский (`en`), польский (`pl`)
**Оттенок кожи:** `dark brown`

Рави ростом около 143 см, стройный, с пропорциями десятилетнего ребёнка: более длинные конечности, узкие плечи, всё ещё мягкая детская линия лица. Кожа глубокого тёмно-коричневого оттенка с тёплым махагоновым подтоном. Лицо вытянуто-овальное, глаза тёмно-карие, брови густые и прямые, нос средней длины и прямой. Постоянный якорь — маленькая круглая родинка на левой щеке чуть ниже внешнего уголка глаза.

Волосы чёрные, прямые типа 1C, средней короткой длины. Глубокий пробор справа, основная масса волос аккуратно зачёсана влево. Одежда: оранжевое худи без принта, у ворота виден край тёмно-синей футболки, графитовые брюки-карго, тёмно-синие кроссовки с оранжевыми деталями. На правом запястье синие цифровые часы с пустым экраном без текста.

Характер и пластика: спокойный изобретатель и аналитик, внимательно рассматривает устройство прежде, чем его трогать. Нельзя переносить родинку, менять сторону пробора, добавлять усы или щетину, делать тело взрослым.

**Значение `aiGeneratedDescription`, передаваемое в генератор:**

```text
Boy named Ravi, approximately 143 cm tall, slender with longer limbs, narrow shoulders, and a soft child facial structure. Deep dark-brown skin with a warm mahogany undertone, elongated oval face, dark-brown eyes, thick straight eyebrows, medium straight nose. One small round mole on the left cheek slightly below the outer corner of the eye. Straight black type 1C medium-short hair, deep side part on his right, most hair neatly combed toward his left. Plain orange hoodie with a narrow navy T-shirt edge visible at the neckline, charcoal cargo trousers, navy sneakers with orange details, blue digital watch on the right wrist with a blank screen. Thoughtful analytical expression. Preserve mole location, part direction, body shape, and outfit.
```

### 6.7. Зури

**Идентификатор:** `zuri`
**Пол и возраст:** девочка, 12 лет
**Дата рождения:** 08.03.2014
**Группа:** `9-12`
**Языки профиля:** французский (`fr`), испанский (`es`), русский (`ru`)
**Оттенок кожи:** `very dark`

Зури ростом около 156 см. Это высокая двенадцатилетняя девочка, но не взрослая женщина: узкие плечи, естественная подростковая худоба, нейтральная осанка, лицо без макияжа. Кожа очень глубокого тёмного оттенка с нейтрально-холодным подтоном. Лицо овально-сердцевидное, глаза почти чёрные и миндалевидные, брови густые и прямые, нос широкий и аккуратно очерченный, губы полные.

Волосы текстуры 4B, центральный пробор, два одинаковых высоких круглых объёмных пучка. По линии лба видны короткие естественные завитки. Очки полупрозрачные, насыщенно-бирюзовые, мягкой шестигранной формы. Над левым виском закреплена одна маленькая серебристая заколка-полумесяц. Одежда: фиолетовая короткая куртка, бледно-бирюзовая футболка без рисунка, свободные чёрные карго, белые кроссовки с фиолетовыми деталями.

Характер и пластика: наблюдательная, независимая, любит загадки и сложные системы; выражение спокойное, не надменное. Нельзя изображать взрослой, добавлять макияж, менять форму очков, количество пучков или сторону заколки.

**Значение `aiGeneratedDescription`, передаваемое в генератор:**

```text
Girl named Zuri, approximately 156 cm tall, tall and slender with narrow shoulders, neutral posture, and no makeup. Very deep dark skin with a neutral-cool undertone, oval-heart-shaped face, almost-black almond eyes, thick straight eyebrows, broad refined nose, full lips. Type 4B hair with a center part and exactly two equal high round voluminous buns, with short natural baby curls along the hairline. Translucent saturated-teal soft-hexagonal glasses. Exactly one small silver crescent hair clip above the left temple. Violet cropped jacket, plain pale-teal T-shirt, loose black cargo trousers, white sneakers with violet details. Calm observant expression. Preserve glasses, two-bun silhouette, clip position, skin tone, body shape, and outfit.
```

## 7. Подробные профили постоянных персонажей

### 7.1. Мир Ноа

#### Мара — мама Ноа

**Идентификатор:** `mara`
**Тип:** родитель
**Возраст:** около 32 лет

Мара ростом около 168 см, со спокойной мягкой осанкой. Кожа очень светлая нейтрально-персиковая. Лицо овальное, скулы мягкие, глаза серо-зелёные. Волосы тёмно-рыжие, волнистые типа 2B, до плеч; собраны в низкий свободный хвост, две пряди остаются у лица. Одежда: лесно-зелёное пальто до колена, тёплый красный вязаный шарф, кремовый свитер, тёмно-синие прямые брюки и коричневые ботинки. Постоянное выражение тёплое и внимательное, без преувеличенно «идеальной» улыбки.

```text
Adult woman named Mara, Noa's mother, approximately 32 years old and 168 cm tall, gentle relaxed posture. Very light neutral peach skin, oval face, soft cheekbones, gray-green eyes. Dark-auburn type 2B shoulder-length wavy hair gathered into a low loose ponytail, with exactly two soft face-framing strands. Forest-green knee-length coat, warm-red knitted scarf, cream sweater, straight navy trousers, brown ankle boots. Warm attentive expression. Preserve hair color, low ponytail, green coat, and red scarf in every view.
```

#### Пип — кролик Ноа

**Идентификатор:** `pip`
**Тип:** животное
**Пол:** самка

Небольшая белая крольчиха с мягким округлым телом. Правое ухо полностью коричневое, левое полностью белое; оба уха стоят вертикально и чуть расходятся наружу. На правой задней лапе коричневое пятно, остальные лапы белые. Глаза тёмно-карие, нос розовый. Через левое плечо к правому боку проходит маленькая зелёная сумочка. Сумка — постоянная часть образа; внутри ничего не должно быть видно.

```text
Small female white rabbit named Pip with a soft rounded body. Her right ear is entirely warm brown and her left ear is entirely white; both ears stand upright and angle slightly outward. One brown patch on the right hind paw, all other paws white. Dark-brown eyes, small pink nose. A tiny green crossbody satchel runs from her left shoulder to her right side, with no visible contents. Preserve ear colors, right hind-paw patch, and satchel direction exactly.
```

#### Тилли — лунная моль Ноа

**Идентификатор:** `tilli`
**Тип:** выдуманный герой
**Пол:** нейтральный

Добрая маленькая лунная моль высотой около 28 см. Тело пушистое, кремово-белое, голова круглая почти без шеи. Глаза большие угольно-серые, нос отсутствует, рот — короткая тонкая дуга. Два пушистых усика заканчиваются одинаковыми лавандовыми полумесяцами. Четыре крыла: верхние крупнее нижних; основа бледно-лавандовая, кремовая кайма, на каждом верхнем крыле по одному золотистому полумесяцу. Ноги короткие, серо-лавандовые. Свет от героя очень слабый и тёплый, не меняет цвета окружающих персонажей.

```text
Gentle fictional moon moth named Tilli, approximately 28 cm tall, gender-neutral. Fluffy cream-white body, round head with almost no neck, large charcoal-gray eyes, no visible nose, tiny curved mouth. Two fluffy antennae, each ending in one identical lavender crescent. Exactly four wings: two larger upper wings and two smaller lower wings, pale lavender with cream borders; exactly one small gold crescent on each upper wing. Short gray-lavender legs. Very subtle warm glow only. Preserve wing count, crescent placement, antenna tips, and color palette exactly.
```

### 7.2. Мир Лины

#### Момо — кот Лины

**Идентификатор:** `momo`
**Тип:** животное
**Пол:** самец

Небольшой серый короткошёрстный полосатый кот. Полосы тёмно-графитовые и симметричные на лбу и щеках. Глаза крупные янтарные. Грудь белая, передние лапы белые до «запястий», задние серые. Хвост длинный, полосатый, с тёмным кончиком. На шее красный треугольный платок, узел расположен справа. Момо спокойный и немного церемонный.

```text
Small male gray short-haired tabby cat named Momo. Symmetrical dark-charcoal tabby stripes on the forehead and cheeks, large amber eyes, white chest, both front paws white up to the wrists, gray hind paws. Long striped tail with a dark tip. Red triangular neckerchief tied with the knot on his right side. Calm slightly dignified expression. Preserve stripe pattern, white paw boundaries, tail tip, and knot side exactly.
```

#### Кико — улитка-фонарь Лины

**Идентификатор:** `kiko`
**Тип:** выдуманный герой
**Пол:** самец

Маленькая волшебная улитка длиной около 24 см. Тело гладкое мятно-зелёное, нижняя часть кремовая. На двух верхних стебельках находятся тёмно-синие круглые глаза; снизу есть ровно два коротких щупальца. Раковина полупрозрачная коралловая, спираль светится тёплым жёлтым и имеет одну белую точку в центре. Свет постоянный и мягкий, не становится прожектором.

```text
Small fictional lantern snail named Kiko, approximately 24 cm long, male. Smooth mint-green body with a cream underside, two upper eye stalks ending in round dark-navy eyes, exactly two short lower feelers. Semi-transparent coral shell with a warm-yellow glowing spiral and exactly one small white point at the spiral center. Gentle stable glow, no beam. Preserve body colors, eye-stalk count, two lower feelers, and shell spiral exactly.
```

### 7.3. Мир Майи

#### Пико — корги Майи

**Идентификатор:** `pico`
**Тип:** животное
**Пол:** самец

Рыже-белый корги с короткими ногами и компактным телом. Морда, вертикальная полоса от носа ко лбу, грудь и живот белые; спина, бока и внешняя часть ушей рыжие. Уши стоят вертикально; на внешнем крае левого уха есть маленькая V-образная выемка. Глаза тёмно-карие. Ошейник королевского синего цвета, жетон круглый серебристый без текста. Хвост короткий и пушистый.

```text
Small male red-and-white corgi named Pico with short legs and a compact body. White muzzle, one centered white blaze from nose to forehead, white chest and belly; warm red back, sides, and outer ears. Both ears upright, with one small V-shaped notch on the outer edge of the left ear. Dark-brown eyes. Royal-blue collar with one plain circular silver tag, no text. Short fluffy tail. Preserve blaze shape, left-ear notch, collar color, and tag shape exactly.
```

#### Орби — воздушный скат Майи

**Идентификатор:** `orbi`
**Тип:** выдуманный герой
**Пол:** самка

Летающий скат с размахом «крыльев» около 75 см. Верх тела глубокий синий, низ кремовый. По спине дугой расположено ровно семь золотистых круглых точек. Глаза тёмно-карие находятся на верхней передней части, маленький рот — снизу. Вместо одного хвоста идут две мягкие ленточные лопасти: левая бирюзовая, правая коралловая. Орби словно плавает в воздухе; тело не должно выглядеть механическим или рыбьим с чешуёй.

```text
Friendly fictional air-swimming manta named Orbi, female, approximately 75 cm wingspan. Smooth deep-blue upper body and cream underside, exactly seven round gold dots arranged in one arc across the back. Dark-brown eyes on the upper front, tiny mouth on the underside. Exactly two soft ribbon-like tail streamers: teal on her left and coral on her right. No scales, machinery, legs, or extra fins. Preserve seven-dot arc, streamer count, left-right colors, and manta silhouette exactly.
```

### 7.4. Мир Сами

#### Лума — дракон Сами

**Идентификатор:** `luma`
**Тип:** выдуманный герой
**Пол:** самка

Маленький молодой дракон высотой около 48 см в холке. Ходит на четырёх лапах. Тело гладкое бирюзовое с очень мелкой ненавязчивой чешуёй, живот кремовый. Глаза тёмно-синие, морда короткая и дружелюбная. От макушки до конца хвоста идёт ряд мягких золотистых плавников; по одному небольшому золотому плавнику находится по бокам головы. Крыльев нет. Хвост заканчивается широким золотым плавником. На каждой лапе по три округлых пальца без острых когтей.

```text
Small young female dragon named Luma, approximately 48 cm at the shoulder, quadruped. Smooth turquoise body with very fine subtle scales, cream belly, dark-navy eyes, short friendly muzzle. A continuous row of soft gold fins runs from the top of the head along the spine to the tail; one small gold side fin on each side of the head. No wings. Broad gold fin at the tail tip. Exactly three rounded toes on each foot, no sharp claws. Preserve fin placement, wingless silhouette, colors, and toe count.
```

#### Руни — дух-компас Сами

**Идентификатор:** `runi`
**Тип:** выдуманный герой
**Пол:** нейтральный

Парящий дух высотой около 42 см. Голова и округлое тело образуют единую кремовую форму, есть короткие руки, ног нет; низ закручивается в мягкий завиток. Глаза бирюзово-зелёные, брови тёмно-синие. По бокам головы два тёмно-синих плавника-ушка. На груди встроен круглый латунный компас без букв и цифр; стрелка двухцветная, синий конец и красный конец. Над головой парит один маленький золотой ромб.

```text
Small fictional floating compass spirit named Runi, gender-neutral, approximately 42 cm tall. Cream rounded head and body form one continuous shape, two short arms, no legs, lower body ending in one soft curl. Teal-green eyes, navy eyebrows, one navy fin-like ear on each side of the head. One round brass compass embedded in the chest with no letters or numbers; its needle has one blue end and one red end. Exactly one small gold diamond floating above the head. Preserve limbless lower silhouette, compass design, ear fins, and single diamond.
```

### 7.5. Мир Амары

#### Тео — папа Амары

**Идентификатор:** `theo`
**Тип:** родитель
**Возраст:** около 39 лет

Тео ростом около 184 см. Кожа тёплого коричнево-каштанового оттенка. Лицо овально-прямоугольное, глаза тёмно-карие. Волосы чёрные, короткие, с плотными мелкими кудрями; борода короткая и аккуратная. Очки прямоугольные, тёмно-синие. Одежда: синяя вязаная кофта поверх светло-серой рубашки, тёмно-коричневые брюки и коричневые ботинки. Коричневая сумка проходит через правое плечо к левому боку.

```text
Adult man named Theo, Amara's father, approximately 39 years old and 184 cm tall. Warm brown chestnut skin, oval-rectangular face, dark-brown eyes, short dense black tight curls, neat short beard. Rectangular navy eyeglass frames. Blue knitted sweater over a light-gray shirt, dark-brown trousers, brown shoes. Brown crossbody bag strap runs from his right shoulder to his left side. Patient encouraging expression. Preserve glasses, hair, beard, blue sweater, and strap direction exactly.
```

#### Физз — облачный дух Амары

**Идентификатор:** `fizz`
**Тип:** выдуманный герой
**Пол:** нейтральный

Облачный дух высотой около 55 см. Постоянный силуэт состоит из трёх верхних и двух боковых округлых облачных долей. Цвет белый с бледно-голубыми нижними тенями. Глаза небесно-голубые, рот маленький. Есть две короткие облачные руки и две тонкие бледно-голубые ноги. На ногах одинаковые радужные ботинки с четырьмя горизонтальными полосами сверху вниз: красная, жёлтая, зелёная, синяя. Других радуг на теле нет.

```text
Small gender-neutral cloud spirit named Fizz, approximately 55 cm tall. Fixed fluffy silhouette with exactly three rounded cloud lobes on top and exactly two side lobes, white with pale-blue lower shading. Sky-blue eyes, tiny mouth, two short cloud arms, two thin pale-blue legs. Identical rainbow boots, each with exactly four horizontal color bands from top to bottom: red, yellow, green, blue. No other rainbows. Preserve lobe counts, limb design, boot shape, and band order exactly.
```

#### Эмбер — огненная саламандра Амары

**Идентификатор:** `ember`
**Тип:** выдуманный герой
**Пол:** самка

Небольшая четырёхлапая саламандра длиной около 65 см. Верх тела тёмно-угольный, живот тёплый янтарный. На боках ровно восемь светящихся оранжевых пятен — по четыре с каждой стороны. Глаза золотистые. Гребень на голове состоит ровно из трёх мягких языков пламени. Кончик хвоста светится оранжевым, но открытого огня вокруг тела нет. На каждой лапе по четыре округлых пальца без когтей.

```text
Small fictional female fire salamander named Ember, quadruped, approximately 65 cm long. Dark-charcoal upper body, warm amber belly, exactly eight glowing orange spots along the sides, four on each side. Gold eyes. Head crest made of exactly three soft flame-shaped forms. Orange glowing tail tip but no open fire around the body. Exactly four rounded toes on each foot, no claws. Preserve spot count, three-part crest, color boundaries, and glowing tail tip exactly.
```

### 7.6. Мир Рави

#### Нова — робот Рави

**Идентификатор:** `nova`
**Тип:** выдуманный герой
**Пол:** нейтральный

Небольшой робот высотой около 85 см. Корпус — скруглённый прямоугольник с латунной рамой и глубокими синими панелями. Голова круглая, лицо — тёмный круглый экран с двумя бледно-голубыми овальными глазами и короткой линией рта; никакого текста и цифр. Суставы круглые латунные. На каждой руке по четыре пальца, стопы широкие. На груди одна бледно-голубая пятиконечная звезда. Сзади головы две короткие одинаковые латунные антенны.

```text
Small friendly gender-neutral robot named Nova, approximately 85 cm tall. Rounded-rectangle torso with a brass frame and deep-blue panels. Round head with one dark circular face screen showing exactly two pale-blue oval eyes and one short mouth line, no text or numbers. Round brass joints, exactly four fingers on each hand, broad stable feet. Exactly one pale-blue five-point star centered on the chest. Exactly two short identical brass antennae at the back of the head. Preserve materials, panel layout, star, antenna count, and face design.
```

#### Квилл — бумажная сова Рави

**Идентификатор:** `quill`
**Тип:** выдуманный герой
**Пол:** самец

Бумажная сова высотой около 46 см. Оперение складывается из кремовых слоёв бумаги с тонкими чернильно-синими краями. Глаза янтарные, вокруг них два тёмно-синих круглых кольца. Клюв небольшой латунный. Крылья выглядят как перекрывающиеся бумажные листья. На груди ровно три тёмно-синие отметины в форме буквы V, расположенные вертикально. Лапы латунные. Никаких очков, книги, пера для письма или напечатанного текста.

```text
Small fictional male paper owl named Quill, approximately 46 cm tall. Cream layered-paper feathers with thin ink-blue edges, amber eyes surrounded by two dark-blue circular eye rings, small brass beak. Wings formed from overlapping leaf-shaped paper layers. Exactly three dark-blue V-shaped marks arranged vertically on the chest. Brass talons. No glasses, books, writing quills, printed text, or loose pages. Preserve paper layering, eye rings, three chest marks, and brass details exactly.
```

### 7.7. Мир Зури

#### Веспер — космическая рысь Зури

**Идентификатор:** `vesper`
**Тип:** выдуманный герой
**Пол:** самка

Молодая космическая рысь высотой около 62 см в холке. Шерсть глубокого индиго, грудь и нижняя часть морды светлее, фиолетово-синие. Глаза светятся бирюзовым. На ушах длинные серебристые кисточки; на правом ухе маленькая V-образная выемка. По шерсти разбросаны очень тонкие серебристые звёздные точки. На левом боку ровно семь более ярких точек образуют созвездие в форме вопросительного знака. На груди серебряный полумесяц. Хвост короткий, кончик бирюзовый. Лапы крупные и мягкие, когти не видны.

```text
Young fictional female cosmic lynx named Vesper, approximately 62 cm at the shoulder. Deep-indigo fur, lighter violet-blue chest and lower muzzle, glowing teal eyes. Long silver ear tufts and one small V-shaped notch in the right ear. Fine subtle silver star speckles across the fur. Exactly seven brighter dots on the left side form a question-mark constellation. One silver crescent centered on the chest. Short lynx tail with a teal tip, large soft paws, no visible claws. Preserve right-ear notch, seven-dot constellation, chest crescent, and tail-tip color exactly.
```

## 8. Актуальная матрица 21 истории

Составы ниже уже приведены к правилу собственных миров. Персонажи из старого черновика, которые переходили от одного ребёнка к другому, заменены закреплёнными героями.

### 8.1. Обычные истории — 3 иллюстрации

| Язык | Рабочее название | Возраст | Тема | Персонажи | Стиль |
|---|---|---:|---|---|---|
| Українська | «Місяць загубив позіхання» | 1 | Укладывание спать | Ноа, Мара, Пип | Мягкая акварель |
| Русский | «Тропинка светлячков» | 7 | Зачарованный лес | Сами, Лума, Руни | Фетровая аппликация |
| English | “Momo’s Quiet Morning” | 3 | Животные и утренние привычки | Лина, Момо, Кико | Пластилин |
| Español | “Las dos canciones de Maya” | 5 | Семьи и культуры | Майя, Пико | Цветные карандаши |
| Deutsch | “Lina und der mutige kleine Schritt” | 3 | Адаптация к новому | Лина, Момо, Кико | Цветные карандаши |
| Français | “La lanterne de Mamie” | 5 | Праздники и традиции | Майя, Орби | Мягкая акварель |
| Polski | „Ravi i kompas dżungli” | 10 | Приключение в джунглях | Рави, Нова, Квилл | Фетровая аппликация |

### 8.2. Комиксы — ориентировочно 8 страниц

| Язык | Рабочее название | Возраст | Тема | Персонажи | Стиль |
|---|---|---:|---|---|---|
| Українська | «Естафета чесних кроків» | 8 | Спорт и соревнования | Амара, Тео, Эмбер | Comic line |
| Русский | «Город, который отвечал завтра» | 12 | Фантастика, время и технологии | Зури, Веспер | Лёгкое аниме |
| English | “The Power of Listening” | 8 | Суперсилы | Амара, Физз | Comic line |
| Español | “El mapa de la marea” | 7 | Морские сокровища | Сами, Лума, Руни | Comic line |
| Deutsch | “Die Werkstatt der fliegenden Räder” | 10 | Изобретатели | Рави, Нова, Квилл | Comic line |
| Français | “Luma et la forêt des géants” | 7 | Фантастические существа | Сами, Лума | Magical shōjo |
| Polski | „Stacja po drugiej stronie Słońca” | 10 | Космическая одиссея | Рави, Нова | Тёплый 3D-комикс |

### 8.3. Mixed — проза и 3 комикс-блока

| Язык | Рабочее название | Возраст | Тема | Персонажи | Стиль |
|---|---|---:|---|---|---|
| Українська | «Таємниця годинника на горищі» | 8 | Тайны и детективы | Амара, Тео, Физз | Спокойная ночная иллюстрация |
| Русский | «Шорохи доброго чердака» | 7 | Возрастные страшилки | Сами, Лума, Руни | Night calm |
| English | “Why the Moon Follows Us” | 10 | Научные факты | Рави, Нова, Квилл | Тёплый 3D |
| Español | “La estación bajo el hielo” | 12 | Экспедиции и путешествия | Зури, Веспер | Тёплый 3D |
| Deutsch | “Die Brücke aus Mondlicht” | 8 | Средневековые герои | Амара, Тео, Физз | Magical shōjo |
| Français | “L’école des sorts oubliés” | 12 | Магия и волшебники | Зури, Веспер | Лёгкое аниме |
| Polski | „Dwa domy, jedna opowieść” | 5 | Семьи и культуры | Майя, Пико, Орби | Цветные карандаши |

Перед генерацией каждый синопсис нужно проверить на соответствие названию после замены состава. Например, бабушка в «La lanterne de Mamie» может оставаться сюжетным неперсонализированным персонажем, но основным визуально консистентным составом остаются Майя и Орби. Польская история про джунгли перенесена с Майи на Рави, потому что production-card `jungle_adventures` поддерживает только группы `6-8` и `9-12`; обычный wizard не предложил бы её Майе из группы `4-5`. Польский mixed перенесён с Лины на Майю, Пико и Орби: production-card `families_cultures` не поддерживает группу `2-3`, а у Майи включён польский язык и уже закреплена эта постоянная команда.

## 9. Правила консистентности при генерации историй

- В каждую генерацию передавать один и тот же утверждённый turnaround ребёнка и выбранных постоянных персонажей.
- В публичный create-request передавать профиль двумя полями: `childProfileId` задаёт возрастной и sensitivity-контекст, а `selectedChildren: [childProfileId]` явно включает ребёнка и его turnaround в сюжет. Одного `childProfileId` для визуальной персонализации недостаточно.
- Внутри истории зафиксировать базовую одежду либо заранее создать отдельный согласованный outfit plate. Не менять одежду между сценами без сюжетной причины.
- Не переносить Пип, Момо, Пико, Мару, Тео и выдуманных героев в мир другого ребёнка в первой демонстрационной серии.
- Сохранять точное число бусин, кос, пятен, точек, плавников, антенн и других счётных признаков.
- Не использовать цветное освещение для определения оттенка кожи на референсах; референсы должны быть нейтральными.
- Язык текста и культурный контекст могут меняться, но этнические черты и оттенок кожи ребёнка не должны случайно меняться вместе с языком.
- Текстовые пузыри в комиксах должны оставаться отдельными структурированными данными, а не только быть запечёнными в изображение.
- Для mixed-историй порядок чтения должен быть явно задан данными и одинаково воспроизводиться в публичном reader.
- До публикации провести визуальную проверку лица, волос, одежды, аксессуаров и ключевых отметин на всех страницах.

## 10. Порядок производства

1. Утвердить этот состав и описания.
2. Создать 7 детских профилей через `POST /api/v1/children`; приложение автоматически вычислит текущий возраст и создаст turnaround-листы.
3. Создать 15 постоянных персонажей через контракт персонажей; приложение автоматически создаст их turnaround-листы.
4. Отбраковать профили с несогласованными ракурсами и повторить только неудачные генерации.
5. Проверить и при необходимости скорректировать сюжеты матрицы после замены старых пересекающихся составов.
6. Завершить публичный контракт и reader для трёх форматов.
7. Генерировать сначала по одной контрольной истории каждого формата.
8. Проверить публикацию, карточки, чтение, comic bubbles и mixed reading order.
9. После контрольного прохода сгенерировать оставшиеся 18 историй.
10. Провести финальную проверку всех 21 опубликованных материалов на семи языках.

## 11. Журнал решений

- **18.07.2026:** восстановлен исходный утверждённый список детей: Ноа, Лина, Майя, Сами, Амара, Рави и Зури. Ранее предложенный альтернативный список имён признан ошибочным и не является частью плана.
- **18.07.2026:** для обычных историй выбран тариф с 3 иллюстрациями.
- **18.07.2026:** решено не показывать на карточках отметку «3 персонализированные иллюстрации».
- **18.07.2026:** к исходным трём выдуманным героям добавлены ещё семь: Тилли, Кико, Орби, Руни, Эмбер, Квилл и Веспер.
- **18.07.2026:** за каждым ребёнком закреплён собственный постоянный состав; пересечения между мирами в первой серии отменены.
- **18.07.2026:** у Ноа постоянный родитель — Мара, у Амары — Тео. У остальных детей отдельные переиспользуемые профили родителей пока не создаются.
- **18.07.2026:** исходная матрица историй пересобрана под собственные миры детей, при этом языки, форматы, темы, рабочие названия и стили сохранены.
- **18.07.2026:** учтён реальный лимит профиля — максимум 3 языка; русская обычная история передана Сами, украинская mixed-история — Амаре, польская mixed-история — Лине.
- **18.07.2026:** числовой возраст удалён из `aiGeneratedDescription`.
- **18.07.2026:** реализована отдельная передача текущего возраста из `birthDate` в prompt детского turnaround для путей по фотографии и по описанию; добавлены prompt- и service-контракты, API build проходит.
- **18.07.2026:** исходная отметка «генерация ещё не начата» закрыта: семь детских профилей и их turnaround-листы созданы в production.
- **19.07.2026:** в production созданы все 15 закреплённых персонажей и их turnaround-листы. Истории ещё не генерировались.
- **19.07.2026:** все существующие turnaround детей и постоянных персонажей приняты как визуальный канон без повторной генерации, включая ранее отмеченные зеркальные и счётные расхождения.
- **19.07.2026:** подтверждены 17 активных `scenarioCardId`: `magic_wizards`, `fantasy_creatures`, `mysteries_detectives`, `space_odyssey`, `medieval_heroes`, `sea_treasures`, `super_powers`, `enchanted_forest`, `inventors`, `jungle_adventures`, `scary_stories`, `expeditions_world_travel`, `macro_scifi`, `sports_competitions`, `science_facts`, `holidays_traditions`, `families_cultures`.
- **19.07.2026:** текущий production-период Golden подтверждён: 20 историй, 5 комиксов, 20 mixed-историй и 3 изображения/комикс-блока на историю; расход историй равен нулю.
- **19.07.2026:** исправлен ключ стиля magical shōjo: публичный `retro_magical_shojo` теперь напрямую соответствует prompt-стилю API и больше не откатывается к `soft_watercolor`.
- **19.07.2026:** для `QA Free User` настроено условное расширение текущего периода. Оно не меняет видимые лимиты заранее: при расходе 0 действуют 20 историй и 5 комиксов; после достижения порогов становятся доступны 21-я история и 6-й/7-й комиксы.

### 11.1. Фактический запуск детских профилей в production

Для демонстрационной серии выбран пустой родительский аккаунт `QA Free User` (`28e9940f-88a7-4691-9367-97d3b3325a86`) на Golden. На момент запуска у него было 0 детских профилей, а `child_profiles_limit` был без ограничения. Личный админ-аккаунт не использован: он содержит рабочие данные и имеет лимит Silver.

Запуск выполнен идемпотентным runner `create:presentation-children`. Runner валидирует payload через `CreateChildProfileSchema`, заранее проверяет квоту и конфликты имён/дат рождения, фиксирует `child_data_processing` consent, вычисляет возраст из `birthDate`, создаёт зеркало child-character и откатывает только что созданный профиль при ошибке turnaround.

| Ребёнок | Profile ID | Возраст в prompt, месяцев | Turnaround | Front crop | Thumbnail | Child-character mirror |
|---|---|---:|---|---|---|---|
| Ноа | `0e6931d4-a212-4c40-bc3e-427bdcfb1302` | 14 | готов | готов | готов | готов |
| Лина | `4bc99541-cb7a-4b2b-8d00-f43690028ac3` | 39 | готов | готов | готов | готов |
| Майя | `f846a230-9b3c-4a2b-aa7b-7fca16123377` | 64 | готов | готов | готов | готов |
| Сами | `3cfc1de8-dc2c-4ab2-935f-7482b9f33265` | 89 | готов | готов | готов | готов |
| Амара | `a88cc318-f9e1-4bf5-867d-678add58a3c6` | 99 | готов | готов | готов | готов |
| Рави | `8dfe3257-d896-4b91-87f4-8d3cade53f1a` | 125 | готов | готов | готов | готов |
| Зури | `4a84a1e1-5c1c-4ae8-b230-1c53bab77a54` | 148 | готов | готов | готов | готов |

Итоговая техническая проверка: 7 активных профилей, 7 turnaround-листов, 7 front crops, 7 thumbnails, 7 зеркальных child-character записей; `description_en` совпадает с исходным английским описанием для всех семи. В API/worker логах за время запуска ошибок не найдено.

Первый визуальный просмотр:

- Ноа, Лина, Майя, Сами и Амара сохраняют основные якоря внешности и одежды между четырьмя ракурсами.
- У Майи генератор добавил подписи ракурсов внизу; это не меняет персонажа, но нарушает требование полностью чистого листа без дополнительных элементов.
- У Рави синий элемент на запястье выглядит продублированным на обеих руках, хотя часы заданы только на правой.
- У Зури серебристый полумесяц расположен визуально над правым виском вместо левого; генератор также добавил подписи ракурсов.
- Майя, Рави и Зури приняты как визуальный канон вместе с остальными детскими профилями; повторная генерация не требуется.

### 11.2. Фактический запуск постоянных персонажей в production

Персонажи созданы на том же демонстрационном аккаунте `QA Free User` (`28e9940f-88a7-4691-9367-97d3b3325a86`) через идемпотентный runner `create:presentation-characters`. Runner валидирует каждый payload через `CreateCharacterSchema`, проверяет тип, subtype и принадлежность миру ребёнка, резервирует ручную квоту, создаёт персонажа через штатный `characterService`, генерирует текстовый turnaround без cache reuse и удаляет только что созданную запись с возвратом квоты при ошибке.

У тестового Stripe-профиля был завершившийся расчётный период. Runner обновил период только после проверки защищённых признаков демонстрационного аккаунта: точного `displayName`, Golden, `metadata.source=seedQaTestAccounts` и `metadata.code=FREE_USER`. Новый демонстрационный период: `2026-07-18T22:27:41.620Z` — `2026-08-18T22:27:41.620Z`; в metadata записан `presentationDemoPeriodOverride=true`.

| Мир ребёнка | Персонаж | Character ID | Тип / subtype | Turnaround | 7 локалей имени |
|---|---|---|---|---|---|
| Ноа | Мара | `165845c5-7f40-4453-a37a-c7cc9d1d80ad` | `person / mother` | готов | готовы |
| Ноа | Пип | `019a4d07-8839-40c1-83bf-926dc01ec9de` | `animal / rabbit` | готов | готовы |
| Ноа | Тилли | `b2064124-d3e4-4447-a88e-3b28af982dd1` | `imaginary / other_creature` | готов | готовы |
| Лина | Момо | `af090525-c98e-47ed-9804-d4a6803d9912` | `animal / cat` | готов | готовы |
| Лина | Кико | `ef1847f1-e42d-43bc-a987-c8e36dbef3dd` | `imaginary / other_creature` | готов | готовы |
| Майя | Пико | `808a4122-71ab-48f8-aca9-9c956f164e38` | `animal / dog` | готов | готовы |
| Майя | Орби | `e02215d7-2e24-4625-a8d7-36062cbbae7f` | `imaginary / other_creature` | готов | готовы |
| Сами | Лума | `71e1e1d2-9bb6-4ee0-8506-845c6afd85d3` | `imaginary / dragon` | готов | готовы |
| Сами | Руни | `989132d0-f860-4d48-a579-bed1b6c3ca15` | `imaginary / ghost` | готов | готовы |
| Амара | Тео | `9e0266ff-7023-4125-99ee-5efd9d1ce876` | `person / father` | готов | готовы |
| Амара | Физз | `824cd221-dd07-4742-8497-0930e483fad0` | `imaginary / ghost` | готов | готовы |
| Амара | Эмбер | `b214b956-a419-460c-9b8e-88cfa3cae91a` | `imaginary / other_creature` | готов | готовы |
| Рави | Нова | `e6068e52-e696-40dd-aa89-ff605cc4ba5e` | `imaginary / robot` | готов | готовы |
| Рави | Квилл | `0d3879f2-a015-4fff-914f-3eeac37d45d5` | `imaginary / other_creature` | готов | готовы |
| Зури | Веспер | `2ac651ac-ea26-4378-b026-32749b0c224e` | `imaginary / other_creature` | готов | готовы |

Итоговая техническая проверка: 15 активных персонажей, 15 turnaround-листов, 15 front crops и 15 thumbnails; у всех `description_en` совпадает с исходным английским описанием, у каждого имени есть семь локализаций. В новом периоде ровно 15 событий `character_generated` на 15 единиц — лимит Golden использован полностью, повторный идемпотентный запуск не создал дублей и не изменил квоту. После repair-запуска в свежих логах API и worker ошибок нет. Исправление ожидания фоновых локализаций развёрнуто deploy `20260718T223137Z-91223`.

### 11.3. Условное расширение квоты презентационных историй

Расширение реализовано в metadata подписки без изменения общих лимитов Golden и без миграции БД. Оно учитывается атомарным резервированием истории, отдельной квотой комиксов, `checkUsageLimit`, `GET /api/v1/entitlements` и `GET /api/v1/me/subscription-usage`.

Production-runner `configure:presentation-story-quota` допускает изменение только при одновременном совпадении защищённых признаков: user ID, `displayName=QA Free User`, план `golden`, `metadata.source=seedQaTestAccounts` и `metadata.code=FREE_USER`. Конфигурация ограничена периодом `2026-07-18T22:27:41.620Z` — `2026-08-18T22:27:41.620Z`:

- `stories_per_month`: `extra=1`, `activatesAtUsage=20`;
- `graphic_novels_per_month`: `extra=2`, `activatesAtUsage=5`;
- причина: `presentation_catalog`.

После применения повторный production dry-run вернул `changed=false`; при текущем расходе 0 эффективные лимиты остаются 20/5. Код развёрнут deploy `20260718T230854Z-54122`; API healthy, worker обновлён, production mode — `normal`, smoke-проверка завершилась с 0 ошибок.

Первый визуальный просмотр:

- Мара, Тилли, Момо, Кико, Пико, Лума, Руни, Тео и Нова имеют чистые четыре ракурса и сохраняют основные визуальные якоря.
- У Пип коричневое ухо, пятно задней лапы и направление сумочки визуально зеркальны относительно текстового описания, но согласованы между ракурсами.
- У Орби число и расположение золотых точек различаются между передним и задним ракурсами.
- У Физз генератор добавил дополнительный цветовой переход в радужных ботинках вместо строго четырёх плоских полос.
- У Эмбер число светящихся боковых пятен нельзя подтвердить как четыре на каждой стороне во всех ракурсах.
- У Квилла на груди видны четыре V-образные отметины вместо трёх, расположенных вертикально.
- У Веспер семиточечное созвездие и сторона выемки уха не воспроизводятся однозначно во всех ракурсах.
- Все шесть листов приняты как визуальный канон. При генерации историй источником истины считаются сохранённые изображения turnaround, повторная генерация не требуется.

## 12. Что осталось до массовой генерации

- Подготовить точный исполняемый manifest для 21 запроса: endpoint формата, `childProfileId`, `scenarioCardId`, goal, `imageStyle`, `selectedCharacters`, рабочее название и подробный `userNotes` на языке истории.
- Для трёх сюжетов возрастов `1y`/`2-3` использовать точные пользовательские инструкции без scenario card. Польская история про джунгли с пятилетней Майей тоже требует пользовательской инструкции либо переноса на ребёнка группы `6-8`/`9-12`, потому что `jungle_adventures` не поддерживает группу `4-5`.
- Сгенерировать три контрольных материала — обычную историю, комикс и mixed — затем проверить публикацию, пузырьки и mixed reading order на фактических production-данных.
