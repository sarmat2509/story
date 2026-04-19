/**
 * Story Domain JSON Schemas
 * Provider-agnostic schemas for structured generation
 *
 * These schemas define the structure for LLM responses.
 * They are centralized here for easy maintenance and reusability.
 */

import type { JsonSchema } from '../../providers/base/JsonSchema';

/**
 * One row in sceneVisual.cameraComposition.characters — pose plus wardrobe ref (replaces top-level outfitBindings).
 */
export const CAMERA_CHARACTER_WITH_OUTFIT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      description:
        'EXACT character name from the story character list (and characters[]), including "Name [ID: uuid]" if used.',
    },
    description: {
      type: 'string',
      minLength: 1,
      description: 'Position in frame, posture, action, expression. IN ENGLISH.',
    },
    outfitId: {
      type: 'string',
      minLength: 1,
      description:
        'EXACT outfits[].id for this character in this scene — same kind of reference as environmentId → environments[].id.',
    },
  },
  required: ['name', 'description', 'outfitId'],
};

/**
 * Schema for full story text generation
 * Defines the structure of EpisodeText
 */
export const TEXT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    language: { type: 'string' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Character name' },
          type: { type: 'string', description: 'Character type: human, animal, creature, object' },
          description: {
            type: 'string',
            description: 'Detailed visual appearance description for consistent image generation',
          },
          role: {
            type: 'string',
            description: 'Role in story: protagonist, sidekick, mentor, helper, guide, friend',
          },
          personality: { type: 'string', description: 'Key personality traits' },
        },
        required: ['name', 'type', 'description'],
      },
      description:
        'All characters created in the story (excluding user-provided characters from SUPPORTING CHARACTERS section)',
    },
    moral: { type: 'string', description: 'The moral/lesson of the story' },
    outfits: {
      type: 'array',
      description:
        'Canonical wardrobe for the story. Generate AFTER all scenes are written so each scene can reference outfit ids. Each distinct look gets a unique id.',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'Unique within story (e.g. o_hero_park_1). Reuse the same id across scenes when wardrobe unchanged.',
          },
          characterName: {
            type: 'string',
            description: 'EXACT character name as in characters[].name',
          },
          description: {
            type: 'string',
            description:
              'WARDROBE ONLY IN ENGLISH. Align with weather, season, and indoor/outdoor context of this scene and its environment. Garments, shoes, worn accessories only — no face, hair, or body. Use exactly "natural appearance" when the character keeps their default/reference clothes for this scene. Animals/creatures: "natural appearance".',
          },
        },
        required: ['id', 'characterName', 'description'],
      },
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneId: { type: 'number' },
          environmentId: {
            type: 'string',
            description:
              'ID of the environment where this scene takes place (from environments array). Use a DIFFERENT environmentId when the scene describes a distinctly different physical place (e.g. forest path vs glade/clearing, different room, cave entrance vs interior).',
          },
          text: {
            type: 'string',
            description: 'Complete text for this scene (1-3 paragraphs depending on age)',
          },
          sceneVisual: {
            type: 'object',
            properties: {
              setting: {
                type: 'string',
                description:
                  'DELTA: Scene-specific additions IN ENGLISH. Describe ONLY what is NEW or CHANGED: temporary objects (books on table, food on counter), scene-specific state (open/closed doors), STATE changes to static objects (flower bloomed, tree lit up). DO NOT introduce new static objects — they must be in environment. DO NOT repeat base environment structure. Must be SELF-CONTAINED — never reference previous scenes. If nothing changes, write minimal additions or time-of-day details.',
              },
              cameraComposition: {
                type: 'object',
                properties: {
                  shot: {
                    type: 'string',
                    description:
                      'Camera angle IN ENGLISH: shot type (wide/medium/close-up), eye level, and framing.',
                  },
                  characters: {
                    type: 'array',
                    minItems: 1,
                    items: CAMERA_CHARACTER_WITH_OUTFIT_SCHEMA,
                    description:
                      'Per-character composition. MUST list ALL characters physically present in this scene and ONLY those characters. Each row MUST include outfitId referencing outfits[].',
                  },
                },
                required: ['shot', 'characters'],
              },
              lighting: {
                type: 'string',
                description:
                  'Lighting conditions IN ENGLISH. Light source, direction, intensity, shadows, color temperature, atmosphere.',
              },
            },
            required: ['setting', 'cameraComposition', 'lighting'],
          },
        },
        required: ['sceneId', 'environmentId', 'text', 'sceneVisual'],
      },
    },
    environments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'Short unique identifier (e.g. "bedroom", "forest_path", "silver_tree_glade" — use distinct ids for different places like path vs glade)',
          },
          name: { type: 'string', description: 'Human-readable name of the location' },
          description: {
            type: 'string',
            description:
              'BASE visual description IN ENGLISH: fixed layout, permanent furniture, walls, floor, windows, weather/time-of-day when it affects the place. Include ALL static objects (tree, flower, path, bushes, bench) with fixed positions (left/center/right) and relative positions. Wardrobe belongs in outfits[] only — not here.',
          },
        },
        required: ['id', 'name', 'description'],
      },
      description:
        'All distinct physical locations. Generate AFTER outfits — one entry per unique environmentId used in scenes.',
    },
  },
  required: ['title', 'language', 'characters', 'outfits', 'scenes', 'environments'],
};

/**
 * Schema for batch validation - returns only failed scenes
 */
export const BATCH_VALIDATION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    failedScenes: {
      type: 'array',
      description: 'Only scenes that failed validation. Empty if all pass.',
      items: {
        type: 'object',
        properties: {
          sceneId: { type: 'number' },
          violations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                severity: { type: 'string' },
                message: { type: 'string' },
                suggestion: { type: 'string', nullable: true },
              },
              required: ['category', 'severity', 'message'],
            },
          },
          correctedCameraComposition: {
            type: 'object',
            nullable: true,
            properties: {
              shot: { type: 'string' },
              characters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    outfitId: { type: 'string' },
                  },
                  required: ['name', 'description'],
                },
              },
            },
            required: ['shot', 'characters'],
          },
        },
        required: ['sceneId', 'violations'],
      },
    },
  },
  required: ['failedScenes'],
};

/**
 * Schema for scene validation results.
 */
export const VALIDATION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    sceneId: { type: 'number' },
    isValid: { type: 'boolean' },
    violations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          severity: { type: 'string' },
          message: { type: 'string' },
          suggestion: { type: 'string', nullable: true },
        },
        required: ['category', 'severity', 'message'],
      },
    },
    correctedCameraComposition: {
      type: 'object',
      nullable: true,
      properties: {
        shot: { type: 'string' },
        characters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              outfitId: { type: 'string' },
            },
            required: ['name', 'description'],
          },
        },
      },
      required: ['shot', 'characters'],
    },
  },
  required: ['sceneId', 'isValid', 'violations'],
};

/**
 * Schema for image validation results (post-generation Vision check).
 * Detects character hallucinations, duplicates, missing/extra characters, reference fidelity.
 */
export const IMAGE_VALIDATION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    characterCount: {
      type: 'number',
      description: 'Total number of distinct characters/creatures visible in the image',
    },
    expectedCharacterCount: {
      type: 'number',
      description: 'Number of characters expected based on the prompt',
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Character name from the expected list' },
          characterKind: {
            type: 'string',
            enum: ['human', 'animal', 'imaginary'],
            description:
              'Must match EXPECTED CHARACTERS line for this name: human = HUMAN (real person/child), animal = ANIMAL (real-world species like hamster/dog/cat), imaginary = IMAGINARY_CREATURE. Do not map animal to human.',
          },
          found: { type: 'boolean', description: 'Whether this character is present in the image' },
          duplicated: {
            type: 'boolean',
            description:
              'Whether this character appears more than once without scene justification. Only true when duplicate is NOT scene-justified (mirror, reflection, portrait = false).',
          },
          recognizableScore: {
            type: 'number',
            description:
              '0-1 aggregate identity vs turnaround. Must reflect overall design read, silhouette, creature subtype read (imaginary), and body form—not only a checklist of local features. 1.0 ONLY when no meaningful drift in silhouette, body type, mass, head/muzzle shape, subtype read, proportions, or signature traits; any noticeable subtype-read drift or body-form reinterpretation → strictly below 1.0. Consistent with face/hair/age/proportions booleans and optional silhouetteDriftSeverity/sameOverallDesignRead. For HUMANS: wrong face OR wrong age read OR wrong visible hairstyle must NOT be scored 0.9 as a minor single feature—usually 0.7–0.8 each; combined drift → often ≤0.5. For IMAGINARY: missing dominant body markings (spots/stripes) → ≤0.5; major silhouette/body-type/subtype drift → often 0.5–0.7 even if some colors/markings match. Temporary emotional expression, gaze, or flexible appendage pose (antennae/ears/whiskers/tail tip/crest tilt/wing angle) does NOT by itself lower this score if the same first-glance design read is preserved. Scene-authorized temporary visual states also do NOT by themselves lower this score: transparency, shimmering outline, glow, magical aura, mist/smoke form, or other explicitly requested transient presentation effects. Do not treat \"transparent vs solid\" alone as identity drift when the designer scene brief explicitly requests transparency or spectral rendering. Do not use ~0.9 when proportionsMatchReference is false due to visible drift. Wardrobe vs sheet does not raise this score. Penalty=(1-score)*20.',
          },
          faceMatchesReference: {
            type: 'boolean',
            nullable: true,
            description:
              'HUMAN-only identity slot. Visible face/head identity vs reference: face shape, eye shape/size, nose/mouth, cheeks, jaw/chin, freckles/glasses when stable. Temporary emotional expression alone should NOT make this false if the same underlying face/head design is preserved. Leave null for ANIMAL / IMAGINARY_CREATURE or when head fully obscured and scene explains occlusion.',
          },
          hairMatchesReference: {
            type: 'boolean',
            nullable: true,
            description:
              'HUMAN-only identity slot. Visible hair vs reference (length, cut, silhouette, parting, texture, braid/ponytail/loose) unless scene explicitly authorizes a change. Leave null for ANIMAL / IMAGINARY_CREATURE — fur/feather/mane drift belongs to sameOverallDesignRead + silhouetteDriftSeverity instead.',
          },
          ageReadMatchesReference: {
            type: 'boolean',
            nullable: true,
            description:
              'HUMAN-only identity slot. Same age category as reference (child vs teen/adult) unless scene authorizes. Wrong age read is major—not stylistic. Leave null for ANIMAL / IMAGINARY_CREATURE.',
          },
          proportionsMatchReference: {
            type: 'boolean',
            nullable: true,
            description:
              'Head-to-body, limb-to-torso ratios and silhouette vs reference. Applies to all kinds when a reference is available. Moderate drift → often recognizableScore 0.7–0.8; severe → ≤0.5.',
          },
          matchesColors: {
            type: 'boolean',
            description:
              'Whether persistent identity colors match the reference: skin/fur/feathers, eyes, visible hair color, stable markings. False if hair color clearly wrong vs reference without scene excuse. Do not use clothing fabric color vs sheet here—that is matchesOutfit vs scene text. Do NOT fail this only because a designer-authorized temporary glow, aura, magical lighting, transparency, spectral effect, or shimmer changes apparent brightness/color.',
          },
          matchesOutfit: {
            type: 'boolean',
            description:
              'Whether VISIBLE clothing/shoes/accessories match the scene wardrobe text (CHARACTER OUTFITS / Expected outfit for THIS scene), NOT the turnaround reference. If an outfit plate reference is provided, use that outfit plate as the strongest clothing ground truth. Require garment TYPE and key structural details from the scene text / plate (sleeve length, neckline/collar, skirt length, shoe type). Same dominant color but wrong silhouette (e.g. another yellow dress) = false. True if no outfit is specified in scene text, or visible costume aligns with the written spec. Do not mark false merely because the clothing differs from the identity sheet / turnaround clothes. Occlusion rules apply when scene context hides parts.',
          },
          identityComparisonSummary: {
            type: 'string',
            description:
              'Contrastive format required: (1) MATCHES—what aligns (silhouette, body type, head/muzzle, markings, subtype read for imaginary, proportions). (2) DIFFERS—what does not match or is reinterpreted. (3) FIRST-GLANCE—one sentence: unchanged vs drifted design read. For imaginary creatures always mention subtype read (e.g. spirit-like vs insect-like). No vague merged praise. Do NOT list clothing differences here when the outfit is authorized by scene wardrobe text or an outfit plate; that belongs in matchesOutfit/issue only. Do NOT list designer-authorized temporary scene states such as transparency, glow, shimmering outline, magical aura, or scene-driven facial expression as identity drift unless they truly change the first-glance character design.',
          },
          sameOverallDesignRead: {
            type: 'boolean',
            description:
              'Optional. True ONLY if no meaningful drift in silhouette, body type, mass, head/muzzle, creature subtype read, proportions, or signature traits—same first-glance design. Temporary emotion or flexible appendage pose alone does not make this false. False if any noticeable subtype drift, body-form reinterpretation, or silhouette shift (even with matching colors/accessories). False if moderate/severe silhouetteDriftSeverity. Omit if uncertain.',
          },
          silhouetteDriftSeverity: {
            type: 'string',
            enum: ['none', 'mild', 'moderate', 'severe'],
            description:
              'Optional. none only when silhouette, body type, subtype read, and proportions closely match—no meaningful reinterpretation. Do not mark this above none for temporary emotional expression or flexible appendage pose alone. mild/moderate/severe for visible shifts; moderate+ when body-read or subtype clearly shifts; severe when first-glance read fails. Subtype read differing from reference → not none.',
          },
          issue: {
            type: 'string',
            nullable: true,
            description: 'ALL problems for this character in one string, separated by semicolons',
          },
        },
        required: [
          'name',
          'characterKind',
          'found',
          'duplicated',
          'recognizableScore',
          'matchesColors',
          'matchesOutfit',
          'identityComparisonSummary',
        ],
      },
    },
    hasUnexpectedCharacters: {
      type: 'boolean',
      description: 'Whether there are extra characters not in the expected list',
    },
    hasTextOrLetters: {
      type: 'boolean',
      description: 'Whether the image contains any text, letters, words, or writing',
    },
    hasRenderingArtifacts: {
      type: 'boolean',
      description:
        'Whether the image has visual artifacts at character boundaries: body parts showing through other characters, merged limbs, transparency errors.',
    },
    overallFeedback: { type: 'string', description: 'Human-readable summary of all issues found' },
  },
  required: [
    'characterCount',
    'expectedCharacterCount',
    'characters',
    'hasUnexpectedCharacters',
    'hasTextOrLetters',
    'hasRenderingArtifacts',
    'overallFeedback',
  ],
};

/**
 * Schema for batch regeneration - returns all corrected scenes
 */
export const BATCH_REGENERATION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      description: 'All corrected scene texts',
      items: {
        type: 'object',
        properties: {
          sceneId: { type: 'number' },
          text: { type: 'string', description: 'Regenerated scene text' },
        },
        required: ['sceneId', 'text'],
      },
    },
  },
  required: ['scenes'],
};

/**
 * Schema for single scene regeneration
 * Defines the structure of a regenerated scene
 */
export const SCENE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    sceneId: { type: 'number' },
    environmentId: {
      type: 'string',
      description: 'ID of the environment where this scene takes place (from environments array)',
    },
    text: { type: 'string' },
    sceneVisual: {
      type: 'object',
      properties: {
        setting: {
          type: 'string',
          description:
            'DELTA: Scene-specific additions IN ENGLISH. Describe ONLY what is NEW or CHANGED: temporary objects (books on table, food on counter), scene-specific state (open/closed doors), STATE changes to static objects (flower bloomed, tree lit up). DO NOT introduce new static objects — they must be in environment. DO NOT repeat base environment structure. Must be SELF-CONTAINED — never reference previous scenes. If nothing changes, write minimal additions or time-of-day details.',
        },
        cameraComposition: {
          type: 'object',
          properties: {
            shot: {
              type: 'string',
              description:
                'Camera angle IN ENGLISH: shot type (wide/medium/close-up), eye level, and framing.',
            },
            characters: {
              type: 'array',
              minItems: 1,
              items: CAMERA_CHARACTER_WITH_OUTFIT_SCHEMA,
              description:
                'Per-character composition. MUST list ALL characters physically present in this scene. Each entry includes outfitId → outfits[].',
            },
          },
          required: ['shot', 'characters'],
        },
        lighting: {
          type: 'string',
          description:
            'Lighting conditions IN ENGLISH. Light source, direction, intensity, shadows.',
        },
      },
      required: ['setting', 'cameraComposition', 'lighting'],
    },
  },
  required: ['sceneId', 'environmentId', 'text', 'sceneVisual'],
};
