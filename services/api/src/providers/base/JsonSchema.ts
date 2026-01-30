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
 * Image data for vision models
 */
export interface ImageData {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data: string; // base64 encoded
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
