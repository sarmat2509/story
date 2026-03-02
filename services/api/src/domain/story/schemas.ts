/**
 * Story Domain JSON Schemas
 * Provider-agnostic schemas for structured generation
 * 
 * These schemas define the structure for LLM responses.
 * They are centralized here for easy maintenance and reusability.
 */

import type { JsonSchema } from '../../providers/base/JsonSchema';

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
          description: { type: 'string', description: 'BASE visual description IN ENGLISH: fixed layout, permanent furniture, walls, floor, windows, key objects that DO NOT change between scenes. This is the foundation - scene-specific details will be added separately.' },
        },
        required: ['id', 'name', 'description']
      },
      description: 'All distinct physical locations in the story. Each has base description - scene variations go in sceneVisual.setting. Multiple scenes can share the same environmentId.'
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
          sceneVisual: {
            type: 'object',
            properties: {
              setting: {
                type: 'string',
                description: 'DELTA: Scene-specific additions IN ENGLISH. Describe ONLY what is NEW or CHANGED in this scene compared to the base environment: temporary objects (books on table, food on counter), scene-specific details (open/closed doors, items being used), transient elements. DO NOT repeat base environment structure - it will be added automatically. If nothing changes from base, write minimal additions or time-of-day details.'
              },
              cameraComposition: {
                type: 'object',
                properties: {
                  shot: {
                    type: 'string',
                    description: 'Camera angle IN ENGLISH: shot type (wide/medium/close-up), eye level, focal point.'
                  },
                  characters: {
                    type: 'array',
                    maxItems: 2,
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'EXACT character name from the story character list' },
                        description: { type: 'string', description: 'Position in frame, body posture, action, facial expression, gaze direction. IN ENGLISH.' }
                      },
                      required: ['name', 'description']
                    },
                    description: 'Per-character composition. MUST list ALL characters physically present in this scene and ONLY those characters. Maximum 3.'
                  }
                },
                required: ['shot', 'characters']
              },
              lighting: {
                type: 'string',
                description: 'Lighting conditions IN ENGLISH. Light source, direction, intensity, shadows, color temperature, atmosphere.'
              },
            },
            required: ['setting', 'cameraComposition', 'lighting']
          },
          characterOutfits: {
            type: 'object',
            description: 'REQUIRED: Mapping of EACH character from cameraComposition.characters to their scene-appropriate outfit. For every character in the scene, describe their attire. For animals/creatures, use "natural appearance". Example: { "Emilia": "cozy sweater, leggings", "Rabbit": "natural appearance" }. NEVER leave empty.',
            additionalProperties: { type: 'string' },
            minProperties: 1
          }
        },
        required: ['sceneId', 'environmentId', 'text', 'sceneVisual']
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
 * Schema for image validation results (post-generation Vision check).
 * Detects character hallucinations, duplicates, missing/extra characters, reference fidelity.
 */
export const IMAGE_VALIDATION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    isValid: { type: 'boolean', description: 'True if image passes all validation checks' },
    characterCount: { type: 'number', description: 'Total number of distinct characters/creatures visible in the image' },
    expectedCharacterCount: { type: 'number', description: 'Number of characters expected based on the prompt' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Character name from the expected list' },
          found: { type: 'boolean', description: 'Whether this character is present in the image' },
          duplicated: { type: 'boolean', description: 'Whether this character appears more than once without scene justification. Only true when duplicate is NOT scene-justified (mirror, reflection, portrait = false).' },
          recognizableScore: { type: 'number', description: '0-1. 1=all distinctive features present. 0.9=exactly 1 feature wrong/missing (antennae not glowing, flowers on wings missing). 0.8=2 features. 0.7=3+. 0.5=wrong colors/species. 0=completely different creature. Penalty=(1-score)*20.' },
          matchesColors: { type: 'boolean', description: 'Whether the character color palette matches the reference image (fur/skin color, eye color, distinctive markings).' },
          matchesOutfit: { type: 'boolean', description: 'Whether clothing and accessories match the reference image (hat, bow, dress). Set to true if no outfit is described.' },
          issue: { type: 'string', nullable: true, description: 'ALL problems for this character in one string, separated by semicolons' },
        },
        required: ['name', 'found', 'duplicated', 'recognizableScore', 'matchesColors', 'matchesOutfit'],
      },
    },
    hasUnexpectedCharacters: { type: 'boolean', description: 'Whether there are extra characters not in the expected list' },
    hasTextOrLetters: { type: 'boolean', description: 'Whether the image contains any text, letters, words, or writing' },
    hasRenderingArtifacts: { type: 'boolean', description: 'Whether the image has visual artifacts at character boundaries: body parts showing through other characters, merged limbs, transparency errors.' },
    overallFeedback: { type: 'string', description: 'Human-readable summary of all issues found' },
  },
  required: ['isValid', 'characterCount', 'expectedCharacterCount', 'characters', 'hasUnexpectedCharacters', 'hasTextOrLetters', 'hasRenderingArtifacts', 'overallFeedback'],
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
    sceneVisual: {
      type: 'object',
      properties: {
        setting: {
          type: 'string',
          description: 'DELTA: Scene-specific additions IN ENGLISH. Describe ONLY what is NEW or CHANGED in this scene compared to the base environment: temporary objects (books on table, food on counter), scene-specific details (open/closed doors, items being used), transient elements. DO NOT repeat base environment structure - it will be added automatically. If nothing changes from base, write minimal additions or time-of-day details.'
        },
        cameraComposition: {
          type: 'object',
          properties: {
            shot: {
              type: 'string',
              description: 'Camera angle IN ENGLISH: shot type (wide/medium/close-up), eye level, focal point.'
            },
            characters: {
              type: 'array',
              maxItems: 2,
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'EXACT character name from the story character list' },
                  description: { type: 'string', description: 'Position in frame, body posture, action, facial expression, gaze direction. IN ENGLISH.' }
                },
                required: ['name', 'description']
              },
              description: 'Per-character composition. MUST list ALL characters physically present in this scene and ONLY those characters. Maximum 3.'
            }
          },
          required: ['shot', 'characters']
        },
        lighting: {
          type: 'string',
          description: 'Lighting conditions IN ENGLISH. Light source, direction, intensity, shadows.'
        },
      },
      required: ['setting', 'cameraComposition', 'lighting']
    },
    characterOutfits: {
      type: 'object',
      description: 'REQUIRED: Mapping of EACH character from cameraComposition.characters to their scene-appropriate outfit. For every character in the scene, describe their attire. For animals/creatures, use "natural appearance". Example: { "Emilia": "cozy sweater, leggings", "Rabbit": "natural appearance" }. NEVER leave empty.',
      additionalProperties: { type: 'string' },
      minProperties: 1
    }
  },
  required: ['sceneId', 'environmentId', 'text', 'sceneVisual']
};
