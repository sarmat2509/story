/**
 * Provider-agnostic JSON Schema types
 * These types can be adapted to any LLM provider's schema format
 */

export type JsonSchemaType = 
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

export interface JsonSchemaProperty {
  type: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: any[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: any;
}

export interface JsonSchema extends JsonSchemaProperty {
  $schema?: string;
  title?: string;
  definitions?: Record<string, JsonSchema>;
}

/**
 * Request parameters for structured generation
 */
export interface GenerateStructuredRequest<T = any> {
  prompt: string;
  schema: JsonSchema;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
}

/**
 * Request parameters for text generation
 */
export interface GenerateTextRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
}

/**
 * Streaming callback
 */
export interface StreamCallback {
  onChunk: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}
