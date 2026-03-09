/**
 * JSON Schema for Director service output
 * Characters, environments, and illustrations (sceneVisual only for N scenes)
 */

import type { JsonSchema } from '../../providers/base/JsonSchema';

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
          description: { type: 'string', description: 'Base visual description IN ENGLISH. Include ALL static objects (tree, flower, path, bushes) with fixed positions and relative layout. Key objects stay in same positions across all illustrations.' },
          characterOutfits: {
            type: 'string',
            description: 'Format: "Char1: outfit1. Char2: outfit2." — one per character per environment',
          },
        },
        required: ['id', 'name', 'description', 'characterOutfits'],
      },
      description: 'All distinct locations in the story',
    },
    illustrations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          environmentId: { type: 'string', description: 'ID of environment for this illustration' },
          sceneVisual: {
            type: 'object',
            description: 'setting, shot, characters, lighting must ALL describe the SAME location and moment',
            properties: {
              setting: {
                type: 'string',
                description: 'Scene-specific additions IN ENGLISH. Describe what is NEW or CHANGED. Must match cameraComposition.shot location.',
              },
              cameraComposition: {
                type: 'object',
                properties: {
                  shot: { type: 'string', description: 'Camera angle IN ENGLISH: shot type, eye level' },
                  characters: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        description: { type: 'string', description: 'Position, posture, action IN ENGLISH' },
                      },
                      required: ['name', 'description'],
                    },
                  },
                },
                required: ['shot', 'characters'],
              },
              lighting: { type: 'string', description: 'Lighting conditions IN ENGLISH' },
            },
            required: ['setting', 'cameraComposition', 'lighting'],
          },
        },
        required: ['environmentId', 'sceneVisual'],
      },
      description: 'Visual descriptions for each illustration. Order matches placement: 1st=opening, rest=evenly distributed.',
    },
  },
  required: ['characters', 'environments', 'illustrations'],
};
