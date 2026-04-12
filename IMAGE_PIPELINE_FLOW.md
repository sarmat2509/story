# Image Pipeline Flow

Схема пайплайна генерации иллюстраций: от `turnaround` и Director до финального запроса в image model.

## High-Level Flow

```mermaid
flowchart TD
    A[Character source<br/>photo / reference photo / LLM text description]
    B[Turnaround generation<br/>generate turnaround sheet<br/>store on character or child record]
    C[Story text generation<br/>plain text story<br/>scenes / blocks]
    D[Director pass<br/>characters[]<br/>outfits[]<br/>environments[]<br/>illustrations[].sceneVisual]
    E[Merge into story text<br/>anchor scenes get sceneVisual<br/>environmentId and outfit bindings]
    F[Scene image preparation<br/>collect environment refs<br/>collect character refs<br/>collect outfit plates]
    G[Assign image indices<br/>Image 1 / Image 2 / Image 3]
    H[Final image prompt build<br/>systemInstruction<br/>scene prompt<br/>referenceImages[]]
    I[Image generation<br/>image provider returns final raster image]
    J[Validation / retry<br/>vision validation<br/>retry if score is low]

    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    I --> J
```

```text
Character source
  -> Turnaround generation
  -> Story text generation
  -> Director pass
  -> Merge into story text
  -> Scene image preparation
  -> Assign Image N indices
  -> Final image prompt build
  -> Image generation
  -> Validation / retry
```

## Data Flow Diagram

```mermaid
flowchart LR
    CS[Character source]
    TS[Turnaround sheet]
    PT[Plain text story]
    DB[Scene blocks]
    DR[Director JSON]
    MT[Merged story text]
    ER[Environment refs]
    CR[Character refs]
    OP[Outfit plates]
    SV[Composed sceneVisual]
    SI[systemInstruction]
    SP[scene prompt]
    RI[referenceImages[]]
    IM[Image model request]
    FI[Final image]
    VR[Validation result]

    CS --> TS
    PT --> DB
    DB --> DR
    DR --> MT
    TS --> CR
    MT --> SV
    MT --> OP
    MT --> ER
    CR --> RI
    OP --> RI
    ER --> RI
    SV --> SP
    RI --> IM
    SP --> IM
    SI --> IM
    IM --> FI
    FI --> VR
```

## 1. Character Source

В пайплайн персонаж может попасть из нескольких источников:

- пользовательский персонаж с `referencePhotos`
- ребёнок (`child profile`) с фото
- LLM-generated character без фото

Главная цель следующего шага: получить стабильный `identity reference`, который потом можно использовать в генерации сцен.

## 2. Turnaround Stage

### 2.1 Reference-based turnaround

Если у персонажа есть фото/reference, turnaround sheet генерируется из изображения.

Основной код:

- [services/api/src/services/turnaroundSheetService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/turnaroundSheetService.ts:71)

Результат:

- `turnaroundSheet.url`
- иногда `turnaroundSheet.frontUrl`
- sheet сохраняется в запись персонажа / ребёнка

### 2.2 Text-only turnaround for LLM characters

Если персонаж придуман LLM и фото нет, turnaround sheet генерируется из текстового описания.

Основной код:

- [services/api/src/services/turnaroundSheetService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/turnaroundSheetService.ts:267)

Для LLM-персонажей это может происходить лениво перед генерацией сцены:

- [services/api/src/services/storyOrchestrationService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestrationService.ts:1032)

### 2.3 What turnaround means downstream

Turnaround sheet дальше считается источником identity:

- лицо
- волосы / silhouette
- body proportions
- stable visual traits

Он не должен быть постоянным источником одежды для всех сцен. Одежда может переопределяться через `outfits[]` или outfit plates.

## 3. Story Text Stage

Сначала генерируется plain text story, потом story разбивается на сцены и блоки.

Director flow включается здесь:

- [services/api/src/services/storyOrchestrationService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestrationService.ts:528)

Если `imagesPerStory > 0`, story text дополнительно проходит через Director.

## 4. Director Stage

Director читает блоки story и генерирует структурированное visual JSON.

### 4.1 Prompt builder

- [services/api/src/prompts/text/DirectorPrompt.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/prompts/text/DirectorPrompt.ts:24)

### 4.2 Output schema

- [services/api/src/domain/story/directorSchema.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/domain/story/directorSchema.ts:9)

Director возвращает:

- `characters[]`
- `outfits[]`
- `environments[]`
- `illustrations[]`

Каждая `illustration` содержит:

- `environmentId`
- `sceneVisual.setting`
- `sceneVisual.cameraComposition.shot`
- `sceneVisual.cameraComposition.characters[]`
- `sceneVisual.lighting`

### 4.3 Director responsibilities

Director определяет:

- какой именно frozen moment рисуем
- композицию кадра
- pose / expression / gaze
- scene-specific wardrobe linkage через `outfitId`
- environment / lighting / shot

Director не должен переопределять reference-grounded identity для user-selected characters.

Это зафиксировано в prompt:

- [services/api/src/prompts/text/DirectorPrompt.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/prompts/text/DirectorPrompt.ts:116)

Смысл правила:

- `turnaround/reference image` задаёт identity
- `sceneVisual.cameraComposition.characters[].description` задаёт позу, эмоцию, действие, читаемость в кадре
- `outfits[]` задаёт одежду

## 5. Merge Stage

Director JSON мержится обратно в story text:

- [services/api/src/services/storyOrchestration/utilities.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestration/utilities.ts:201)

Что происходит:

- anchor scenes получают `sceneVisual`
- сцены получают `environmentId`
- из `cameraComposition.characters[].outfitId` собираются outfit bindings

Итог: story уже содержит всё, что нужно для image generation.

## 6. Scene Image Preparation

Перед финальной генерацией сцены orchestration собирает все reference assets.

### 6.1 Character reference paths

Сначала выбираются пути character refs:

- prefer `turnaroundSheet`
- fallback: `referencePhotos`

Код:

- [services/api/src/services/storyOrchestrationService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestrationService.ts:1120)

### 6.2 Reference metadata

Для каждого reference path строится metadata:

- character name
- turnaround or not
- source / type

Код:

- [services/api/src/services/storyOrchestrationService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestrationService.ts:1342)

### 6.3 Reference images array

Потом строится `referenceImageDataArray`, куда могут войти:

- environment ref
- character turnaround / photo refs
- outfit plate refs

Код:

- [services/api/src/services/storyOrchestrationService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestrationService.ts:1917)

### 6.4 Image numbering

После сборки refs каждому изображению назначается порядковый номер:

- `Image 1`
- `Image 2`
- `Image 3`

Этот `imageIndexMap` потом используется в prompt.

## 7. Composed SceneVisual

Перед построением финального prompt scene visual может быть обогащён:

- base environment description
- scene delta

Код:

- [services/api/src/services/storyOrchestrationService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestrationService.ts:2661)

Логика:

- если есть environment reference image, в prompt идёт в основном scene-specific delta
- если environment ref нет, setting может быть `base + delta`

## 8. Final Prompt Build

Финальный image request строится в два слоя:

- `systemInstruction`
- `prompt`

Основной код:

- [services/api/src/domain/image/ImageDomainService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/domain/image/ImageDomainService.ts:164)
- [services/api/src/prompts/image/ImagePrompts.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/prompts/image/ImagePrompts.ts:68)

### 8.1 systemInstruction

`systemInstruction` содержит статические правила:

- art style
- no text / no labels
- refs define identity
- outfit plates define clothing only
- environment refs define layout/content only

Код:

- [services/api/src/prompts/image/ImagePrompts.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/prompts/image/ImagePrompts.ts:439)

### 8.2 scene prompt

`prompt` содержит динамику конкретной сцены:

- `setting`
- `composition`
- `lighting`
- per-character scene instructions

Код:

- [services/api/src/prompts/image/ImagePrompts.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/prompts/image/ImagePrompts.ts:146)

## 9. What Exactly Goes Into the Final Image Model Request

На выходе orchestration и prompt builders в image provider уходит примерно такой пакет:

- `prompt`
- `systemInstruction`
- `referenceImages[]`
- `aspectRatio`

Код:

- [services/api/src/domain/image/ImageDomainService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/domain/image/ImageDomainService.ts:217)

### 9.1 prompt contains

- scene setting
- composition / shot
- cameraComposition characters with pose, expression, action
- lighting
- ссылки на `Image N`

### 9.2 referenceImages[] contains

Каждый ref идёт с коротким `instructionText`, например:

- `Image N: Character sheet for "Name"`
- `Image N: Environment reference`
- `Image N: OUTFIT PLATE for "Name"`

Код, который строит эти тексты:

- [services/api/src/services/storyOrchestrationService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestrationService.ts:3668)

## 10. Priority Rules in the Final Generation

Текущая иерархия источников такая:

### Identity

Источник identity:

- turnaround sheet
- reference photo

Identity включает:

- face
- hair
- silhouette
- body proportions
- stable recognizable features

### Clothing

Источник wardrobe:

- outfit plate, если он есть
- иначе `outfits[]` / `characterOutfits`

### Scene action and readability

Источник action/pose/expression:

- `sceneVisual.cameraComposition.characters[].description`

### Layout and place

Источник layout:

- environment reference image, если есть
- иначе environment text + scene delta

## 11. Conflict Protection Added in Prompt Builder

Чтобы не смешивать `reference identity` и `text identity` для одного и того же персонажа, добавлена защита:

- если персонаж уже reference-backed, inline text description внешности в scene prompt для него не пишется
- остаётся только `match Image N`

Код:

- [services/api/src/prompts/image/ImagePrompts.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/prompts/image/ImagePrompts.ts:246)

Это важно, потому что downstream image model должен получать один authoritative identity source, а не спор между:

- “вот reference image”
- “вот ещё отдельное текстовое описание лица/волос/одежды”

## 12. Validation and Retry

После генерации сцены результат валидируется.

Код:

- [services/api/src/services/storyOrchestrationService.ts](/Users/ivanryzhenko/Documents/Repository/story/services/api/src/services/storyOrchestrationService.ts:3237)

Validation использует:

- generated image
- expected character list
- outfit expectations
- turnaround refs для identity checks

Если score ниже порога, возможна перегенерация.

## 13. Final Mental Model

Удобно держать в голове такую схему:

```text
turnaround / reference photo
  -> WHO the character is

Director sceneVisual
  -> WHAT exact frozen moment to show

outfits / outfit plate
  -> WHAT the character is wearing in this scene

environment reference / environment description
  -> WHERE the moment happens

lighting + shot + composition
  -> HOW the scene is framed
```

Если всё работает правильно, то модель получает не один большой расплывчатый prompt, а набор разделённых сигналов:

- identity refs
- wardrobe refs
- environment refs
- structured scene prose

Именно это даёт наилучший шанс на консистентную финальную картинку.
