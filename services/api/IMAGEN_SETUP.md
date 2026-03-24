# Image generation (Vertex Imagen removed)

Vertex **Imagen 3 / Imagen 4** (`:predict` publisher models) are no longer used in this codebase. Google is discontinuing those model endpoints; all Gemini image generation goes through **Gemini image models** (`generateContent` / batch JSONL), same as [Nano Banana setup](./NANO_BANANA_SETUP.md).

## What to configure

- **`GOOGLE_API_KEY`** — required for main scene images (`NanoBananaProProvider`) and for environment reference images / legacy `IMAGE_PROVIDER=gemini` (both use the API key path).
- **`NANO_BANANA_MODEL`** — default scene pipeline (e.g. `gemini-3-pro-image-preview`).
- **`GEMINI_FLASH_IMAGE_MODEL`** — optional; default `gemini-2.5-flash-image`. Used for:
  - Environment reference images (`getEnvironmentImageProvider`)
  - LLM text-only character turnarounds
  - `IMAGE_PROVIDER=gemini` (maps to Flash Image, not Imagen)

## Vertex-only pieces still in use

- **Batch image jobs** (`GeminiBatchImageProvider`): still uses Vertex project, location, `BATCH_IMAGE_GCS_BUCKET`, and `GEMINI_BATCH_MODEL` (default `gemini-2.5-flash-image`). See env examples and `GeminiBatchImageProvider.ts`.

## Smoke tests

```bash
cd services/api && npx tsx src/scripts/testImagenAPI.ts
cd services/api && npx tsx src/scripts/testImagen4Fast.ts
```

(Script filenames are historical; they exercise Flash Image + environment provider.)
