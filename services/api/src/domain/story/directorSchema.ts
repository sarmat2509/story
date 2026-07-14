/**
 * JSON Schema for Director service output
 * Characters, environments, illustrations, and one story-level map tile brief.
 */

import type { JsonSchema } from '../../providers/base/JsonSchema';
import { CAMERA_CHARACTER_WITH_OUTFIT_SCHEMA } from './schemas';
import { MAX_SCENE_IMAGE_CHARACTERS } from './sceneCharacterLimits';

export const MAP_TILE_BRIEF_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description:
        'Story-level map description IN ENGLISH, as one compact drawable visual inventory paragraph: largest visible place first, 2-4 secondary visible landmarks/features second, a few sparse minor visible details third, and broad physical filler surfaces last. Use normal prose without labels such as primary anchor, main anchor, secondary landmarks, minor details, or filler surfaces. Use concrete visible nouns, materials, shapes, colors, scale, and physical state only. Name environments as physical places and surfaces, not abstract worlds/universes/mysteries. Omit story titles, smells, sounds, feelings, mood, narrative meaning, quoted nickname labels, and abstract words such as enchanted, magical, mysterious, suggests, seems, feels, or atmosphere unless converted to visible light/color/shape. Mention what the tile contains, not exact directions or connector placement. Route geometry is controlled later by a mask: you may name route/crossing material, but do not describe where a path, trail, road, corridor, bridge approach, route, or walkway goes. Decorative/background objects seen through windows, portholes, screens, memories, dreams, or sky may stay in description with that viewing context.',
    },
    requiredFeatures: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Short normalized feature hints for exact mask selection. Use only these exact lowercase tokens as physical tile-surface geometry: path, river, waterfall, pond, sea, bridge, portal. Always include path; it means the required road/corridor/trail connector that every tile uses. Backend normalization will add path if omitted. Use waterfall for falling water, a cascade, or a water curtain on a river route; include river with waterfall. Use pond for contained water/liquid such as an ink pool or large puddle. Use bridge only for a route-level traversable crossing on the tile surface, such as a bridge, pier, plank, cloth walkway, napkin strip, raised crossing, or route crossing over a visible obstacle. Do not use bridge for a distant, decorative, symbolic, broken, inaccessible, or background bridge seen through a window, porthole, screen, sky, memory, or dream; put that in description instead. Do not add implied tokens: bridge does not imply river; pond does not imply river. Put biome/style words in description, not here.',
    },
  },
  required: ['description', 'requiredFeatures'],
};

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
          description: { type: 'string', description: 'Base visual description IN ENGLISH for a reusable EMPTY LOCATION PLATE. Include ALL static objects (tree, flower, path, bushes) with fixed positions and relative layout. Key objects stay in same positions across all illustrations. Include weather/time-of-day when it affects the location (snow, rain, night). Do not include people, animals, creatures, character actions, or named-character scale comparisons. If the location is on/inside a character-owned shell, den, nest, house, or body-adjacent place, describe only inert terrain/architecture and never the character body, face, eyes, limbs, or living anatomy.' },
        },
        required: ['id', 'name', 'description'],
      },
      description: 'All distinct locations in the story. Wardrobe is NOT here — use outfits[] and sceneVisual.cameraComposition.characters[].outfitId on each illustration. Detailed wardrobe rows apply only to child/person/human characters; non-human rows use natural appearance.',
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
              'WARDROBE ONLY IN ENGLISH for child/person/human characters: garments, footwear, worn accessories. Must match weather, season, and indoor/outdoor context of the scene and environment. No face, hair, skin, or body. Use exactly "natural appearance" when the human character keeps their default/reference clothes for this scene. Animals, imaginary creatures, objects, vehicles, and environmental beings: exactly "natural appearance".',
          },
        },
        required: ['id', 'characterName', 'description'],
      },
      description:
        'Canonical wardrobe definitions. Build rows for every outfitId cited by illustration cameraComposition rows. Detailed wardrobe descriptions are only for child/person/human characters; non-human character rows use exactly "natural appearance" as technical bindings. If a human character keeps their default/reference clothes and those clothes fit the scene, description may be exactly "natural appearance". Every cameraComposition.characters[].outfitId MUST match one of these ids. Define outfits[] before assigning outfitId on each character row.',
    },
    mapTile: {
      type: 'object',
      description:
        'ONE board-game story reward tile brief for the whole story. It summarizes compatible visible landmarks from all planned illustrations into one modular map tile, not one scene and not a character illustration.',
      properties: {
        description: {
          type: 'string',
          description:
            'Story-level map description IN ENGLISH, as one compact drawable visual inventory paragraph: largest visible place first, 2-4 secondary visible landmarks/features second, a few sparse minor visible details third, and broad physical filler surfaces last. Use normal prose without labels such as primary anchor, main anchor, secondary landmarks, minor details, or filler surfaces. Use concrete visible nouns, materials, shapes, colors, scale, and physical state only. Name environments as physical places and surfaces, not abstract worlds/universes/mysteries. Omit story titles, smells, sounds, feelings, mood, narrative meaning, quoted nickname labels, and abstract words such as enchanted, magical, mysterious, suggests, seems, feels, or atmosphere unless converted to visible light/color/shape. Mention what the tile contains, not exact directions or connector placement. Route geometry is controlled later by a mask: you may name route/crossing material, but do not describe where a path, trail, road, corridor, bridge approach, route, or walkway goes. Decorative/background objects seen through windows, portholes, screens, memories, dreams, or sky may stay in description with that viewing context.',
        },
        requiredFeatures: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Short normalized feature hints for exact mask selection. Use only these exact lowercase tokens as physical tile-surface geometry: path, river, waterfall, pond, sea, bridge, portal. Always include path; it means the required road/corridor/trail connector that every tile uses. Backend normalization will add path if omitted. Use waterfall for falling water, a cascade, or a water curtain on a river route; include river with waterfall. Use pond for contained water/liquid such as a pond, small lake, lagoon, ink pool, or large puddle. Use bridge only for a route-level traversable crossing on the tile surface, such as a bridge, pier, plank, cloth walkway, napkin strip, raised crossing, or route crossing over a visible obstacle. Do not use bridge for a distant, decorative, symbolic, broken, inaccessible, or background bridge seen through a window, porthole, screen, sky, memory, or dream; put that in mapTile.description instead. Use portal for cave, grotto, tunnel, doorway, arch, hatch, airlock, or magical entrance. Do not add implied tokens: bridge does not imply river; pond does not imply river; portal does not imply cave. Put biome/style words such as forest, interior, spaceship in mapTile.description, not here.',
        },
      },
      required: ['description', 'requiredFeatures'],
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
                description: 'Scene-specific additions IN ENGLISH. Describe what is NEW or CHANGED. Must match cameraComposition.shot location and support primaryRead. Do not state a separate focus sentence here. Every named character mentioned here must also have a cameraComposition.characters[] row; otherwise omit that character from all sceneVisual prose.',
              },
              cameraComposition: {
                type: 'object',
                properties: {
                  shot: { type: 'string', description: 'Camera angle IN ENGLISH: shot type, eye level. Choose the shot to make primaryRead readable. Every named character mentioned here must also have a cameraComposition.characters[] row.' },
                  characters: {
                    type: 'array',
                    minItems: 1,
                    maxItems: MAX_SCENE_IMAGE_CHARACTERS,
                    items: CAMERA_CHARACTER_WITH_OUTFIT_SCHEMA,
                    description:
                      `Who is in the shot; maximum ${MAX_SCENE_IMAGE_CHARACTERS} characters. This roster is binding: every named character mentioned in setting, shot, any character description, or lighting MUST have exactly one row here. If the limit is reached, omit extra characters from all sceneVisual prose. Each row MUST include outfitId referencing outfits[]. Detailed wardrobe rows apply only to child/person/human characters; non-human rows use natural appearance. Character descriptions must support primaryRead instead of creating a competing focal action.`,
                  },
                },
                required: ['shot', 'characters'],
              },
              lighting: { type: 'string', description: 'Lighting conditions IN ENGLISH. Lighting should support primaryRead, not introduce a different focal effect. Every named character mentioned here must also have a cameraComposition.characters[] row.' },
            },
            required: ['setting', 'cameraComposition', 'lighting'],
          },
        },
        required: ['environmentId', 'primaryRead', 'sceneVisual'],
      },
      description:
        'Visual descriptions for each illustration. Order matches placement: 1st=opening, rest=evenly distributed. Each sceneVisual.cameraComposition.characters[] entry MUST include outfitId (schema-enforced, same strictness as environmentId); detailed wardrobe applies only to child/person/human characters, while non-human rows use natural appearance. The story reward map tile is top-level mapTile, not inside illustrations.',
    },
  },
  required: ['characters', 'environments', 'outfits', 'mapTile', 'illustrations'],
};
