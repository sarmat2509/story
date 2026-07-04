---
name: wondertales-outfit-pregen
description: Generate WonderTales pregenerated outfit plate assets and optimize them into reusable JPEG files. Use when working with services/api/output/outfit-pregen-library, planned_outfit entries, outfit shard JSON/result files, Codex image_gen outfit plates, API outfit plate generation, or converting temporary generated PNGs into final 1024x1024 quality-95 JPEG outfit assets.
---

# WonderTales Outfit Pregen

## Purpose

Use this skill to generate planned outfit plates from the pregeneration catalog and save final assets consistently for reuse by story generation.

The final workspace artifact is always a compact JPEG:

- Format: JPEG
- Size: 1024x1024
- Quality: 95
- Path: `services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg`
- Source/temp files: may be PNG, but should not be referenced by the catalog

## Files

- Simple catalog: `services/api/output/outfit-pregen-library/outfits.json`
- Detailed manifest: `services/api/output/outfit-pregen-library/manifest.json`
- Worker shards: `services/api/output/outfit-pregen-library/shards/shard-0N.json`
- Worker results: `services/api/output/outfit-pregen-library/shards/shard-0N.results.json`
- Final images: `services/api/uploads/outfit_plate_cache/`
- Optimizer: `.codex/skills/wondertales-outfit-pregen/scripts/optimize_outfit_plate.py`
- Shard worker: `services/api/output/outfit-pregen-library/run-shard-worker.mjs`
- Queue worker: `services/api/output/outfit-pregen-library/run-queue-worker.mjs`

## Generation Rules

For each planned entry:

1. Use the entry `promptPositive` when available. Otherwise combine the top-level `systemInstruction` with `description`.
2. Generate exactly one complete outfit plate: upper garment, lower/full-body garment, footwear, and worn accessories listed in the description.
3. Preserve the shared visual style: soft toy-like 3D wardrobe reference, rounded shapes, tactile fabric, subtle stitching, warm studio lighting, orthographic front-facing composition.
4. Avoid character identity: no face, hair identity, body identity, text labels, logos, real brands, copyrighted characters, weapons, gore, or sexualized styling.
5. Prefer a plain warm-white background. If a generator creates a larger or slightly varied background, normalize through the optimizer.

## Built-In image_gen Workflow

When using Codex built-in `image_gen`:

1. Generate with the entry prompt.
2. Find the generated PNG under `${CODEX_HOME:-$HOME/.codex}/generated_images/...`.
3. Copy the selected PNG into the workspace as a temporary source:
   `services/api/uploads/outfit_plate_cache/planned_outfit_NNN.source.png`
4. Run the optimizer:

```bash
python3 .codex/skills/wondertales-outfit-pregen/scripts/optimize_outfit_plate.py \
  --input services/api/uploads/outfit_plate_cache/planned_outfit_NNN.source.png \
  --output services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg \
  --delete-source
```

Leave the original file under `${CODEX_HOME:-$HOME/.codex}/generated_images/...` in place.

## API Script Workflow

When using the repo API generator, write to a temporary PNG first, then optimize:

```bash
cd services/api
TRY_OUTFIT_STYLE="soft 3D toy-clay render" \
  pnpm exec tsx src/scripts/tryOutfitPlateGeneration.ts \
  --out uploads/outfit_plate_cache/planned_outfit_NNN.source.png \
  "<entry.promptPositive>"

cd ../..
python3 .codex/skills/wondertales-outfit-pregen/scripts/optimize_outfit_plate.py \
  --input services/api/uploads/outfit_plate_cache/planned_outfit_NNN.source.png \
  --output services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg \
  --delete-source
```

## Parallel Worker Workflow

### Queue Worker

For a simple catalog such as `outfits-next-330.json`, use the queue worker from the repo root:

```bash
OUTFIT_WORKER_ATTEMPTS=2 node services/api/output/outfit-pregen-library/run-queue-worker.mjs \
  --catalog services/api/output/outfit-pregen-library/outfits-next-330.json \
  --worker 1 \
  --workers 12 \
  --offset 200
```

Run one process for each worker number from `1` through `--workers`. The queue worker:

- Assigns catalog entries by modulo, so workers do not edit the same item.
- Uses `promptPositive` when present, otherwise combines `systemInstruction` and `description`.
- Writes final assets to `services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg`.
- Uses `--offset` when the asset numbering should continue after an existing batch.
- Writes per-worker result files under `services/api/output/outfit-pregen-library/queue-results/<catalog-name>/`.
- Does not update the source catalog directly; merge result paths into the catalog after workers finish.

### Shard Worker

To process one shard end to end, run from the repo root:

```bash
OUTFIT_WORKER_ATTEMPTS=2 node services/api/output/outfit-pregen-library/run-shard-worker.mjs 1
```

Use shard numbers `1` through `6` for parallel generation. The worker:

- Skips a generated item when its final JPEG already exists.
- Writes temporary sources to `services/api/uploads/outfit_plate_cache/planned_outfit_NNN.source.png`.
- Optimizes the source into `services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg`.
- Deletes the temporary source after successful optimization.
- Updates only its matching `shard-0N.results.json`.

## JSON Updates

For the simple catalog:

- Set `planned[i].path` to `services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg`.
- Do not add IDs, labels arrays, age groups, image style fields, scenario affinities, safety tags, metadata IDs, or error fields.

For detailed worker state:

- In the shard entry and manifest entry, set:
  - `generation.status`: `generated`
  - `generation.targetRelativePath`: `services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg`
  - `generation.outputPathFromApiCwd`: `uploads/outfit_plate_cache/planned_outfit_NNN.jpg`
  - `generation.generatedAt`: ISO timestamp
  - `generation.provider`: the generator used, such as `codex_builtin_image_gen` or the API provider name

For worker result files, update only the assigned `shard-0N.results.json`:

```json
{
  "id": "planned_outfit_NNN",
  "status": "generated",
  "imagePath": "services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg",
  "generatedAt": "<ISO timestamp>",
  "provider": "<provider>"
}
```

If multiple workers run in parallel, do not edit `manifest.json` directly from workers. Let the coordinator run:

```bash
node services/api/output/outfit-pregen-library/merge-results.mjs
```

## Validation

After optimizing an image:

1. Open the final `.jpg` if visual QA is needed.
2. Confirm it is one outfit, square 1024x1024, no text/logos, no extra variants, no identity.
3. Confirm the final catalog path points to `.jpg`, not `.png` or `.source.png`.
4. Confirm the file exists:

```bash
python3 - <<'PY'
from PIL import Image
from pathlib import Path
p = Path("services/api/uploads/outfit_plate_cache/planned_outfit_NNN.jpg")
img = Image.open(p)
print(img.format, img.size, p.stat().st_size)
PY
```
