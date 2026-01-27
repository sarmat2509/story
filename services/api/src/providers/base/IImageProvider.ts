/**
 * Provider-agnostic Image Generation Interface
 * Abstracts image generation providers (Gemini Imagen 3, DALL-E, Stable Diffusion, etc.)
 */

/**
 * Reference image for character consistency
 */
export interface ReferenceImage {
  url: string;
  characterName?: string; // Optional label for the reference
}

/**
 * Image generation request parameters
 */
export interface GenerateImageRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  style?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  seed?: number;
  guidanceScale?: number;
  referenceImages?: ReferenceImage[]; // For character consistency
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
  seed?: number;        // Seed used for generation (for reproducibility)
  revisedPrompt?: string; // Some providers modify the prompt
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

