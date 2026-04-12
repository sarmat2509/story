/**
 * JSON Schema for Director service output
 * Characters, environments, and illustrations (sceneVisual only for N scenes)
 */

import type { JsonSchema } from '../../providers/base/JsonSchema';
import { CAMERA_CHARACTER_WITH_OUTFIT_SCHEMA } from './schemas';

export const DIRECTOR_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Character name' },
          type: { type: 'string', description: 'Character type: human, animal, creature, object' },
          description: { type: 'string', description: 'Detailed visual appearance for image generation' },
          role: { type: 'string', description: 'Role in story' },
          personality: { type: 'string', description: 'Key personality traits' },
        },
        required: ['name', 'type', 'description'],
      },
      description: 'All characters in the story with visual descriptions',
    },
    environments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short unique identifier' },
          name: { type: 'string', description: 'Human-readable location name' },
          description: { type: 'string', description: 'Base visual description IN ENGLISH. Include ALL static objects (tree, flower, path, bushes) with fixed positions and relative layout. Key objects stay in same positions across all illustrations. Include weather/time-of-day when it affects the location (snow, rain, night).' },
        },
        required: ['id', 'name', 'description'],
      },
      description: 'All distinct locations in the story. Wardrobe is NOT here — use outfits[] and sceneVisual.cameraComposition.characters[].outfitId on each illustration.',
    },
    outfits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique id within this story (e.g. o_emilia_home_1). Reused across scenes when the same wardrobe applies.',
          },
          characterName: {
            type: 'string',
            description: 'EXACT character name as in characters[] (same spelling).',
          },
          description: {
            type: 'string',
            description:
              'WARDROBE ONLY IN ENGLISH: garments, footwear, worn accessories. Must match weather, season, and indoor/outdoor context of the scene and environment. No face, hair, skin, or body. Use exactly "natural appearance" when the character keeps their default/reference clothes for this scene. Creatures/animals: "natural appearance".',
          },
        },
        required: ['id', 'characterName', 'description'],
      },
      description:
        'Canonical wardrobe definitions. Build rows for every character that appears in any illustration\'s cameraComposition; each distinct look gets its own id. If a character keeps their default/reference clothes and those clothes fit the scene, description may be exactly "natural appearance". Every cameraComposition.characters[].outfitId MUST match one of these ids. Define outfits[] before assigning outfitId on each character row.',
    },
    illustrations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          environmentId: { type: 'string', description: 'ID of environment for this illustration' },
          primaryRead: {
            type: 'string',
            description:
              'Short ENGLISH phrase naming the single primary visual read of this illustration — what the viewer should understand first at a glance (for example: "Emilia receives the clay pot"). This is the only explicit focus field; sceneVisual must support it rather than restating a different focus.',
          },
          sceneVisual: {
            type: 'object',
            description: 'setting, shot, characters, lighting must ALL describe the SAME location and moment and must all support primaryRead instead of introducing a competing focal event',
            properties: {
              setting: {
                type: 'string',
                description: 'Scene-specific additions IN ENGLISH. Describe what is NEW or CHANGED. Must match cameraComposition.shot location and support primaryRead. Do not state a separate focus sentence here.',
              },
              cameraComposition: {
                type: 'object',
                properties: {
                  shot: { type: 'string', description: 'Camera angle IN ENGLISH: shot type, eye level. Choose the shot to make primaryRead readable.' },
                  characters: {
                    type: 'array',
                    minItems: 1,
                    items: CAMERA_CHARACTER_WITH_OUTFIT_SCHEMA,
                    description:
                      'Who is in the shot; each row MUST include outfitId referencing outfits[]. Character descriptions must support primaryRead instead of creating a competing focal action.',
                  },
                },
                required: ['shot', 'characters'],
              },
              lighting: { type: 'string', description: 'Lighting conditions IN ENGLISH. Lighting should support primaryRead, not introduce a different focal effect.' },
            },
            required: ['setting', 'cameraComposition', 'lighting'],
          },
        },
        required: ['environmentId', 'primaryRead', 'sceneVisual'],
      },
      description:
        'Visual descriptions for each illustration. Order matches placement: 1st=opening, rest=evenly distributed. Each sceneVisual.cameraComposition.characters[] entry MUST include outfitId (schema-enforced, same strictness as environmentId).',
    },
  },
  required: ['characters', 'environments', 'outfits', 'illustrations'],
};
