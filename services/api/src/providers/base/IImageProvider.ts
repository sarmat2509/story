/**
 * Provider-agnostic Image Generation Interface
 * Abstracts image generation providers (Gemini Imagen 3, DALL-E, Stable Diffusion, etc.)
 */

/**
 * Reference image for character consistency
 */
export interface ReferenceImage {
  url?: string; // Storage URL for internal use (optional if base64Data provided)
  base64Data?: string; // Base64-encoded image data (alternative to url)
  mimeType?: string; // MIME type if using base64Data (e.g., 'image/jpeg', 'image/png')
  characterName?: string; // Optional label for the reference
  // Additional fields for API conversion
  referenceId?: number; // 1-4, used in prompt as [1], [2], etc.
  subjectDescription?: string; // Description of the subject
  subjectType?: 'SUBJECT_TYPE_PERSON' | 'SUBJECT_TYPE_PRODUCT' | 'SUBJECT_TYPE_ANIMAL';
}

/**
 * Image generation request parameters
 * Aligned with Imagen 3 API capabilities
 */
export interface GenerateImageRequest {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  referenceImages?: ReferenceImage[]; // For character consistency (capability model only)
  personGeneration?: 'allow_adult' | 'allow_all' | 'dont_allow'; // Control person generation (lowercase as per API)
  // REMOVED (not supported by Imagen 3):
  // - negativePrompt (include in prompt text instead)
  // - width, height (use aspectRatio)
  // - seed (no deterministic generation)
  // - guidanceScale (no strength control)
  // - style (handled in prompt engineering)
}

/**
 * Generated image result
 */
export interface GeneratedImage {
  imageData: Buffer;    // Image data as buffer
  mimeType: string;     // MIME type (image/png, image/jpeg, etc.)
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
  revisedPrompt?: string; // Some providers modify the prompt
  // REMOVED: seed (Imagen 3 doesn't support deterministic generation)
}

/**
 * IImageProvider - Provider-agnostic interface for image generation
 * 
 * MVP: GeminiImageProvider (Imagen 3)
 * Future: OpenAIImageProvider (DALL-E), StabilityProvider (Stable Diffusion)
 */
export interface IImageProvider {
  /**
   * Generate single image from prompt
   * @param request - Provider-agnostic image generation request
   * @returns Generated image metadata
   */
  generateImage(request: GenerateImageRequest): Promise<GeneratedImage>;

  /**
   * Generate multiple images from prompt (optional, for variations)
   * @param request - Request with count parameter
   * @returns Array of generated images
   */
  generateImages?(request: GenerateImageRequest & { count: number }): Promise<GeneratedImage[]>;
}

