/**
 * Imagen 4 Fast Provider - Environment image generation
 * Text-to-image only, optimized for speed and cost ($0.02/image).
 * Uses Vertex AI REST API, model imagen-4.0-fast-generate-001.
 */

import type { IImageProvider, GenerateImageRequest, GeneratedImage } from '../../base/IImageProvider';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';
import { GoogleAuth } from 'google-auth-library';

interface VertexAIImageResponse {
  predictions: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
}

const MODEL_ID = 'imagen-4.0-fast-generate-001';

export class Imagen4FastProvider implements IImageProvider {
  private auth: GoogleAuth;
  private maxRetries: number;
  private retryDelayMs: number;
  private projectId: string;
  private location: string;

  constructor() {
    this.projectId = config.image.imagen4Fast?.projectId || config.image.gemini.projectId;
    this.location = config.image.imagen4Fast?.location || config.image.gemini.location;

    if (!this.projectId) {
      throw new Error('Google Cloud Project ID required for Imagen 4 Fast. Set GOOGLE_CLOUD_PROJECT env var.');
    }

    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    this.maxRetries = config.image.maxRetries;
    this.retryDelayMs = config.image.retryDelayMs;

    logger.info(
      { projectId: this.projectId, location: this.location },
      'Imagen 4 Fast Provider initialized'
    );
  }

  async generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        logger.info(
          {
            prompt: request.prompt.substring(0, 100),
            aspectRatio: request.aspectRatio,
            attempt: attempt + 1,
          },
          'Generating environment image with Imagen 4 Fast'
        );

        const result = await this.generateImageInternal(request);

        logger.info(
          { size: result.imageData.length, format: result.format },
          'Environment image generated successfully'
        );

        return result;
      } catch (error: any) {
        lastError = error;
        if (this.isRetryableError(error) && attempt < this.maxRetries - 1) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          logger.warn({ error: error.message, attempt: attempt + 1, delayMs: delay }, 'Retrying...');
          await this.sleep(delay);
          continue;
        }
        logger.error({ error, attempt: attempt + 1 }, 'Imagen 4 Fast failed');
        throw error;
      }
    }

    throw lastError || new Error('Image generation failed after all retries');
  }

  private async generateImageInternal(request: GenerateImageRequest): Promise<GeneratedImage> {
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken.token) {
      throw new Error('Failed to obtain access token for Vertex AI');
    }

    const requestBody = {
      instances: [{ prompt: request.prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: request.aspectRatio || '16:9',
        ...(request.personGeneration && { personGeneration: request.personGeneration }),
      },
    };

    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${MODEL_ID}:predict`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Vertex AI API failed');
      throw new Error(`Vertex AI API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as VertexAIImageResponse;

    if (!data.predictions || data.predictions.length === 0) {
      throw new Error('No image predictions returned (content may be blocked)');
    }

    const prediction = data.predictions[0];
    const imageData = Buffer.from(prediction.bytesBase64Encoded, 'base64');
    const dimensions = this.calculateDimensions(request.aspectRatio || '16:9');

    return {
      imageData,
      mimeType: prediction.mimeType || 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      format: this.getMimeFormat(prediction.mimeType),
    };
  }

  private calculateDimensions(aspectRatio: string): { width: number; height: number } {
    const map: Record<string, { width: number; height: number }> = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1024, height: 576 },
      '9:16': { width: 576, height: 1024 },
      '4:3': { width: 1024, height: 768 },
      '3:4': { width: 768, height: 1024 },
    };
    return map[aspectRatio] || map['16:9'];
  }

  private getMimeFormat(mimeType?: string): 'png' | 'jpeg' | 'webp' {
    if (!mimeType) return 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpeg';
    if (mimeType.includes('webp')) return 'webp';
    return 'png';
  }

  private isRetryableError(error: any): boolean {
    const msg = error.message?.toLowerCase() || '';
    return ['rate limit', 'quota', 'timeout', 'unavailable', '429', '500', '503'].some((s) =>
      msg.includes(s)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
