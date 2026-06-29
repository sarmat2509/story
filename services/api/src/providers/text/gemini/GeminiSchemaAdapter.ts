/**
 * Gemini Schema Adapter
 * Converts provider-agnostic JsonSchema to Gemini-specific SchemaType
 *
 * This is the ONLY file that should import Gemini-specific types for schemas.
 * Domain Services and Prompt Builders work with JsonSchema only.
 */

import { Type } from '@google/genai';
import type { JsonSchema, JsonSchemaType } from '../../base/JsonSchema';

/**
 * Gemini-specific schema representation
 * This is what the Gemini API expects
 */
export interface GeminiSchema {
  type: Type;
  description?: string;
  enum?: any[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minProperties?: number;
  maxProperties?: number;
  format?: string;
}

/**
 * GeminiSchemaAdapter - Converts JsonSchema to Gemini SchemaType
 *
 * Handles the conversion between provider-agnostic JSON schemas
 * and Gemini's specific schema format.
 */
export class GeminiSchemaAdapter {
  /**
   * Convert provider-agnostic JsonSchema to Gemini schema format
   * @param schema - Provider-agnostic JSON schema
   * @returns Gemini-specific schema
   */
  convert(schema: JsonSchema): GeminiSchema {
    // Handle union types (e.g., ['object', 'null'])
    let schemaType = schema.type;
    let isNullable = false;

    if (Array.isArray(schemaType)) {
      // Extract non-null type and set nullable flag
      const types = schemaType.filter((t) => t !== 'null');
      isNullable = schemaType.includes('null');

      if (types.length === 0) {
        throw new Error('Schema must have at least one non-null type');
      }

      // Use the first non-null type
      schemaType = types[0];
    }

    const geminiSchema: GeminiSchema = {
      type: this.convertType(schemaType as JsonSchemaType),
    };

    // Set nullable flag if type is a union with null
    if (isNullable || schema.nullable) {
      geminiSchema.nullable = true;
    }

    // Add optional properties
    if (schema.description) {
      geminiSchema.description = schema.description;
    }

    if (schema.enum) {
      // Filter out null from enum if present (handled by nullable flag)
      geminiSchema.enum = schema.enum.filter((v) => v !== null);
    }

    if (schema.minimum !== undefined) {
      geminiSchema.minimum = schema.minimum;
    }

    if (schema.maximum !== undefined) {
      geminiSchema.maximum = schema.maximum;
    }

    if (schema.minLength !== undefined) {
      geminiSchema.minLength = schema.minLength;
    }

    if (schema.maxLength !== undefined) {
      geminiSchema.maxLength = schema.maxLength;
    }

    if (schema.minItems !== undefined) {
      geminiSchema.minItems = schema.minItems;
    }

    if (schema.maxItems !== undefined) {
      geminiSchema.maxItems = schema.maxItems;
    }

    if (schema.minProperties !== undefined) {
      geminiSchema.minProperties = schema.minProperties;
    }

    if (schema.maxProperties !== undefined) {
      geminiSchema.maxProperties = schema.maxProperties;
    }

    // Handle array items
    if (schema.items) {
      geminiSchema.items = this.convert(schema.items);
    }

    // Handle object properties
    if (schema.properties) {
      geminiSchema.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        geminiSchema.properties[key] = this.convert(value);
      }
    }

    // Handle required fields
    if (schema.required) {
      geminiSchema.required = schema.required;
    }

    return geminiSchema;
  }

  /**
   * Convert JsonSchemaType to Gemini SchemaType
   * @param type - JSON schema type string
   * @returns Gemini SchemaType enum value
   */
  private convertType(type: JsonSchemaType): Type {
    switch (type) {
      case 'string':
        return Type.STRING;
      case 'number':
        return Type.NUMBER;
      case 'integer':
        return Type.INTEGER;
      case 'boolean':
        return Type.BOOLEAN;
      case 'object':
        return Type.OBJECT;
      case 'array':
        return Type.ARRAY;
      default:
        throw new Error(`Unsupported schema type: ${type}`);
    }
  }
}
