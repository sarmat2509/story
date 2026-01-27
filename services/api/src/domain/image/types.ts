/**
 * Image Domain Types
 * Domain-specific types for image generation
 */

// Re-export provider interfaces for domain layer convenience
export type {
  GenerateImageRequest,
  GeneratedImage
} from '../../providers/base/IImageProvider';

export type { SceneImageRequest } from './ImageDomainService';
