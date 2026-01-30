/**
 * Gemini Schema Adapter
 * Converts provider-agnostic JsonSchema to Gemini-specific SchemaType
 * 
 * This is the ONLY file that should import Gemini-specific types for schemas.
 * Domain Services and Prompt Builders work with JsonSchema only.
 */

import { SchemaType } from '@google/generative-ai';
import type { JsonSchema, JsonSchemaType } from '../../base/JsonSchema';

/**
 * Gemini-specific schema representation
 * This is what the Gemini API expects
 */
export interface GeminiSchema {
  type: SchemaType;
  description?: string;
  enum?: any[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
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
      const types = schemaType.filter(t => t !== 'null');
      isNullable = schemaType.includes('null');
      
      if (types.length === 0) {
        throw new Error('Schema must have at least one non-null type');
      }
      
      // Use the first non-null type
      schemaType = types[0];
    }
    
    const geminiSchema: GeminiSchema = {
      type: this.convertType(schemaType as JsonSchemaType)
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
      geminiSchema.enum = schema.enum.filter(v => v !== null);
    }

    if (schema.minimum !== undefined) {
      geminiSchema.minimum = schema.minimum;
    }

    if (schema.maximum !== undefined) {
      geminiSchema.maximum = schema.maximum;
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
  private convertType(type: JsonSchemaType): SchemaType {
    switch (type) {
      case 'string':
        return SchemaType.STRING;
      case 'number':
        return SchemaType.NUMBER;
      case 'integer':
        return SchemaType.INTEGER;
      case 'boolean':
        return SchemaType.BOOLEAN;
      case 'object':
        return SchemaType.OBJECT;
      case 'array':
        return SchemaType.ARRAY;
      default:
        throw new Error(`Unsupported schema type: ${type}`);
    }
  }
}
