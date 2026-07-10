# Providers and Runtime Wiring

## Provider Factory

Start at `services/api/src/services/aiService.ts`.

Domain service factories:

- `getStoryDomainService()`: main text, Director text, validation text.
- `getImageDomainService()`: simple image route for ordinary story illustrations.
- `getComplexImageDomainService()`: complex image route for comic pages and scene fallback/retry.
- `getGraphicNovelDomainService()`: graphic novel script/domain logic.
- `getMixedStoryDomainService()`: mixed story script/domain logic.
- `getMapTileImageDomainService()`: map tile image route.
- `getAudioDomainService()` from `services/api/src/domain/audio`: TTS domain service.

Orchestration should call these factories/domain services, not provider classes directly.

## Text Providers

- `AI_TEXT_VENDOR`: `gemini` or `openai`.
- Gemini text provider: `services/api/src/providers/text/gemini/GeminiTextProvider.ts`.
- OpenAI text provider: `services/api/src/providers/text/openai/OpenAITextProvider.ts`.
- `AI_DIRECTOR_TEXT_VENDOR` can override Director only.
- `GEMINI_TEXT_MODEL` or legacy `AI_MODEL_VERSION` controls main Gemini text model.
- `GEMINI_VALIDATION_MODEL` controls Gemini validation model.
- `OPENAI_VALIDATION_MODEL` is the fallback provider for image validation when configured.

## Image Providers

Configured in `services/api/src/config/index.ts` under `config.image`.

- Simple route: `SIMPLE_IMAGE_PROVIDER` or `IMAGE_PROVIDER`; default `nanobananapro`.
- Simple model: `SIMPLE_IMAGE_MODEL`.
- Complex route: `COMPLEX_IMAGE_PROVIDER` or `GRAPHIC_NOVEL_IMAGE_PROVIDER`; default `nanobananapro`.
- Complex model: `COMPLEX_IMAGE_MODEL`.
- Map tile model: `MAP_TILE_IMAGE_MODEL`, otherwise simple model.
- Batch image route uses `BATCH_IMAGE_GCS_BUCKET` and `GEMINI_BATCH_MODEL`.

Provider implementations:

- `providers/image/nanobananapro/NanoBananaProProvider.ts`: Gemini Flash/Pro image route, Files API support.
- `providers/image/openai/OpenAIImageProvider.ts`: OpenAI image route.
- `providers/image/seedream/SeedreamImageProvider.ts`: BytePlus/ModelArk Seedream route.
- `providers/image/gemini/GeminiBatchImageProvider.ts`: scheduled batch image route.

## Image Validation Config

- `ENABLE_IMAGE_VALIDATION`: injects validation text provider into image domain service.
- `IMAGE_VALIDATION_MAX_RETRIES`: configured retries, capped in scene flow to at most two image attempts.
- `IMAGE_VALIDATION_USE_EDIT_REPAIR`: use image edit repair before full regeneration.
- `IMAGE_VALIDATION_MIN_ACCEPT_SCORE`: strict greater-than threshold for acceptance.
- `IMAGE_VALIDATION_SCENE_MAX_SIDE` and `IMAGE_VALIDATION_REFERENCE_MAX_SIDE`: validation-only downscale sizes.
- Reference caps: `IMAGE_MAX_CHARACTER_REFERENCE_IMAGES`, `IMAGE_MAX_OBJECT_REFERENCE_IMAGES`.
- Outfit/environment/turnaround toggles: `ENABLE_OUTFIT_PLATE`, `ENABLE_ENVIRONMENT_REFERENCE`, `ENABLE_TURNAROUND_SHEET`.

## Audio and Alignment

- `AUDIO_PROVIDER`: `elevenlabs`, `google`, `openai`, or `grok`.
- Audio providers live under `services/api/src/providers/audio`.
- `getAudioProviderByName()` is used by scripts and voice-specific flows.
- `AI_ALIGNMENT_VENDOR` currently supports ElevenLabs alignment through `providers/alignment/elevenlabs`.
- TTS prosody LLM defaults are in `config.ai.ttsProsodyTagsModel`.

## Storage, Rate Limits, Ops

- Storage provider config lives in `config.storage`; storage implementation is `services/api/src/services/assetStorageService.ts`.
- Asset serving routes live in `services/api/src/routes/assets.ts`.
- Rate limiters: `services/api/src/services/imageRateLimiter.ts`, `textRateLimiter.ts`, `audioRateLimiter.ts`.
- Runtime ops/drain mode: `services/api/src/services/opsRuntimeService.ts` and `services/api/src/routes/ops.ts`.
- Durable generation jobs: `services/api/src/repositories/GenerationJobRepository.ts` and `services/api/src/jobs/storyJobProcessor.ts`.
