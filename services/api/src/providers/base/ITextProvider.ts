/**
 * Provider-agnostic Text Generation Interface
 * Abstracts LLM providers (Gemini, OpenAI, Claude, etc.)
 */

import type { GenerateStructuredRequest, GenerateTextRequest, StreamCallback } from './JsonSchema';
import type { StorySpec, EpisodeOutline, EpisodeText, PolicyProfile, SceneValidationResult } from '../../ai/types';

/**
 * ITextProvider - Provider-agnostic interface for text generation
 * 
 * Any LLM provider (Gemini, OpenAI, Claude) must implement this interface.
 * Domain Services work ONLY with this interface, never with specific providers.
 */
export interface ITextProvider {
  /**
   * Generate structured JSON response
   * @param request - Provider-agnostic request with prompt and schema
   * @returns Parsed JSON matching the schema
   */
  generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T>;

  /**
   * Generate free-form text response
   * @param request - Provider-agnostic request with prompt
   * @returns Generated text
   */
  generateText(request: GenerateTextRequest): Promise<string>;

  /**
   * Generate text with streaming (optional)
   * @param request - Request with streaming callback
   */
  generateStream?(request: GenerateTextRequest & StreamCallback): Promise<void>;
}
