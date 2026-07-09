# Existing DB outfit catalog

Generated from local dev database on 2026-07-04T16:12:55.063Z.

This is a read-only catalogization of outfit data currently present in the database. It combines:

- `outfit_plate_cache`: generated outfit plate images already stored in cache.
- `stories.metadata.outfits`: Director outfit definitions saved with stories.

Exact natural/default appearance placeholders are excluded from the catalog. Accessory-only rows, partial descriptions, and possible serialized multi-character strings are kept but flagged.

Note: this file is the original text-based DB snapshot. The promoted working library is now the visual-audited, deduplicated catalog in `services/api/output/outfit-pregen-library/outfits.json`; it uses `presentationGroups` arrays and no separate compatibility bucket.

## Database snapshot

| Metric | Count |
| --- | ---: |
| `outfit_plate_cache` rows | 116 |
| Distinct generated outfit texts | 89 |
| `story_outfit_plate_cache` links | 193 |
| Linked stories | 62 |
| Linked character keys | 73 |
| Stories with `metadata.outfits` | 81 |
| Metadata outfit rows | 343 |
| Catalog entries after excluding natural/default placeholders | 164 |
| Entries with generated plate assets | 89 |
| Metadata-only entries | 75 |

## Important observations

- Existing coverage is heavily biased toward one recurring character/outfit family: many rows are `o_emilia_*` with floral bomber jackets, practical travel layers, and exploration variants.
- Generated plate assets cover mostly modern casual, expedition, water/coast, winter/rain, space, and medieval-adjacent outfits.
- There are many `metadata_only_no_generated_plate` entries. These existed in story metadata but do not have a generated outfit plate row.
- A few rows are too generic for a reusable pregen catalog, for example `age-appropriate everyday clothes suitable for the current scene`.
- Some rows include accessories only, animal natural appearance, or serialized multi-character text. These need cleanup before being promoted to the pregenerated library.
- The current dev DB does not have `character_outfit_turnaround_cache`; only `outfit_plate_cache` and `story_outfit_plate_cache` exist locally.

## Tag distribution

### Presentation group

| Tag | Count |
| --- | --- |
| `female` | 108 |
| `female,male` legacy dual-compatible bucket | 38 |
| `male` | 18 |

### Purpose tags

| Tag | Count |
| --- | --- |
| `casual` | 164 |
| `travel` | 66 |
| `exploration` | 50 |
| `historical` | 38 |
| `protective` | 31 |
| `swim` | 26 |
| `work` | 16 |
| `sci_fi` | 12 |
| `space` | 10 |
| `official` | 8 |
| `magic` | 4 |
| `school` | 3 |
| `science_lab` | 1 |

### Season tags

| Tag | Count |
| --- | --- |
| `demi` | 82 |
| `summer` | 42 |
| `all_season` | 32 |
| `snow` | 19 |
| `winter` | 19 |
| `rain` | 12 |
| `indoor` | 6 |

### Quality flags

| Flag | Count |
| --- | --- |
| `metadata_only_no_generated_plate` | 75 |
| `mixed_with_identity_or_natural_appearance` | 12 |
| `likely_serialized_multi_character_outfit_text` | 7 |
| `too_generic` | 4 |
| `placeholder_description` | 1 |

## Most used existing descriptions

| ID | Plates | Links | Metadata uses | Group | Purpose | Description |
| --- | --- | --- | --- | --- | --- | --- |
| existing_outfit_001 | 1 | 6 | 1 | female | `casual`, `exploration`, `protective`, `travel` | Thick insulated bomber jacket zipped up, wool scarf wrapped at neck, warm winter gloves, snow pants, insulated winter boots, small backpack with st... |
| existing_outfit_002 | 2 | 5 | 1 | female | `casual`, `exploration`, `travel` | Light floral jacket (hip-length) with a stand collar; breathable pale shirt underneath; comfortable shorts or lightweight pants suitable for heat; ... |
| existing_outfit_003 | 2 | 5 | 1 | female | `casual`, `sci_fi` | Floral bomber jacket (lightweight, pastel flowers), light shirt underneath, comfortable leggings, bright sneakers, slim utility wrist-communicator ... |
| existing_outfit_090 | 0 | 0 | 6 | female | `casual`, `swim`, `travel` | age-appropriate child swimwear suitable for swimming, bare feet, no jacket or coat |
| existing_outfit_004 | 1 | 4 | 1 | female | `casual` | Teal satin bomber jacket with ribbed cuffs and waistband, white T-shirt with a small star print, navy leggings, white sneakers with pastel laces, t... |
| existing_outfit_005 | 2 | 4 | 1 | female | `casual`, `sci_fi`, `space`, `work` | Child-sized light-gray space jumpsuit with colorful stitched patches on elbows and knees, a teal zipper front, and a soft ribbed collar; slim utili... |
| existing_outfit_006 | 2 | 4 | 1 | female | `casual`, `exploration`, `sci_fi`, `space`, `travel` | A white floral-patterned bomber jacket over a simple teal shirt, dark flexible leggings, and sturdy white space-boots. |
| existing_outfit_007 | 1 | 3 | 1 | female | `casual`, `exploration`, `historical`, `travel`, `work` | Yellow striped t-shirt, blue denim overalls with a small pocket on the chest, and sturdy red walking boots. |
| existing_outfit_008 | 1 | 3 | 1 | female | `casual`, `exploration`, `official`, `travel`, `work` | lightweight khaki short-sleeve button-up shirt, dark teal knee-length shorts, sturdy brown ankle boots, thin utility belt, small canvas crossbody s... |
| existing_outfit_009 | 2 | 3 | 1 | female | `casual`, `protective`, `sci_fi`, `space` | Short space jacket with high collar in teal fabric, dark utility pants with knee patches, sturdy ankle boots with light soles, slim belt with small... |
| existing_outfit_010 | 2 | 3 | 1 | female | `casual`, `protective` | Lightweight waterproof hooded jacket, long pants, sneakers. |
| existing_outfit_011 | 2 | 3 | 1 | female | `casual`, `exploration`, `historical`, `travel` | lightweight hooded jacket, long pants, sturdy closed-toe hiking shoes, small backpack |
| existing_outfit_012 | 2 | 3 | 1 | female | `casual`, `exploration`, `historical`, `protective`, `travel` | Lightweight rain jacket, long pants, sturdy hiking shoes, small backpack worn on both shoulders |
| existing_outfit_013 | 1 | 3 | 1 | female | `casual`, `exploration`, `historical`, `protective` | Light sand-colored long-sleeve tunic, breathable beige trousers, sturdy brown ankle boots, pale scarf wrapped loosely around the neck, small tan cr... |
| existing_outfit_014 | 1 | 3 | 1 | female | `casual`, `exploration`, `historical`, `travel` | lightweight long-sleeve adventure shirt in khaki, breathable cargo shorts, sturdy hiking boots, knee-high socks, simple canvas belt, small crossbod... |
| existing_outfit_015 | 2 | 3 | 1 | female | `casual`, `exploration`, `travel` | Cozy knit sweater, knee-length skirt, warm tights, comfortable lace-up ankle boots, small crossbody satchel bag. |
| existing_outfit_016 | 2 | 3 | 1 | female | `casual`, `exploration`, `protective`, `travel` | Teal insulated winter parka with a high collar and hood, thick knitted scarf in warm colors, dark snow pants, white sneakers, warm gloves; a folded... |
| existing_outfit_017 | 2 | 3 | 1 | female | `casual`, `exploration`, `historical`, `travel` | Light floral bomber jacket (zippered), breathable tan hiking pants, sturdy ankle-high desert boots, small canteen slung crossbody with a thin strap. |
| existing_outfit_018 | 1 | 3 | 1 | female | `casual`, `historical` | Floral bomber jacket, light shirt, comfortable shorts, sturdy walking sneakers, small crossbody pouch |
| existing_outfit_019 | 2 | 3 | 1 | female | `casual`, `exploration`, `historical`, `travel` | Lightweight zip-up jacket with a colorful floral print, comfortable shorts, sturdy lace-up walking shoes, ankle socks, small backpack worn on both ... |
| existing_outfit_020 | 2 | 3 | 1 | female | `casual` | Floral bomber jacket, comfortable leggings, white sneakers. |
| existing_outfit_021 | 2 | 3 | 1 | female | `casual`, `exploration`, `travel` | Bright zip-up jacket, lightweight shirt, fitted pants, sturdy ankle boots, small crossbody satchel bag. |
| existing_outfit_022 | 2 | 3 | 1 | female | `casual`, `exploration`, `historical`, `travel` | Light blue hooded jacket with wooden toggle buttons, white shirt collar peeking out, knee-length navy skirt, white tights, brown ankle boots, small... |
| existing_outfit_023 | 2 | 3 | 1 | female | `casual`, `exploration`, `travel` | Light floral-patterned jacket with front pockets, comfortable leggings, white sneakers, small backpack worn on both shoulders. |
| existing_outfit_024 | 2 | 3 | 1 | female | `casual`, `exploration`, `travel` | Bright floral bomber jacket, comfortable leggings, sturdy sneakers, small backpack with shoulder straps worn on both shoulders. |

## Files

- Full machine-readable catalog: `docs/outfit-existing-db-catalog.json`
- Spreadsheet-friendly catalog: `docs/outfit-existing-db-catalog.csv`

## Suggested cleanup before promotion

1. Deduplicate near-identical floral bomber / travel / jacket variants by canonical normalized components.
2. Rewrite `too_generic` and `placeholder_description` entries into concrete visual descriptions before pregeneration.
3. Split accessory-only animal rows from human outfit rows; do not treat them as full outfits.
4. Remove or rewrite rows flagged `likely_serialized_multi_character_outfit_text`.
5. Add explicit `presentationGroups`, `purposeTags`, `seasonTags`, and `qualityStatus` fields to the future outfit catalog instead of deriving them from text every time.
