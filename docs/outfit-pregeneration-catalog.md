# Outfit pregeneration catalog

Рабочая заметка для предгенерации библиотеки нарядов, чтобы во время генерации истории не собирать outfit reference на лету и не раздувать стоимость каждой истории.

## Цель

Предварительно подготовить около 200 базовых нарядов, которые покрывают большую часть сценариев WonderTales: повседневность, сезоны, дом, спорт, вода, профессии, наука, история, сказка, фэнтези, sci-fi, праздники и климатические/региональные вдохновения.

Один наряд считается полноценным outfit reference: одежда на тело, верхний слой или цельный силуэт, низ при необходимости, обувь. Головные уборы, перчатки, очки, фартуки, защитные элементы и реквизит можно хранить как optional-компоненты.

Важно: все варианты должны быть age-appropriate, без сексуализации. Совместимость по презентации храним в `presentationGroups`: одно значение для явно gender-coded силуэтов или два значения `["female", "male"]`, если одежда подходит и девочке, и мальчику. Отдельный общий тег совместимости не используем.

## Метаданные для каждого наряда

Рекомендуемая структура:

```json
{
  "id": "outfit_001",
  "name": "Everyday hoodie and jeans",
  "displayName": "Cozy hoodie with jeans",
  "description": "A soft moss-green hoodie with a roomy hood, cream drawstrings, a small stitched star patch on the chest, straight blue jeans with rolled cuffs, and clean white sneakers with pale yellow laces.",
  "category": "everyday",
  "climate": ["mild"],
  "era": "modern",
  "activity": ["daily"],
  "formality": "casual",
  "presentationGroups": ["female", "male"],
  "tags": {
    "purpose": ["casual", "magic"],
    "season": ["all_season", "demi"],
    "climate": ["mild"],
    "era": ["fantasy", "timeless"],
    "setting": ["forest", "school"],
    "activity": ["walking", "spellcasting"],
    "silhouette": ["separates"],
    "footwear": ["sneakers"],
    "coverage": ["closed_toe"]
  },
  "components": {
    "top": ["hoodie"],
    "bottom": ["jeans"],
    "outerwear": [],
    "footwear": ["sneakers"],
    "accessories": []
  },
  "avoidTags": ["logos", "real_brands", "unsafe_fit"]
}
```

## Описание аутфита

У каждого наряда должно быть не только название и теги, но и подробное визуальное описание. Теги отвечают за поиск, а `description` отвечает за то, что именно будет сгенерировано: цвет, материал, принт, крой, слойность, детали и обувь.

Рекомендуемые поля:

| Поле | Назначение |
| --- | --- |
| `displayName` | короткое название для админки/каталога |
| `description` | 1-2 плотных предложения для генерации outfit reference |
| `colorPalette` | 3-5 основных цветов, чтобы можно было фильтровать и избегать повторов |
| `materials` | ткань/фактура: cotton, denim, wool, satin, rubber, leather-like, metallic fabric |
| `patterns` | floral, striped, plaid, star print, embroidered, geometric, solid |
| `detailTags` | hood, cape, pockets, belt, buttons, patches, reflective trim, lace-up boots |
| `promptNegative` | что не рисовать: logos, real brands, unsafe fit, weapons, scary gore |

Правила для `description`:

- Описывать все видимые части: верх, низ или цельный силуэт, верхний слой, обувь, optional-аксессуары.
- Не писать просто "jacket" или "dress": указывать цвет, материал, принт, крой и 1-3 отличительные детали.
- Не завязывать описание на лицо, тело, волосы, возраст или этничность персонажа. Outfit reference должен быть wardrobe-only.
- Не использовать реальные бренды, логотипы, флаги, protected characters или узнаваемые франшизы.
- Для культурно вдохновленных нарядов использовать уважительные, нейтральные формулировки без карикатурных деталей.
- Для safety-критичных сцен явно описывать обувь и защиту: closed-toe shoes, gloves, helmet, insulated boots, waterproof layer.
- Для переиспользования лучше писать описание на английском, а локализованное название можно хранить отдельно.

Примеры хороших описаний:

| Плохо | Лучше |
| --- | --- |
| `jacket and boots` | `A cropped sky-blue rain jacket with a soft yellow hood lining, white snap buttons, two rounded patch pockets, navy waterproof trousers, and bright red rubber rain boots.` |
| `formal dress` | `A knee-length emerald party dress with a satin bodice, layered tulle skirt, tiny embroidered leaf details around the hem, a cream cardigan, and gold ballet flats.` |
| `scientist outfit` | `A child-safe science lab outfit with a white lab coat, teal cotton shirt, navy trousers, clear safety goggles, purple nitrile-style gloves, and closed-toe white sneakers.` |
| `space suit` | `A rounded white EVA-style spacesuit with soft blue joint panels, orange utility tabs, a clear bubble helmet, padded gloves, and chunky white space boots with gray soles.` |
| `pirate outfit` | `A friendly pirate-inspired outfit with a navy captain coat, brass-like buttons, red waist sash, striped cream shirt, cropped brown trousers, and soft black buckle boots; no weapons.` |

## Теги для поиска

Теги лучше хранить как контролируемый словарь в `lower_snake_case`. Минимальный обязательный набор: `presentationGroups`, `purpose`, `season`, `formality`, `era`, `setting`, `activity`, `componentTags`, `footwear`, `coverage`.

### Required fields

| Поле | Тип | Зачем нужно |
| --- | --- | --- |
| `presentationGroups` | string[] | быстрый фильтр: `female`, `male`; для совместимой одежды хранить оба значения |
| `purpose` | string[] | назначение: casual, official, festive, national/cultural, sport, sleep, work |
| `season` | string[] | сезонный фильтр: summer, winter, demi, all_season |
| `formality` | enum | casual/smart/formal/ceremonial/uniform/costume |
| `era` | string[] | modern, ancient, medieval, retro, future, fantasy |
| `setting` | string[] | где наряд естественно смотрится: school, forest, ship, space, lab |
| `activity` | string[] | что персонаж делает: hiking, swimming, investigating, cooking |
| `componentTags` | string[] | нормализованные вещи: `hoodie`, `jeans`, `lab_coat`, `winter_boots` |
| `footwear` | string[] | отдельный фильтр, потому что обувь часто ломает сцену |
| `coverage` | string[] | practical coverage: waterproof, insulated, closed_toe, gloves_required |

### Suggested controlled values

| Группа | Значения |
| --- | --- |
| `presentationGroups` | `female`, `male`; отдельного общего тега совместимости нет |
| `purpose` | `casual`, `official`, `formal`, `festive`, `ceremonial`, `school`, `sleep_home`, `sport`, `swim`, `work`, `medical`, `science_lab`, `exploration`, `travel`, `rescue`, `performance`, `royal`, `magic`, `detective`, `superhero`, `space`, `sci_fi`, `historical`, `traditional_cultural`, `costume`, `protective` |
| `season` | `summer`, `winter`, `demi`, `spring`, `autumn`, `rain`, `snow`, `all_season`, `indoor` |
| `climate` | `hot`, `mild`, `cold`, `arctic`, `desert`, `tropical`, `mountain`, `coastal`, `underwater`, `space_controlled`, `space_eva` |
| `formality` | `casual`, `smart_casual`, `formal`, `ceremonial`, `uniform`, `costume`, `protective` |
| `era` | `modern`, `ancient`, `classical`, `medieval`, `renaissance`, `victorian`, `edwardian`, `retro_1920s`, `retro_1940s`, `retro_1950s`, `retro_1970s`, `future`, `fantasy`, `timeless` |
| `setting` | `home`, `school`, `city`, `village`, `garden`, `forest`, `enchanted_forest`, `jungle`, `desert`, `mountain`, `arctic`, `coast`, `beach`, `ship`, `harbor`, `underwater`, `castle`, `palace`, `market`, `library`, `museum`, `stage`, `lab`, `workshop`, `hospital`, `train`, `road_trip`, `space_station`, `spaceship`, `future_city`, `smart_city` |
| `activity` | `daily_walk`, `school_day`, `sleeping`, `relaxing`, `celebrating`, `performing`, `cooking`, `baking`, `gardening`, `building`, `repairing`, `inventing`, `experimenting`, `investigating`, `mapping`, `hiking`, `climbing`, `camping`, `sailing`, `swimming`, `surfing`, `diving`, `rescue`, `spellcasting`, `potion_making`, `creature_care`, `spacewalk`, `piloting`, `time_travel`, `vr_simulation` |
| `silhouette` | `separates`, `dress`, `skirt_set`, `suit`, `robe`, `cloak`, `uniform`, `jumpsuit`, `coveralls`, `gown`, `protective_suit`, `spacesuit`, `swimwear`, `pajamas`, `armor_inspired`, `layered` |
| `footwear` | `sneakers`, `boots`, `winter_boots`, `work_boots`, `hiking_boots`, `rain_boots`, `sandals`, `slippers`, `loafers`, `formal_shoes`, `ballet_flats`, `deck_shoes`, `water_shoes`, `flippers`, `skates`, `ski_boots`, `space_boots`, `magnetic_boots`, `anti_static_shoes` |
| `coverage` | `light`, `medium`, `warm`, `waterproof`, `insulated`, `breathable`, `full_body`, `helmet_required`, `gloves_required`, `open_toe`, `closed_toe` |

### Search strategy

1. Hard filter by `presentationGroups`: выбирать наряды, где массив содержит нужное значение; совместимые наряды содержат и `female`, и `male`.
2. Hard filter by `season`/`climate` when the scene clearly mentions weather, snow, rain, beach, desert, underwater, mountain, or space EVA.
3. Boost by `purpose`, `setting`, and `activity`: these should usually decide between similar casual outfits.
4. Penalize mismatched `era`: do not return `future` for medieval scenes, or `medieval` for sci-fi scenes, unless the plot explicitly says time travel/costume.
5. Validate `footwear` and `coverage`: no sandals in snow, no formal shoes for jungle hiking, no slippers outdoors unless the scene is intentionally home/comedy.

## Coverage map

| Блок | Кол-во | Что покрывает |
| --- | ---: | --- |
| Повседневные | 10 | базовые городские и нейтральные сцены |
| Лето и жара | 10 | пляжные, курортные, садовые, сафари-сцены |
| Дождь, осень, ветер | 10 | прогулки, школа, город, сырая погода |
| Зима и снег | 10 | снег, полюс, лыжи, холодные путешествия |
| Дом, сон, уют | 10 | спальня, утро, вечер, sick day, уютные сцены |
| Спорт | 10 | командный спорт, танец, бег, йога, фехтование |
| Вода и пляж | 10 | плавание, серфинг, спасатель, каяк, снорклинг |
| Школа, праздник, сцена | 10 | школа, концерты, выпускной, дебаты |
| Городские профессии | 10 | повар, строитель, пожарный, пилот, сервис |
| Наука и медицина | 10 | лаборатория, медицина, археология, инженерия |
| Исследования и rescue | 10 | лес, горы, пещеры, пустыня, тропики |
| Древний мир | 10 | античность, Египет, Рим, Персия, ранние культуры |
| Средневековье и ренессанс | 10 | деревня, двор, кузница, ученые, рыцарская эстетика |
| Ретро 18-20 век | 10 | 1700-е, викторианская эпоха, 1920-е, 1940-е, 1970-е |
| Королевские и церемониальные | 10 | дворец, бал, парад, маскарад, сцена |
| Фэнтези-приключения | 10 | лес, карта, алхимия, бард, магический ученик |
| Сказка и магия | 10 | волшебник, ведьма-ученик, сон, лавка зелий |
| Sci-fi и космос | 10 | космос, Марс, orbital engineering, будущий город |
| Региональные и климатические вдохновения | 10 | культурно вдохновленные, не карикатурные варианты |
| Праздники, жанры, маскарад | 10 | день рождения, Новый год, detective, pirate, steampunk |

## Деление по presentationGroups

Для первой версии плановых ассетов держим 200 вариантов с массивом `presentationGroups`: **29 female-only + 6 male-only + 165 female-and-male**. Это оставляет отдельные силуэты там, где они визуально важны, но не заставляет генерировать две версии каждого рабочего, спортивного или защитного костюма.

Правила разметки:

- `["female"]`: платья, сарафаны, юбки, ball gown, queen/princess-inspired, feminine-coded school/stage/retro outfits, modest feminine cultural silhouettes.
- `["male"]`: явно мужские плавки/исторические варианты вроде doublet/breeches, king/prince-inspired или monk-coded силуэты, если визуально они не выглядят совместимыми.
- `["female", "male"]`: все, где функция важнее gender-coded силуэта: спорт, вода, профессии, медицина, лаборатория, экспедиции, зимняя защита, скафандры, sci-fi utility suits, плащи, мантии, кигуруми, пижамы, casual и рабочая одежда.
- Если история требует конкретную профессию или защитный костюм, сначала выбирать варианты с обоими значениями; single-value использовать только если силуэт действительно важнее функциональности.

## Привязка к текущим story themes

По коду генерации реальные темы берутся из `scenario_cards`, а вариативность внутри темы - из `scenario_plot_examples` и `scenario_world_rules`. Сейчас в сидовых миграциях/скриптах видны 13 активных scenario card IDs: 11 базовых сценариев, плюс `expeditions_world_travel` и `macro_scifi`.

| Scenario card | Что часто возникает в plot examples | Какие outfit-пулы особенно нужны |
| --- | --- | --- |
| `magic_wizards` | школа магии, зелья, рынок, библиотека, волшебная кухня, турнир, платформы/поезда, магические предметы | wizard/apprentice robes, potion aprons, school uniforms, enchanted cloaks, cozy kitchen/home variants |
| `fantasy_creatures` | дракон, феникс, единорог, грифоны, русалки, ледяные духи, пустыня, пещеры, мосты | forest/ranger, creature caretaker, water/coast, winter/ice, desert, soft fantasy travel |
| `mysteries_detectives` | городские загадки, школа, музей, почта, парк, маяк, старые фото, рецепты, тайники | detective trench, school casual, museum/formal casual, bakery apron, rainy city, retro/thrift, winter clues |
| `space_odyssey` | станции, луны, фермы в космосе, почта, астероиды, zero-g sport, биологи, greenhouse ship | EVA suit, station jumpsuit, space pilot, space farmer, astronaut scientist, zero-g sport, greenhouse/utility |
| `medieval_heroes` | замок, паж, оруженосец, кузница, принцесса, турнир, герольд, монах, деревня | page/squire, knight-inspired gambeson, princess/prince, blacksmith apron, peasant tunic, monk robe, herald |
| `sea_treasures` | пиратские карты, порт, маяк, пещеры, приливы, веревочные коды, пляж, корабли | sailor/pirate-inspired, deck rain gear, beach/water, lighthouse coat, fisherman sweater, maritime museum |
| `super_powers` | школьные/городские способности, спорт, животные, растения, тени, невидимость, подземелья | normal casual first, generic superhero, school sport, utility sneakers, glow/light variants, rain/park variants |
| `enchanted_forest` | грибные тропы, дубы, ручьи, животные, каменные круги, мосты из лозы, сезоны | forest cloak, hiking boots, rain poncho, animal-guide gentle outfit, seasonal forest variants |
| `inventors` | гараж, science fair, велосипеды, дроны, перископы, лаборатория, телескоп, мастерская | lab coat, workshop apron, engineer coveralls, science fair smart casual, outdoor tinkerer, anti-static shoes |
| `jungle_adventures` | rope bridge, река, руины, ботаника, исследовательская станция, водопад, тропики | safari/field shirt, trail boots, rain gear, botanist, jungle research station, expedition camp |
| `scary_stories` | маяк, карнавал, старый дом, лесной туман, старая школа, музыка/часы/зеркала | cozy home/pajamas, detective, raincoat, old school uniform, carnival/stage, forest cloak; без horror-costume перегиба |
| `expeditions_world_travel` | горы, Арктика, ледники, пустыня, поезд, острова, мосты, локальные маршруты | travel layers, arctic, mountain, desert, train journey, hiking, coast, respectful regional/climate variants |
| `macro_scifi` | smart city, time loops, роботы, AR/VR, subway portals, future transit, memory clinic | tech casual, future courier, robot technician, AR/VR suit, time-travel city outfit, future uniforms, low-tech fallback |

Вывод для текущего списка: стоит немного усилить `expeditions_world_travel`, `macro_scifi`, `mysteries_detectives` и `super_powers`, потому что они часто используют современную/городскую одежду с одним специфическим twist, а не полноценный жанровый костюм. Для `medieval_heroes`, `space_odyssey`, `sea_treasures`, `jungle_adventures` нужны более явные genre/setting outfits.

## Список 200 нарядов

### Повседневные

001. Худи + джинсы + кеды.
002. Кардиган + чиносы + лоферы.
003. Футболка + шорты + кеды.
004. Джинсовка + платье + кроссовки.
005. Рубашка + брюки + ботинки.
006. Джемпер + юбка + туфли.
007. Комбинезон + лонгслив + кеды.
008. Поло + карго-шорты + сандалии.
009. Бомбер + джоггеры + кроссовки.
010. Casual jumpsuit + слипоны.

### Лето и жара

011. Льняная рубашка + шорты + сандалии.
012. Сарафан + панама + сандалии.
013. Топ + кюлоты + эспадрильи.
014. Safari shirt + шорты + desert boots.
015. Тельняшка + белые брюки + deck shoes.
016. Блуза + юбка + балетки.
017. Легкая накидка + шорты + сандалии.
018. Садовый фартук + легкая рубашка + кломпы.
019. Туника + широкие брюки + сандалии.
020. Курортная рубашка + укороченные брюки + лоферы.

### Дождь, осень, ветер

021. Дождевик + непромокаемые брюки + резиновые сапоги.
022. Тренч + шарф + броги.
023. Стеганая куртка + джинсы + ботинки.
024. Свитер + вельветовые брюки + ботинки.
025. Пончо + леггинсы + треккинговые кроссовки.
026. Дафлкот + шарф + ботинки.
027. Ветровка + джоггеры + кроссовки.
028. Бушлат + водолазка + челси.
029. Дождевой плащ + юбка + непромокаемые туфли.
030. Осеннее платье + кардиган + ботинки.

### Зима и снег

031. Парка + снежные брюки + snow boots.
032. Шерстяное пальто + теплые наушники + утепленные ботинки.
033. Лыжный костюм + шлем + лыжные ботинки.
034. Полярный костюм + капюшон + термоботинки.
035. Свитер + утепленный жилет + ботинки.
036. Зимний комбинезон + варежки + moon boots.
037. Костюм для фигурного катания + коньки.
038. Пуховик + шарф + походные ботинки.
039. Длинное стеганое пальто + шапка + зимние кроссовки.
040. Альпинистская куртка + штаны + mountain boots.

### Дом, сон, уют

041. Пижама + халат + тапочки.
042. Ночная рубашка + кардиган + тапочки.
043. Onesie/kigurumi + носки-тапочки.
044. Домашний костюм + мягкие сандалии.
045. Спортивный домашний костюм + тапочки.
046. Банный халат + slides.
047. Термопижама + шерстяные носки.
048. Худи + леггинсы + тапочки.
049. Sleep shirt + пижамные брюки + тапочки.
050. Уютный халат + вязаные носки.

### Спорт

051. Футбольная форма + бутсы.
052. Баскетбольная форма + высокие кроссовки.
053. Теннисный комплект + court shoes.
054. Балетная форма + балетки.
055. Кимоно для единоборств + сандалии вне татами.
056. Беговой комплект + кроссовки.
057. Велоформа + велотуфли + шлем.
058. Йога-комплект + grip socks.
059. Гимнастический купальник + разминочная куртка + мягкая обувь.
060. Фехтовальная форма + маска + фехтовальные туфли.

### Вода и пляж

061. Купальный комплект + rashguard + аквашузы.
062. Плавки + солнцезащитная футболка + сланцы.
063. Гидрокостюм + боты + ласты.
064. Форма спасателя + сандалии.
065. Серферский гидрокостюм + reef shoes.
066. Снорклинг-комплект + аквашузы.
067. Морской дождевой костюм + палубные сапоги.
068. Kayak drysuit + водные ботинки.
069. Spa wrap + тапочки.
070. Бассейновый халат + slides.

### Школа, праздник, сцена

071. Школьный блейзер + брюки или юбка + лоферы.
072. Выпускная мантия + туфли.
073. Хоровой костюм + черные туфли.
074. Оркестровый комплект + formal shoes.
075. Сценический фрак + лакированные туфли.
076. Дебатный блейзер + чиносы + лоферы.
077. Художественный халат + кеды.
078. Школьный спортивный костюм + кроссовки.
079. Праздничное платье + балетки.
080. Праздничный костюм + оксфорды.

### Городские профессии

081. Поварской китель + брюки + кломпы.
082. Пекарский фартук + колпак + нескользящая обувь.
083. Комбинезон механика + рабочие ботинки.
084. Строительный жилет + карго-брюки + защитные ботинки.
085. Почтальонская куртка + walking shoes.
086. Пожарный костюм + каска + сапоги.
087. Community safety uniform + ботинки.
088. Форма проводника поезда + туфли.
089. Пилотская форма + полированные туфли.
090. Форма бортпроводника + удобные туфли.

### Наука и медицина

091. Врачебный халат + scrubs + кломпы.
092. Медсестринский комплект + кроссовки.
093. Лабораторный халат + очки + закрытая обувь.
094. Химический фартук + перчатки + защитные ботинки.
095. Астрономическая куртка + ботинки.
096. Археологическая рубашка + карго-брюки + desert boots.
097. Палеонтологический жилет + походные ботинки.
098. Морской биолог + гидрокостюм или deck jacket + deck shoes.
099. Вулканологический защитный костюм + ботинки.
100. Инженер-робототехник + комбинезон + антистатическая обувь.

### Исследования и rescue

101. Рейнджерская форма + походные ботинки.
102. Горный спасатель + climbing boots.
103. Спелеологический комбинезон + шлем + ботинки.
104. Пустынный исследователь + платок + desert boots.
105. Тропический полевой костюм + gaiters + trail boots.
106. Арктический исследователь + утепленные сапоги.
107. Фотограф-путешественник + жилет + ботинки.
108. Картограф-съемщик + непромокаемые ботинки.
109. Camper flannel outfit + ботинки.
110. Поисково-медицинская форма + ботинки.

### Древний мир

111. Египетская льняная туника + сандалии.
112. Греческий хитон + сандалии.
113. Римская туника + сандалии.
114. Церемониальная тога + сандалии.
115. Кельтский шерстяной комплект + плащ + ботинки.
116. Северный раннесредневековый комплект + плащ + ботинки.
117. Han-inspired ученый халат + тканевая обувь.
118. Mesoamerican ceremonial-inspired комплект + сандалии.
119. Персидский придворный халат + мягкая обувь.
120. Нубийский дорожный комплект + сандалии.

### Средневековье и ренессанс

121. Крестьянская туника + ботинки.
122. Noble gown + мягкие туфли.
123. Пажеский комплект + ботинки.
124. Кузнечный фартук + рабочие ботинки.
125. Монашеская роба + сандалии.
126. Дублет + бриджи + туфли.
127. Ренессансное платье + туфли.
128. Шутовской костюм + мягкая обувь.
129. Ученая мантия + шапочка + туфли.
130. Knight-inspired gambeson + ботинки.

### Ретро 18-20 век

131. Жилет + бриджи + туфли с пряжками.
132. Riding habit + сапоги.
133. Викторианский школьный комплект + ботинки.
134. Викторианский исследователь + ботинки.
135. Edwardian sailor suit + deck shoes.
136. Платье 1920-х + T-strap shoes.
137. Newsboy outfit + ботинки.
138. Utility jumpsuit 1940-х + рабочая обувь.
139. Юбка 1950-х + saddle shoes.
140. Брюки-клеш 1970-х + platform shoes.

### Королевские и церемониальные

141. Принцесский или принцевский церемониальный костюм + плащ + ботинки.
142. Ball gown + туфли.
143. Queen-inspired gown + flats.
144. King-inspired brocade coat + сапоги.
145. Palace messenger livery + ботинки.
146. Дворцовый садовник + кломпы.
147. Ringmaster coat + высокие сапоги.
148. Оперный костюм + formal shoes.
149. Маскарадный костюм + плащ + туфли.
150. Parade outfit + танцевальная обувь.

### Фэнтези-приключения

151. Лесной путешественник + плащ + ботинки.
152. Небесный моряк + очки + ботинки.
153. Исследователь кристальных пещер + ботинки.
154. Мифический ученый + роба + ботинки.
155. Healer robe + мягкие сапоги.
156. Алхимический фартук + перчатки + ботинки.
157. Ranger cloak + кожаные ботинки.
158. Bard outfit + мягкие туфли.
159. Apprentice mage robe + pointed shoes.
160. Treasure mapper coat + ботинки.

### Сказка и магия

161. Wizard robe + тапочки.
162. Witch apprentice coat или dress + ботинки.
163. Сказочный деревенский комплект + кломпы.
164. Enchanted forest cloak + ботинки.
165. Snow royal coat + сапоги.
166. Sun royal outfit + сандалии.
167. Moon scholar robe + мягкая обувь.
168. Dream pajamas + звездный халат + тапочки.
169. Potion shopkeeper apron + ботинки.
170. Storybook hero cape + ботинки.

### Sci-fi и космос

171. EVA-скафандр + space boots.
172. Пилот корабля + jumpsuit + magnetic boots.
173. Лунный ученый + utility boots.
174. Марсианский исследователь + dust boots.
175. Orbital engineer coveralls + safety shoes.
176. Future courier jacket + кроссовки.
177. Hologram performer outfit + platform sneakers.
178. Future medic suit + sterile boots.
179. Robot technician jumpsuit + anti-static boots.
180. Deep-space diplomat uniform + polished boots.

### Региональные и климатические вдохновения

181. Alpine festival outfit + sturdy shoes.
182. Scandinavian knit outfit + зимние ботинки.
183. Yukata + geta sandals.
184. Hanbok + traditional shoes.
185. Kurta-pajama + сандалии.
186. Lehenga with modest blouse + flats.
187. Boubou + сандалии.
188. Djellaba + slippers.
189. Embroidered fiesta outfit + ботинки или туфли.
190. Andean poncho outfit + ботинки.

### Праздники, жанры, маскарад

191. Birthday outfit + party shoes.
192. New Year sparkle outfit + dress shoes.
193. Winter holiday sweater + джинсы + ботинки.
194. Harvest overalls + ботинки.
195. Spring floral outfit + лоферы.
196. Rainy parade poncho + резиновые сапоги.
197. Generic superhero suit + ботинки.
198. Detective trench outfit + броги.
199. Pirate-inspired coat + ботинки.
200. Steampunk inventor outfit + очки + ботинки.

## Прикидка словаря одежды

Для 200 готовых нарядов не нужно 600-800 полностью уникальных предметов. Лучше держать переиспользуемый словарь примерно на 220-280 базовых типов одежды и обуви, плюс optional-аксессуары.

| Слот | Оценка типов | Примеры |
| --- | ---: | --- |
| Верх | 45-60 | футболка, лонгслив, рубашка, блуза, туника, свитер, худи, китель |
| Низ | 30-40 | джинсы, чиносы, карго, шорты, юбка, леггинсы, бриджи, snow pants |
| Цельный силуэт | 35-50 | платье, комбинезон, халат, роба, мантия, скафандр, drysuit |
| Верхний/защитный слой | 45-60 | куртка, плащ, пальто, парка, жилет, пончо, gambeson, protective suit |
| Обувь | 40-55 | кеды, кроссовки, лоферы, сапоги, сандалии, ботинки, коньки, ласты |
| Головные и защитные элементы | 35-50 | шапка, панама, шлем, маска, очки, капюшон, перчатки, варежки |
| Optional аксессуары/инструменты | 40-70 | фартук, ремень, шарф, плащ, сумка, карта, инструменты, бейдж |

Практичная цель для первой версии:

- 200 pregenerated outfit references.
- 240-260 базовых component types.
- 50-70 optional accessory types.
- Для каждого outfit reference: front view как минимум; ideal target - front/side/back или turnaround, если это будет использоваться для consistent character images.

## Дедупликация с уже существующими нарядами

Перед генерацией стоит сравнить этот список с текущими уже созданными outfit assets:

1. Нормализовать названия компонентов: `hoodie`, `jeans`, `sneakers`, `winter_boots`, `lab_coat`.
2. Проставить категории и теги: `modern`, `winter`, `science`, `fantasy`, `formal`, `water`.
3. Удалить дубли по смыслу, а не только по названию.
4. Оставить минимум 10-15% запасных слотов для сценариев, которые часто появляются в реальных story prompts.
5. Для культурно вдохновленных нарядов держать нейтральные, уважительные описания без карикатурных деталей.

## Возможная следующая итерация

После дедупликации можно превратить документ в машинный `json` или `csv`:

- `id`
- `displayName`
- `description`
- `category`
- `presentationGroups`
- `purposeTags`
- `seasonTags`
- `climateTags`
- `formality`
- `eraTags`
- `settingTags`
- `activityTags`
- `silhouetteTags`
- `footwearTags`
- `coverageTags`
- `colorPalette`
- `materials`
- `patterns`
- `detailTags`
- `climate`
- `era`
- `activity`
- `components.top`
- `components.bottom`
- `components.outerwear`
- `components.footwear`
- `components.accessories`
- `promptPositive`
- `promptNegative`
- `assetStatus`
- `assetUrl`

Лучше считать теги source-of-truth и сохранять их в каталоге сразу. Не стоит потом пытаться доставать `season`, `purpose` или `presentationGroups` из `promptPositive`: формулировки будут плавать, а поиск начнет зависеть от синонимов.
