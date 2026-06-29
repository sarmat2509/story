/**
 * OpenAI Schema Adapter
 * Converts provider-agnostic JsonSchema to OpenAI strict JSON schema format
 * 
 * OpenAI's structured output uses standard JSON Schema with one key requirement:
 * - `additionalProperties: false` must be set on every object type (strict mode)
 * - Nullable types use `{ "type": ["string", "null"] }` syntax
 */

import type { JsonSchema } from '../../base/JsonSchema';

/**
 * OpenAISchemaAdapter - Converts JsonSchema to OpenAI strict format
 * 
 * OpenAI's format is closer to standard JSON Schema than Gemini's,
 * so the main adaptation is ensuring `additionalProperties: false`
 * on all object types for strict mode compliance.
 */
export class OpenAISchemaAdapter {
  /**
   * Convert provider-agnostic JsonSchema to OpenAI strict schema format
   * @param schema - Provider-agnostic JSON schema
   * @returns OpenAI-compatible JSON schema object
   */
  convert(schema: JsonSchema): Record<string, any> {
    return this.convertNode(schema);
  }

  /**
   * Recursively convert a schema node to OpenAI format
   */
  private convertNode(schema: JsonSchema): Record<string, any> {
    const result: Record<string, any> = {};

    // Handle type (including nullable via union types)
    if (schema.type) {
      if (Array.isArray(schema.type)) {
        // Union type e.g. ['string', 'null'] — OpenAI supports this natively
        result.type = schema.type;
      } else if (schema.nullable) {
        // Convert nullable flag to union type for OpenAI
        result.type = [schema.type, 'null'];
      } else {
        result.type = schema.type;
      }
    }

    // Description
    if (schema.description) {
      result.description = schema.description;
    }

    // Enum values
    if (schema.enum) {
      result.enum = schema.enum;
    }

    // Numeric constraints
    if (schema.minimum !== undefined) {
      result.minimum = schema.minimum;
    }
    if (schema.maximum !== undefined) {
      result.maximum = schema.maximum;
    }

    // String constraints
    if (schema.minLength !== undefined) {
      result.minLength = schema.minLength;
    }
    if (schema.maxLength !== undefined) {
      result.maxLength = schema.maxLength;
    }
    if (schema.pattern) {
      result.pattern = schema.pattern;
    }

    // Array items
    if (schema.items) {
      result.items = this.convertNode(schema.items);
    }
    if (schema.minItems !== undefined) {
      result.minItems = schema.minItems;
    }
    if (schema.maxItems !== undefined) {
      result.maxItems = schema.maxItems;
    }
    if (schema.minProperties !== undefined) {
      result.minProperties = schema.minProperties;
    }
    if (schema.maxProperties !== undefined) {
      result.maxProperties = schema.maxProperties;
    }

    // Object properties
    if (schema.properties) {
      const allKeys = Object.keys(schema.properties);
      const originalRequired = new Set(schema.required || []);

      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        const converted = this.convertNode(value);
        // If the key was NOT in the original required array, make it nullable
        // so OpenAI can return null instead of omitting it
        if (!originalRequired.has(key)) {
          converted.type = this.makeNullable(converted.type);
        }
        result.properties[key] = converted;
      }

      // CRITICAL: OpenAI strict mode requires ALL properties in required array
      result.required = allKeys;
      // CRITICAL: OpenAI strict mode requires additionalProperties: false on all objects
      result.additionalProperties = false;
    } else {
      // Required fields (non-object schemas)
      if (schema.required) {
        result.required = schema.required;
      }
    }

    // If this is an object type without explicit properties, still set additionalProperties
    const resolvedType = Array.isArray(result.type)
      ? result.type.find((t: string) => t !== 'null')
      : result.type;
    if (resolvedType === 'object' && !result.properties) {
      result.additionalProperties = false;
    }

    return result;
  }

  /**
   * Make a type nullable by converting to union with 'null'.
   * Used for properties not in original `required` — OpenAI strict mode
   * requires all properties to be required, so optional ones become nullable.
   */
  private makeNullable(type: any): any {
    if (!type) return ['string', 'null'];

    if (Array.isArray(type)) {
      // Already a union type — add 'null' if not present
      if (!type.includes('null')) {
        return [...type, 'null'];
      }
      return type;
    }

    // Single type — convert to union with null
    return [type, 'null'];
  }
}
