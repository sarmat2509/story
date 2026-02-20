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
  minItems?: number;
  maxItems?: number;
  minProperties?: number;
  maxProperties?: number;
  pattern?: string;
  default?: any;
  additionalProperties?: JsonSchema | boolean;
}

export interface JsonSchema extends JsonSchemaProperty {
  $schema?: string;
  title?: string;
  definitions?: Record<string, JsonSchema>;
}

/**
 * Image data for vision models.
 * Supports both inline base64 and Files API URI references.
 */
export interface ImageData {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data: string; // base64 encoded (can be empty when fileUri is provided)
  fileUri?: string; // Files API URI — when present, used instead of inline data
}

/**
 * Request parameters for structured generation
 */
export interface GenerateStructuredRequest<T = any> {
  prompt: string;
  schema: JsonSchema;
  model?: string; // Optional model override
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  imageData?: ImageData[]; // For vision models (Gemini Vision, GPT-4 Vision, etc.)
  relaxedSafety?: boolean; // Use ultra-relaxed safety settings (for photo analysis)
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
