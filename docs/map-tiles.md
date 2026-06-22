# Map Tiles

## Цель

После прохождения квиза ребенок получает кусочек карты, похожий по ощущению на тайл настольной игры. Из таких тайлов он собирает свою читательскую вселенную.

Тайл должен быть не книжной иллюстрацией, а простым игровым фрагментом карты:

- квадрат `1:1`;
- без пустого места;
- крупные читаемые объекты;
- единый стиль соединительных дорог;
- соединения совместимы между тайлами;
- места на тайле связаны с конкретной историей.

## Базовая модель тайла

У каждого тайла есть четыре стороны:

- `N` — верх;
- `E` — право;
- `S` — низ;
- `W` — лево.

На каждой стороне может быть один из коннекторов:

- `PATH` — универсальная дорога;
- `WATER` — вода;
- `PORTAL` — переход: дверь, пещера, арка, шлюз;
- `none` — закрытая сторона без соединения.

Коннектор на краю должен быть стандартизирован. Внутри тайла дорога, вода или переход могут изгибаться, ветвиться и соединяться с соседними сторонами.

## Геометрия соединений

Промптом можно задать толщину соединений, но это не будет пиксельно идеально. Для production лучше считать точным только край тайла: `connector mouth` и `connector throat`.

Рекомендуемый стандарт для текущих изображений `1254 x 1254`:

```json
{
  "tileSize": 1254,
  "connectorMouthWidth": 150,
  "connectorThroatLength": 190,
  "connectorCenter": 627,
  "bridgeWidth": 170
}
```

Универсальный стандарт в долях:

```json
{
  "connectorMouthWidthRatio": 0.12,
  "connectorThroatLengthRatio": 0.15
}
```

Точный текст для промпта:

```text
Connector mouth geometry:
The tile is 1254 x 1254 px.
Every connector mouth at the tile edge must be exactly 150 px wide.
The connector mouth must be centered on the edge.
The final 190 px before the edge must be a straight rectangle with constant width, no tapering.
After that internal section, the road, river, corridor, or portal approach may curve, branch, or widen naturally.
```

Для размера, не привязанного к пикселям:

```text
Connector mouth geometry:
Every connector mouth at the tile edge must be about 12% of the tile width.
The connector mouth must be centered on the edge.
The final 15% before the edge must be straight, perpendicular to the edge, and constant-width.
After that internal section, the road, river, corridor, or portal approach may curve, branch, or widen naturally.
```

## Full-bleed правило

На тайлах не должно быть пустого места. Генератор должен понимать, что квадрат изображения и есть тайл, а не объект на белом фоне.

```text
The tile is a full-bleed square crop from a larger continuous illustrated map.
The artwork fills 100% of the square canvas edge-to-edge.
No white space, no transparent space, no blank margins, no empty corners, no floating cutout tile.
Every part of the square must contain terrain, floor, water, cave wall, forest, ship interior, or another story-relevant surface.
```

Для соединений:

```text
All connectors are inside the square artwork.
They must end flush at the tile edge, as if the map continues beyond the crop.
Do not draw roads, rivers, corridors, portals, stones, or connector tabs outside the square.
The connector reaches the edge but never extends beyond it.
```

## Единый стиль дорог

Все `PATH`-соединения во всей читательской вселенной должны иметь одинаково читаемые края. Покрытие дороги может меняться под сюжет, но кромка пути должна стыковаться между тайлами.

Базовый стиль: сюжетное покрытие + универсальная светлая кромка пути.

```text
Universal PATH edge style:
Every PATH route has story-specific surface material: forest pebbles, wooden floor path, cave stones, metal corridor panels, shore sand, or another local walking surface.
Every PATH route uses the same two continuous pale warm-ivory / light-sandstone border lines, one along each side of the route.
The border lines look hand-painted and organic, like small pale edge stones or inlaid ceramic edging.
Each border line has a soft dark contact shadow outside it, so the route remains readable on grass, wood, stone, ink, and metal.
At connector mouths, both border lines continue to the tile edge and end flush with the square crop.
Flowers, moss, leaves, papers, cables, sparkles, and panels sit outside the pale route border or lightly overlap the outside shadow while the border stays visible.

PATH width:
Every PATH connector has the same width at the tile edge.
The connector mouth is about 12% of the tile width.
The final 15% before the edge is straight, centered, and constant-width.
Inside the tile, the path may curve, branch, or form an L-shape, but it must keep the same average width.

Style consistency:
Biomes may use different route surfaces.
All biomes share the same pale paired route edging.
Forest paths, cave paths, library paths, spaceship corridors, and shore paths all line up visually because the pale edge borders meet at the same connector mouths.
```

Спецификация стиля:

```json
{
  "pathStyleId": "map_pebble_path_v1",
  "pathMaterial": {
    "stoneShape": "small rounded pebbles",
    "stoneColor": "pale gold and warm gray",
    "edgeGlow": "subtle silver-blue",
    "density": "readable, not noisy"
  }
}
```

## Внутренняя топология

Соединения внутри тайла не обязаны связывать только противоположные стороны. Левый коннектор может соединяться с нижним, верхний с правым, три стороны могут сходиться в развилку.

```text
Internal connector topology:
Connectors inside the tile do not have to connect only opposite edges.
Any connector may connect to any other connector inside the tile: opposite edges, adjacent edges, or multiple edges at one junction.
Examples: west-to-east straight path, west-to-south curved path, north-to-east stream bend, west-south-east three-way trail junction.
If two connected edges are adjacent, draw a clear broad curved route inside the tile, like an L-shaped bend.
If three or four connectors are connected, draw a clear central junction.
Never leave a connector mouth disconnected unless the tileSpec explicitly marks it as a dead end.
Independent path groups are allowed, but they must be explicit: Route 1 may connect west edge to a portal, while Route 2 connects north edge to east edge. Independent route groups stay visually separate and must not be joined by extra shortcuts.
Every tile also lists empty/no-road edges. Those edges remain scenery, floor, wall, water, or shore with no playable path mouth.
```

Пример для соседних сторон:

```text
This tile has adjacent-edge topology: the west PATH connects to the south PORTAL inside the tile.
Draw one broad L-shaped route that enters from the west edge, curves smoothly through the center, and reaches the south portal.
Do not force a west-to-east straight road unless specified.
```

Варианты `internalTopology`:

```text
N_TO_S_STRAIGHT
W_TO_E_STRAIGHT
N_TO_E_CURVE
E_TO_S_CURVE
S_TO_W_CURVE
W_TO_N_CURVE
N_E_S_JUNCTION
W_E_S_JUNCTION
N_E_S_W_CROSSROADS
DEAD_END_N
```

Пример структуры:

```json
{
  "connectors": {
    "N": "none",
    "E": "PATH",
    "S": "PORTAL",
    "W": "PATH"
  },
  "internalTopology": [
    ["W", "S"],
    ["W", "E"]
  ]
}
```

## Visual Director: новое поле

Visual Director должен возвращать один top-level `mapTile` на всю историю, отдельно от `illustrations[]`.

`sceneVisual` отвечает за обычную книжную иллюстрацию: персонажи, действие, свет, кадр.
`mapTile` отвечает за наградной тайл карты: одно место-вселенную истории, крупные объекты, признаки для выбора маски.
Он должен учитывать то, что показано на всех запланированных иллюстрациях: если в сценах есть река, мост и ворота, один тайл должен пытаться совместить `path + river + bridge + portal`.

```json
{
  "mapTile": {
    "requiredFeatures": ["path", "river", "bridge", "portal"],
    "description": "Forest river, old stone bridge, mossy iron gate in a stone archway, cathedral plaza cobblestones, dense trees, ferns, shrubs, river stones, and soft moss filling the full square tile."
  },
  "illustrations": [
    {
      "environmentId": "forest_bridge",
      "primaryRead": "Mia reaches the old bridge",
      "sceneVisual": {
        "setting": "...",
        "cameraComposition": {
          "shot": "...",
          "characters": []
        },
        "lighting": "..."
      }
    }
  ]
}
```

Director не должен выбирать точный `maskId`, пиксельные координаты или рисовать свою топологию. Он возвращает только сюжетные признаки, а код выбирает маску из конечного каталога.
Director также не должен задавать направления (`left/right/top/bottom`, `north/south/east/west`) — ориентация маски выбирается кодом.

## System prompt структуры тайла

Постоянная часть промпта вынесена в `services/api/src/prompts/image/MapTilePrompt.ts`.

Ключевая идея:

```text
Image 1 is a strict geometry control map.
Preserve the exact connector silhouettes, Bezier curve paths, junction shapes, connector mouths, edge positions, and approximate route widths from Image 1.
Keep every route centered on the Image 1 control geometry, with the same edge mouths, same route width, same bends, and same junction positions.
The geometry in Image 1 is a locked layer. Change materials and scenery, not topology.
Keep the locked route connectivity: connected route groups stay connected, independent route groups stay separate, and closed edges stay closed.
```

Дорога:

```text
Preserve the exact road silhouette, Bezier curve, junction shape, connector mouths, edge positions, and approximate width from Image 1.
Transform the flat schematic road into a finished illustrated route while preserving the locked silhouette.
The route surface adapts to the story world.
If Image 1 has several independent PATH route groups, each group is internally continuous and visually separate from the other groups.
If a PATH route ends at a portal, doorway, tunnel, cave, hatch, or airlock, the walking surface touches that portal entrance directly and stops there.
Do not create extra road mouths, extra branches, shortcuts, or joins between independent PATH route groups.
Only the route shapes from Image 1 may become playable road, trail, corridor, bridge approach, or walking-surface geometry.
Do not invent any additional roads, trails, corridors, side paths, decorative walkways, implied paths, broad clearings shaped like paths, or route-like bands outside the Image 1 route silhouettes.
Only Image 1 route shapes may use the paired pale route-border language.
All non-route areas are continuous story scenery from the tile brief. Fill them as environment, terrain, floor, water, architecture, objects, or surface detail without making them read as roads or connector routes.
Every PATH route uses two continuous pale warm-ivory / light-sandstone border lines, one along each side.
At every connector mouth, both pale border lines continue all the way to the tile edge and end flush with the square crop.
Adjacent tiles should visually connect because the pale route borders line up at matching edge mouths.
The center of the route remains natural surface texture, with no traffic stripe, lane marker, dashed guide, or diagram seam.
```

Камера:

```text
Strict orthographic/isometric board-game tile, bird's-eye view from high above at about 30 degrees.
No horizon, no foreground/background scene, no cinematic side-view, no book-cover composition.
```

## Каталог масок

Кодовый каталог находится в `services/api/src/domain/story/mapTileMasks.ts`.

Базовое правило: дорога есть на каждой маске. Даже если сюжет в первую очередь про реку, море, пещеру или помещение, на тайле все равно должен быть `PATH`-слой. Вода, портал, мост или берег добавляются как дополнительные слои, но не заменяют дорогу.

Текущий набор:

- `path-we` — дорога слева направо;
- `path-ws` — дорога слева вниз;
- `path-ne` — дорога сверху направо;
- `path-wes-junction` — T-образная развилка дороги;
- `path-ws-river-ne` — дорога слева вниз, река сверху направо, без пересечения;
- `path-ne-river-ws` — дорога сверху направо, река слева вниз, без пересечения;
- `path-we-river-ns-bridge` — единственный канонический мост: дорога слева направо пересекает реку сверху вниз;
- `path-we-bridge` — дорога слева направо с сухим мостиком/настилом, без воды;
- `path-we-bridge-portal-nw` — дорога с мостиком/настилом и веткой к порталу, без воды;
- `path-we-portal-nw` — дорога слева направо с веткой к порталу в левом верхнем квадранте;
- `path-ws-portal-nw` — дорога слева вниз с веткой к порталу;
- `path-w-portal-nw-and-path-ne` — одна дорога приходит слева и заканчивается в портале, отдельная дорога соединяет верх и право;
- `path-n-portal-nw-and-path-es` — одна дорога приходит сверху и заканчивается в портале, отдельная дорога соединяет право и низ;
- `path-e-portal-ne-and-path-ws` — одна дорога приходит справа и заканчивается в портале, отдельная дорога соединяет лево и низ;
- `path-s-portal-sw-and-path-ne` — одна дорога приходит снизу и заканчивается в портале, отдельная дорога соединяет верх и право;
- `path-w-portal-nw-and-path-ne-river-s` — версия с внутренней речкой внизу;
- `path-n-portal-nw-and-path-es-river-w` — версия с внутренней речкой слева;
- `path-e-portal-ne-and-path-ws-river-n` — версия с внутренней речкой сверху;
- `path-s-portal-sw-and-path-ne-river-e` — версия с внутренней речкой справа;
- `path-ws-river-ne-portal-nw` — дорога, река и портал без пересечения и без моста;
- `path-ws-river-ne-portal-s` — дорога к нижнему порталу и река сверху направо;
- `path-we-river-ns-bridge-portal-nw` — сложная схема с мостом и порталом;
- `path-we-pond` — дорога и отдельный водоем;
- `path-we-pond-bridge` — закрытый водоем/чернильная лужа и мостик/настил через него;
- `path-we-pond-bridge-portal-nw` — закрытый водоем/чернильная лужа, мостик/настил и портал, без реки;
- `path-ws-pond-ne` — дорога слева вниз, пруд/озеро в правом верхнем секторе;
- `path-ws-pond-ne-portal-s` — дорога к нижнему порталу и пруд/озеро в правом верхнем секторе;
- `path-ne-pond-sw` — дорога сверху направо, пруд/озеро в левом нижнем секторе;
- `path-we-lake-s` — дорога слева направо, озеро в нижней части;
- `path-ws-portal-nw-pond-ne` — портал в левом верхнем секторе и пруд/озеро в правом верхнем секторе;
- `shore-e-path-ws` — море/озеро у правого края и дорога слева вниз;
- `shore-e-path-ws-bridge` — море/озеро у правого края и мостик/пирс, без реки;
- `shore-e-path-ws-bridge-portal-nw` — море/озеро у правого края, мостик/пирс и портал, без реки;
- `shore-e-path-ws-portal-s` — море/озеро у правого края и дорога к нижнему порталу;
- `shore-e-path-ws-portal-nw` — море/озеро у правого края и портал в левом верхнем секторе;
- `shore-n-path-we` — море/озеро у верхнего края и дорога слева направо;
- `shore-s-path-we` — море/озеро у нижнего края и дорога слева направо;
- `shore-w-path-ne` — море/озеро у левого края и дорога сверху направо;
- `path-ws-portal-s` — интерьер/космос: дорога/коридор слева к нижнему порталу.

Сгенерировать PNG/SVG:

```bash
cd services/api
pnpm exec tsx src/scripts/generateMapTileMasks.ts
```

Файлы появятся в `assets/map-tile-mask-library/`, рядом с `index.json`.

## API генерации тайла

Endpoint:

```http
POST /api/v1/stories/:storyId/map-tile
```

По умолчанию endpoint берет story-level `mapTile` из `stories.metadata.mapTile`, выбирает маску, собирает prompt через `MapTilePrompt`, отправляет маску как `Image 1`, добавляет до 3 существующих картинок сцен как visual references (`Images 2-N`) и сохраняет результат как обычный image asset с `generationParams.kind = "map_tile"` и `generationParams.scope = "story"`.

Проверить выбранную маску и prompt без генерации:

```json
{
  "dryRun": true,
  "includePrompt": true
}
```

Отключить картинки истории как references:

```json
{
  "useStoryImageReferences": false
}
```

Задать конкретные completed scene image assets:

```json
{
  "referenceAssetIds": [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222"
  ]
}
```

Ограничить количество автоматически выбранных картинок:

```json
{
  "maxStoryImageReferences": 2
}
```

Передать временный override вместо сохраненного Visual Director brief:

```json
{
  "mapTile": {
    "requiredFeatures": ["path", "river", "portal"],
    "description": "Large crystal cave in wet mossy rocks, clear blue stream, small waterfall, pine forest banks, glowing crystals, roots, ferns, river pebbles, and damp cave walls filling the tile."
  },
  "includePrompt": true
}
```

Для отладки можно зафиксировать маску:

```json
{
  "maskId": "path-ws-river-ne-portal-nw",
  "dryRun": true
}
```

## Выбор маски

Выбор делается не по стилю картинки, а по обязательным признакам всей истории:

1. Director возвращает `mapTile.requiredFeatures[]`.
2. Код нормализует признаки и всегда добавляет `path`, даже если Director его забыл. `path` - обязательная дорога/коридор/тропа, главный соединительный элемент всех тайлов.
3. Остальные признаки: `river` покрывает ручей/водопад/текущую воду; `pond` покрывает пруд/маленькое озеро/лагуну; `sea` покрывает море/океан/берег; `bridge` используется только для проходимого crossing на поверхности тайла; `portal` покрывает любой вход, включая пещеру.
4. `selectMapTileMask()` выбирает только `maskId` с точным совпадением `features` и нормализованных `requiredFeatures`. Маска не имеет права добавлять токены, которых нет в запросе, и не имеет права терять запрошенные токены.
5. В image prompt передается выбранная контрольная маска как Image 1 плюс `mapTile.description`.

Если точной маски нет, это ошибка каталога масок. Нужно добавить новую маску с ровно этим набором `features`, а не использовать “похожую” маску с лишней рекой, морем, прудом, мостом или порталом.

## Картинки истории как references

Роли изображений должны быть строго разделены:

1. `Image 1` — единственный geometry control: дороги, реки, мосты, порталы, входы/выходы.
2. `Images 2-N` — существующие картинки истории, только visual references: внешний вид мест, материалы, палитра, стиль, узнаваемость храмов/ворот/мостов/консолей.

Правило в prompt:

```text
Image 1 is the only geometry control image.
Preserve Image 1 geometry exactly.

Images 2-N are visual references only.
Use them for landmark appearance, materials, color palette, and story consistency.
Do not copy their camera angle, horizon, perspective, framing, character poses, or scene composition.
Rebuild the referenced places as one orthographic/isometric board-game map tile.
```

Автовыбор references:

- берутся только `assets` этой истории;
- только `assetType = image`;
- только `status = completed`;
- только картинки, привязанные к сценам (`sceneId != null`);
- для каждой сцены сначала берется картинка, чей `assets.storagePath` совпадает с отображаемым `scenes.imageUrl`;
- если у старой сцены `scenes.imageUrl` пустой или не совпал с asset, fallback — последняя completed-картинка этой сцены;
- максимум 3 картинки по умолчанию.

Ограниченный словарь токенов:

```text
river      = текущая вода: река, ручей, водопад
pond       = закрытый водоем: пруд, маленькое озеро, лагуна
sea        = большой водоем на краю: море, океан, берег, бухта
bridge     = мост, настил, белая салфетка-дорожка или переход через препятствие; сам по себе не добавляет river/pond/sea
portal     = вход: дверь, арка, ворота, люк, шлюз, пещера, грот, тоннель, кристальная пещера, магический вход
```

`path` - обязательный токен выбора маски для дороги/коридора/тропы. `cave`, `forest`, `interior`, `spaceship` не токены выбора маски: пещера описывается как `portal` + детали в `description`; лес/помещение/корабль описываются в `description`.

Базовые multi-token маски при `randomizeDirections: false`:

```text
path + river + bridge          -> path-we-river-ns-bridge
path + river + portal          -> path-ws-river-ne-portal-s
path + river + bridge + portal -> path-we-river-ns-bridge-portal-nw
path + bridge                  -> path-we-bridge
path + bridge + portal         -> path-we-bridge-portal-nw
path + pond + bridge           -> path-we-pond-bridge
path + pond + bridge + portal  -> path-we-pond-bridge-portal-nw
path + pond + portal           -> path-ws-pond-ne-portal-s
path + sea + portal            -> shore-e-path-ws-portal-s
path + sea + bridge            -> shore-e-path-ws-bridge
path + sea + bridge + portal   -> shore-e-path-ws-bridge-portal-nw
```

Для тестов, manifest и отладки можно выключить рандом:

```ts
selectMapTileMask({
  requiredFeatures: ['path', 'river'],
  randomizeDirections: false,
});
```

Можно передать свой генератор случайности, чтобы воспроизводить выбор:

```ts
selectMapTileMask({
  requiredFeatures: ['path', 'sea'],
  random: seededRandom,
});
```

Тесты проверяют два условия:

- если селектор возвращает маску, ее `features` ровно равны `requiredFeatures`;
- неподдержанный набор токенов падает явно с просьбой добавить точную маску, а не подменяется ближайшей.

## Общий prompt template

```text
Create a simple square modular board-game map tile, 1:1.

The tile is a full-bleed square crop from a larger continuous illustrated map.
The artwork fills 100% of the square canvas edge-to-edge.
No white space, no transparent space, no blank margins, no empty corners, no floating cutout tile.
Every part of the square must contain terrain, floor, water, cave wall, forest, ship interior, or another story-relevant surface.

Use large simple readable shapes, like a mobile game map tile.
The tile must remain clear at 128x128 px.
Use only 3-5 major visual elements total.
Make the main landmark large, occupying 45-60% of the tile.
Avoid tiny decorative details.

Connector mouth geometry:
Every connector mouth at the tile edge must be about 12% of the tile width.
The connector mouth must be centered on the edge.
The final 15% before the edge must be straight, perpendicular to the edge, and constant-width.
After that internal section, the road, river, corridor, or portal approach may curve, branch, or widen naturally.

All connectors are inside the square artwork.
A connector is a broad painted route, river, corridor, or doorway path that starts inside the tile and ends flush at the exact center of the tile edge.
The connector must not protrude beyond the square.
The final 15% before the edge must be straight and perpendicular to the edge.

Internal connector topology:
Connectors inside the tile do not have to connect only opposite edges.
Any connector may connect to any other connector inside the tile: opposite edges, adjacent edges, or multiple edges at one junction.
If two connected edges are adjacent, draw a clear broad curved route inside the tile, like an L-shaped bend.
If three or four connectors are connected, draw a clear central junction.
Never leave a connector mouth disconnected unless the tileSpec explicitly marks it as a dead end.

Universal PATH edge style:
PATH surfaces adapt to the story world.
Every PATH route has the same two continuous pale warm-ivory / light-sandstone border lines.
The paired border lines reach every matching connector mouth and end flush with the tile edge.
The paired border lines remain visible through forest flowers, cave moss, library clutter, spaceship floor panels, and shoreline details.

WATER = broad clear blue stream or river inside the terrain, simple shape, few ripple marks.
PORTAL = large doorway, cave opening, tree arch, or airlock embedded inside the tile, with a short internal path leading to it.

Style: simplified watercolor board-game map, chunky silhouettes, low detail, child-friendly.
No text, no labels, no numbers, no UI, no frame, no border.

Avoid: white background, blank background, transparent margins, empty space, empty corners, floating object, sticker-like cutout, protruding roads, protruding rivers, connector tabs, external paths, tiny details, clutter, cinematic scene, book cover composition.
```

## TileSpec schema

```json
{
  "storyId": "uuid",
  "title": "Story title",
  "biome": "forest_land_night",
  "tileSize": 1254,
  "mainLandmark": "large old oak root cluster with glowing blue flowers",
  "majorElements": [
    "old oak root cluster",
    "magical pebble trail",
    "tree portal",
    "mossy forest ground"
  ],
  "connectors": {
    "N": "none",
    "E": "PATH",
    "S": "PORTAL",
    "W": "PATH"
  },
  "internalTopology": [
    ["W", "E"],
    ["W", "S"]
  ],
  "connectorGeometry": {
    "mouthWidthRatio": 0.12,
    "throatLengthRatio": 0.15,
    "constantWidthAtEdge": true,
    "centeredOnEdge": true,
    "insideCanvasOnly": true
  },
  "pathStyleId": "map_pebble_path_v1"
}
```

## Примеры для трех историй

### `b1c4b6c8-af4d-4139-bf32-c7e212e154fe`

`Скарби вечірньої стежки`

```json
{
  "storyId": "b1c4b6c8-af4d-4139-bf32-c7e212e154fe",
  "title": "Скарби вечірньої стежки",
  "biome": "forest_land_night",
  "fullBleedSurface": "dark mossy evening forest floor fills the whole square to all edges",
  "mainLandmark": "one large old oak root cluster with a few large glowing blue flowers",
  "majorElements": [
    "old oak root cluster",
    "broad magical pebble trail",
    "bottom tree portal",
    "small warm campfire glow",
    "mossy forest ground"
  ],
  "connectors": {
    "N": "none",
    "E": "PATH",
    "S": "PORTAL",
    "W": "PATH"
  },
  "internalTopology": [
    ["W", "E"],
    ["W", "S"]
  ]
}
```

### `333fe356-2503-44e7-9e27-5ae0e277f8a5`

`Співаючий кристал таємничої печери`

```json
{
  "storyId": "333fe356-2503-44e7-9e27-5ae0e277f8a5",
  "title": "Співаючий кристал таємничої печери",
  "biome": "forest_water_cave",
  "fullBleedSurface": "pine forest bank, wet moss, rock, and water fill the whole square to all edges",
  "mainLandmark": "one broad magical blue stream flowing uphill through the center",
  "majorElements": [
    "central blue stream",
    "large old oak root shape",
    "large blue stone",
    "crystal cave portal",
    "mossy rock banks"
  ],
  "connectors": {
    "N": "WATER",
    "E": "PORTAL",
    "S": "WATER",
    "W": "PATH"
  },
  "internalTopology": [
    ["N", "S"],
    ["W", "E"]
  ]
}
```

### `bcd406b2-0ea9-4f2c-be87-d4ebff542645`

`Срібний міст серед зірок`

```json
{
  "storyId": "bcd406b2-0ea9-4f2c-be87-d4ebff542645",
  "title": "Срібний міст серед зірок",
  "biome": "starship_interior_space",
  "fullBleedSurface": "spaceship cockpit floor, wall, viewport, and metal panels fill the whole square to all edges",
  "mainLandmark": "one large simple round control console and one large panoramic viewport",
  "majorElements": [
    "large round console",
    "large viewport with simple planet and stars",
    "broad magical pebble route inlaid into metal floor",
    "bottom airlock portal",
    "large metal floor panels"
  ],
  "connectors": {
    "N": "none",
    "E": "PATH",
    "S": "PORTAL",
    "W": "PATH"
  },
  "internalTopology": [
    ["W", "E"],
    ["W", "S"]
  ]
}
```

## Production recommendation

Для прототипа можно полагаться на prompt. Для production стоит сделать соединения детерминированными:

1. Генератор рисует общий биом и крупные story-объекты.
2. Система поверх или через маску добавляет стандартизированные края соединений.
3. Последние `15%` у края всегда рисуются кодом, SVG, canvas overlay или контролируемым post-processing.
4. Визуальный стиль краев дорог остается тем же: `map_path_edge_v1`.

Так карта будет выглядеть художественно, но тайлы будут стыковаться надежно.

## QA checklist

Перед принятием тайла проверить:

- квадрат `1:1`;
- нет белых полей, пустых углов, прозрачных отступов;
- главный объект крупный и читается на `128x128`;
- всего `3-5` крупных элементов;
- нет мелкого декоративного шума;
- все коннекторы находятся внутри изображения;
- коннекторы заканчиваются ровно на краю, не выступают наружу;
- ширина всех `PATH`-соединений на краю одинаковая;
- `PATH` использует единый стиль `map_pebble_path_v1`;
- внутренняя топология соответствует `tileSpec`;
- нет лишних дорог, рек, порталов или случайных отверстий на закрытых сторонах.
