/**
 * Story Domain JSON Schemas
 * Provider-agnostic schemas for structured generation
 * 
 * These schemas define the structure for LLM responses.
 * They are centralized here for easy maintenance and reusability.
 */

import type { JsonSchema } from '../../providers/base/JsonSchema';

/**
 * Schema for story outline generation
 * Defines the structure of EpisodeOutline
 */
export const OUTLINE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Story title in target language' },
    language: { type: 'string', description: 'Language code (uk/ru/en/es/de/fr)' },
    moral: { type: 'string', description: 'The moral or lesson of the story' },
    environments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short unique identifier for this environment (e.g. "bedroom", "forest_clearing")' },
          name: { type: 'string', description: 'Human-readable name of the location' },
          visualDescription: { type: 'string', description: 'Rich visual description of the location in English: layout, furniture, objects, colors, baseline lighting, atmosphere. This is used for image generation.' }
        },
        required: ['id', 'name', 'visualDescription']
      },
      description: 'All distinct physical locations/settings in the story. Multiple scenes can share the same environment.'
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneId: { type: 'number', description: 'Sequential scene number starting from 1' },
          setting: { type: 'string', description: 'Where this scene takes place' },
          environmentId: { type: 'string', description: 'ID of the environment where this scene takes place (from environments array)' },
          goal: { type: 'string', description: 'What should happen in this scene' },
          emotion: { type: 'string', description: 'Primary emotion (calm/happy/curious/concerned/excited)' },
          beats: {
            type: 'array',
            items: { type: 'string' },
            description: 'Story beats (3-5 key moments in this scene)'
          },
          visualPrompt: {
            type: 'string',
            description: 'Action-focused visual description: character poses, expressions, interactions, transient changes (weather, lighting shifts). Do NOT repeat the environment/setting here.'
          }
        },
        required: ['sceneId', 'setting', 'environmentId', 'goal', 'emotion', 'beats', 'visualPrompt']
      }
    },
    safetyNotes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any safety or content policy considerations'
    }
  },
  required: ['title', 'language', 'moral', 'environments', 'scenes', 'safetyNotes']
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
    environments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short unique identifier for this environment (e.g. "bedroom", "forest_clearing")' },
          name: { type: 'string', description: 'Human-readable name of the location' },
          visualDescription: { type: 'string', description: 'Rich visual description of the location in English: layout, furniture, objects, colors, baseline lighting, atmosphere. Used for image generation.' }
        },
        required: ['id', 'name', 'visualDescription']
      },
      description: 'All distinct physical locations/settings in the story. Multiple scenes can share the same environment.'
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Character name' },
          type: { type: 'string', description: 'Character type: human, animal, creature, object' },
          description: { type: 'string', description: 'Detailed visual appearance description for consistent image generation' },
          role: { type: 'string', description: 'Role in story: protagonist, sidekick, mentor, helper, guide, friend' },
          personality: { type: 'string', description: 'Key personality traits' }
        },
        required: ['name', 'type', 'description']
      },
      description: 'All characters created in the story (excluding user-provided characters from SUPPORTING CHARACTERS section)'
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneId: { type: 'number' },
          environmentId: {
            type: 'string',
            description: 'ID of the environment where this scene takes place (from environments array)'
          },
          text: {
            type: 'string',
            description: 'Complete text for this scene (1-3 paragraphs depending on age)'
          },
          visualPrompt: {
            type: 'string',
            description: 'Action-focused visual description: character poses, expressions, interactions, transient changes (weather, lighting). Do NOT repeat the environment/setting here.'
          },
          characters: {
            type: 'array',
            items: { type: 'string' },
            description: 'Names of characters appearing or mentioned in this scene text (EXACT names from character list or SUPPORTING CHARACTERS section)'
          },
          visualCharacters: {
            type: 'array',
            items: { type: 'string' },
            description: 'Characters that should be VISUALLY DRAWN in this scene illustration. Only characters physically present in the scene location. Exclude characters merely mentioned in dialogue or memories. Use EXACT names from character list or SUPPORTING CHARACTERS section.'
          }
        },
        required: ['sceneId', 'environmentId', 'text', 'visualPrompt', 'characters', 'visualCharacters']
      }
    }
  },
  required: ['title', 'language', 'environments', 'characters', 'scenes']
};

/**
 * Schema for scene validation results
 * Defines the structure of SceneValidationResult
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
          category: {
            type: 'string',
            description: 'One of: content_policy, age_inappropriate, fear_level, emotional_tone, vocabulary'
          },
          severity: {
            type: 'string',
            description: 'One of: critical, high, medium'
          },
          message: { type: 'string' },
          suggestion: { type: 'string', nullable: true }
        },
        required: ['category', 'severity', 'message']
      }
    }
  },
  required: ['sceneId', 'isValid', 'violations']
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
      description: 'ID of the environment where this scene takes place (from environments array)'
    },
    text: { type: 'string' },
    visualPrompt: {
      type: 'string',
      description: 'Action-focused visual description: character poses, expressions, interactions, transient changes. Do NOT repeat the environment/setting.'
    },
    characters: {
      type: 'array',
      items: { type: 'string' },
      description: 'Names of characters appearing in this scene'
    },
    visualCharacters: {
      type: 'array',
      items: { type: 'string' },
      description: 'Characters that should be VISUALLY DRAWN in this scene illustration. Only characters physically present in the scene location.'
    }
  },
  required: ['sceneId', 'environmentId', 'text', 'visualPrompt', 'characters', 'visualCharacters']
};
