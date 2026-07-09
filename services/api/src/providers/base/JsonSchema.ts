/**
 * Provider-agnostic JSON Schema types
 * These types can be adapted to any LLM provider's schema format
 */

import type { UsageMetadata } from './UsageMetadata';

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
  /** Optional text placed immediately before this image in multimodal requests. */
  instructionText?: string;
}

export type MultimodalInputPart =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      mimeType: ImageData['mimeType'];
      data?: string;
      fileUri?: string;
    };

export interface PromptCacheConfig {
  key: string;
  content: string;
  ttlSeconds?: number;
  displayName?: string;
}

export interface StructuredRawResponse {
  provider: string;
  operation: string;
  model: string;
  responseText: string;
  responseLength: number;
  finishReason?: string | null;
  durationMs?: number;
}

/**
 * Request parameters for structured generation
 */
export interface GenerateStructuredRequest<T = any> {
  prompt: string;
  schema: JsonSchema;
  /** Optional provider-level system instruction. Use for operation-specific framing such as image QA. */
  systemInstruction?: string;
  model?: string; // Optional model override
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  /**
   * Exact ordered multimodal input. When set, providers send these parts as the
   * user content instead of rebuilding from prompt + imageData.
   */
  inputParts?: MultimodalInputPart[];
  imageData?: ImageData[]; // For vision models (Gemini Vision, GPT-4 Vision, etc.)
  cachedPrefix?: PromptCacheConfig; // Optional stable prefix for provider-side prompt caching
  relaxedSafety?: boolean; // Use ultra-relaxed safety settings (for photo analysis)
  onUsage?: (usage: UsageMetadata) => void; // Optional callback for cost tracking
  onRawResponse?: (response: StructuredRawResponse) => void | Promise<void>; // Optional full provider response hook for diagnostics
  operation?: string; // Operation name for usage callback (e.g. 'text_structured', 'validateScene')
}

/**
 * Request parameters for text generation
 */
export interface GenerateTextRequest {
  prompt: string;
  cachedPrefix?: PromptCacheConfig; // Optional stable prefix for provider-side prompt caching
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  onUsage?: (usage: UsageMetadata) => void; // Optional callback for cost tracking
  operation?: string; // Operation name for usage callback (e.g. 'text_free', 'text_continuation')
}

/**
 * Streaming callback
 */
export interface StreamCallback {
  onChunk: (chunk: string) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}
