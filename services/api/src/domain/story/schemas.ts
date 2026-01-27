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
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneId: { type: 'number', description: 'Sequential scene number starting from 1' },
          setting: { type: 'string', description: 'Where this scene takes place' },
          goal: { type: 'string', description: 'What should happen in this scene' },
          emotion: { type: 'string', description: 'Primary emotion (calm/happy/curious/concerned/excited)' },
          beats: {
            type: 'array',
            items: { type: 'string' },
            description: 'Story beats (3-5 key moments in this scene)'
          },
          visualPrompt: {
            type: 'string',
            description: 'Detailed visual description for future image generation'
          }
        },
        required: ['sceneId', 'setting', 'goal', 'emotion', 'beats', 'visualPrompt']
      }
    },
    safetyNotes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any safety or content policy considerations'
    }
  },
  required: ['title', 'language', 'moral', 'scenes', 'safetyNotes']
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
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneId: { type: 'number' },
          text: {
            type: 'string',
            description: 'Complete text for this scene (1-3 paragraphs depending on age)'
          },
          visualPrompt: {
            type: 'string',
            description: 'Enhanced visual description based on actual story text'
          }
        },
        required: ['sceneId', 'text', 'visualPrompt']
      }
    },
    fullText: {
      type: 'string',
      description: 'All scene texts concatenated with proper spacing'
    },
    wordCount: { type: 'number' }
  },
  required: ['title', 'language', 'scenes', 'fullText', 'wordCount']
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
    text: { type: 'string' },
    visualPrompt: { type: 'string' }
  },
  required: ['sceneId', 'text', 'visualPrompt']
};
