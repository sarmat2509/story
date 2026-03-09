/**
 * Provider-agnostic Image Generation Interface
 * Abstracts image generation providers (Gemini Imagen 3, DALL-E, Stable Diffusion, etc.)
 */

import type { IFileManager } from './IFileManager';
import type { UsageMetadata } from './UsageMetadata';

/**
 * Reference image for character consistency
 */
export interface ReferenceImage {
  url?: string; // Storage URL for internal use (optional if base64Data provided)
  base64Data?: string; // Base64-encoded image data (alternative to url)
  fileUri?: string; // Provider file URI (alternative to base64Data — avoids inline payload)
  mimeType?: string; // MIME type if using base64Data (e.g., 'image/jpeg', 'image/png')
  characterName?: string; // Optional label for the reference
  instructionText?: string; // Per-image instruction for multimodal interleaving (placed before image in parts)
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
  systemInstruction?: string; // Static context (style, characters) set once per story, separate from per-scene prompt
  onUsage?: (usage: UsageMetadata) => void; // Optional callback for cost tracking
  operation?: string; // Operation name for usage callback (e.g. 'image_generate', 'image_edit')
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
 * Request to edit/correct an existing generated image.
 * Sends the original image + edit instructions to fix specific issues
 * (e.g. anatomical errors, missing characters) while preserving correct elements.
 */
export interface EditImageRequest {
  originalImage: Buffer;           // The image to edit
  originalMimeType: string;        // MIME type of the original image
  editInstructions: string;        // What to fix (built from validation feedback)
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  referenceImages?: ReferenceImage[]; // Character references for consistency
  systemInstruction?: string;      // Static context (style, characters)
  personGeneration?: 'allow_adult' | 'allow_all' | 'dont_allow';
  onUsage?: (usage: UsageMetadata) => void; // Optional callback for cost tracking
  operation?: string; // Operation name for usage callback (e.g. 'image_edit')
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
   * Edit an existing image to fix specific issues while preserving correct elements.
   * Sends the original image + edit instructions to the provider.
   * Optional — falls back to full regeneration if not supported.
   * @param request - Edit request with original image and instructions
   * @returns Corrected image
   */
  editImage?(request: EditImageRequest): Promise<GeneratedImage>;

  /**
   * Generate multiple images from prompt (optional, for variations)
   * @param request - Request with count parameter
   * @returns Array of generated images
   */
  generateImages?(request: GenerateImageRequest & { count: number }): Promise<GeneratedImage[]>;

  /**
   * Get the file manager for this provider (optional).
   * Returns null if the provider does not support file uploads.
   * Used to upload reference images once and reuse via file URI.
   */
  getFileManager?(): IFileManager | null;
}

