/**
 * Face Deduplication Service
 * Uses Gemini Vision API to group photos by individual (person, animal, or imaginary creature)
 * 
 * Rules:
 * - Analyzes multiple photos to identify unique individuals
 * - Groups photos of the same individual together
 * - Works for humans, animals, and imaginary creatures
 * - Returns character type and suggested name for each group
 */

import type { UsageMetadata } from '../providers/base/UsageMetadata';
import type { ITextProvider } from '../providers/base/ITextProvider';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface PhotoGroup {
  groupId: string; // Generated UUID
  name: string; // Gemini's best guess name (e.g., "Girl with blonde hair")
  characterType: 'person' | 'animal' | 'imaginary';
  photoUrls: string[]; // URLs of photos in this group
}

interface GeminiDeduplicationResponse {
  groups: Array<{
    groupId: string;
    photoIndices: number[];
    characterType: 'person' | 'animal' | 'imaginary';
    suggestedName: string;
  }>;
}

export interface FaceDeduplicationOptions {
  onUsage?: (usage: UsageMetadata) => void;
}

export class FaceDeduplicationService {
  constructor(private textProvider: ITextProvider) {}

  /**
   * Group photos by individual identity
   * Uses Gemini Vision to compare faces/features across photos
   */
  async groupPhotosByIdentity(photoUrls: string[], options?: FaceDeduplicationOptions): Promise<PhotoGroup[]> {
    if (photoUrls.length === 0) {
      return [];
    }

    logger.info({ photoCount: photoUrls.length }, 'Starting photo deduplication');

    try {
      // Download photos and convert to base64
      const imageData = await this.prepareImages(photoUrls);

      // Build deduplication prompt
      const prompt = this.buildDeduplicationPrompt(photoUrls.length);

      // Call Gemini Vision with structured output
      const result = await this.textProvider.generateStructured<GeminiDeduplicationResponse>({
        model: config.ai?.geminiVisionModel || 'gemini-2.5-flash',
        prompt,
        imageData,
        schema: this.getDeduplicationSchema(),
        temperature: 0.3,
        relaxedSafety: true,
        onUsage: options?.onUsage,
        operation: 'face_dedup',
      });

      // Map Gemini response to PhotoGroups
      const photoGroups = result.groups.map(group => ({
        groupId: group.groupId,
        name: group.suggestedName,
        characterType: group.characterType,
        photoUrls: group.photoIndices.map(idx => photoUrls[idx]),
      }));

      logger.info({
        totalPhotos: photoUrls.length,
        groupsFound: photoGroups.length,
      }, 'Photo deduplication completed');

      return photoGroups;
    } catch (error) {
      logger.error({ error, photoCount: photoUrls.length }, 'Photo deduplication failed');
      
      // Fallback: treat each photo as separate character
      logger.warn('Falling back to one character per photo');
      return photoUrls.map((url, idx) => ({
        groupId: String(idx + 1),
        name: `Character ${idx + 1}`,
        characterType: 'person' as const,
        photoUrls: [url],
      }));
    }
  }

  /**
   * Prepare images for Gemini Vision API
   */
  private async prepareImages(photoUrls: string[]): Promise<Array<{ mimeType: 'image/jpeg'; data: string }>> {
    const images: Array<{ mimeType: 'image/jpeg'; data: string }> = [];

    for (const url of photoUrls) {
      try {
        const buffer = await this.downloadImage(url);
        images.push({
          mimeType: 'image/jpeg',
          data: buffer.toString('base64'),
        });
      } catch (error) {
        logger.error({ error, url }, 'Failed to download image for deduplication');
        throw error;
      }
    }

    return images;
  }

  /**
   * Download image from URL
   */
  private async downloadImage(url: string): Promise<Buffer> {
    const assetPrefix = '/api/v1/assets/';
    const assetIdx = url.indexOf(assetPrefix);
    
    if (assetIdx !== -1) {
      const pathWithQuery = url.substring(assetIdx + assetPrefix.length);
      const storagePath = pathWithQuery.split('?')[0];
      logger.debug({ storagePath }, 'Reading image from local storage');
      const { getAssetStorageService } = await import('./assetStorageService');
      return getAssetStorageService().getAssetByPath(storagePath);
    }

    // External URL — use HTTP fetch
    try {
      logger.debug({ url }, 'Downloading image for deduplication');
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error({ error, url }, 'Failed to download image');
      throw new Error(`Failed to download image from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build deduplication prompt for Gemini
   */
  private buildDeduplicationPrompt(photoCount: number): string {
    return `LEGITIMATE USE CASE: This analysis is for creating personalized children's storybook illustrations. Parents upload photos of their children, pets, and family members to appear in educational stories.

Analyze these ${photoCount} photos and identify unique individuals (people, animals, or imaginary creatures).

For each unique individual:
1. Assign a groupId (sequential: "1", "2", "3"...)
2. List photo indices that show this individual (0-indexed, e.g., [0, 1, 2])
3. Determine character type using these rules:
   - **imaginary**: If the image shows ANY of:
     * Children's drawing (paper texture, visible pencil/crayon/marker strokes, flat 2D appearance, contour lines, uneven coloring, hand-drawn style)
     * Fantasy creature with impossible features (wings on humans, horns on non-animals, multiple heads/tails, magical elements like fire/sparkles/glowing)
     * Cartoon/stylized character that doesn't exist in real life (blue dragons, purple monsters, talking objects, anthropomorphic objects)
     * Drawing of imaginary friend, monster, alien, robot, fantasy character
   - **animal**: Real-world animals (dogs, cats, birds, etc.) in photographs
   - **person**: Real human beings in photographs
   
   CRITICAL: Children's drawings should ALWAYS be "imaginary", even if they depict a person or animal. Look for drawing indicators (paper texture, hand-drawn lines, flat 2D appearance, contour lines).

4. Suggest a descriptive name:
   - For people: age + distinctive feature (e.g., "Girl with curly blonde hair")
   - For animals: species/breed + color (e.g., "Golden retriever")
   - For imaginary: describe the drawing (e.g., "Blue dragon from drawing", "Child's drawing of purple monster", "Hand-drawn robot")

CRITICAL: If the SAME individual appears in multiple photos, they should be in ONE group.
Look for matching features:
- For people: face structure, hair color/style, eye color, skin tone, age, distinctive marks
- For animals: species, breed, fur color/pattern, size, distinctive markings
- For imaginary creatures (drawings): body shape, color, distinctive features

Examples:
- If photos 0, 1, 2 show the same girl in photographs: {"groupId": "1", "photoIndices": [0, 1, 2], "characterType": "person", "suggestedName": "Girl with blonde hair"}
- If photo 3 shows a dog photograph: {"groupId": "2", "photoIndices": [3], "characterType": "animal", "suggestedName": "Brown dog"}
- If photo 4 shows a child's drawing of a person: {"groupId": "3", "photoIndices": [4], "characterType": "imaginary", "suggestedName": "Child's drawing of a person"}
- If photo 5 shows a hand-drawn dragon: {"groupId": "4", "photoIndices": [5], "characterType": "imaginary", "suggestedName": "Blue dragon from drawing"}
- If photo 6 shows a fantasy creature with wings: {"groupId": "5", "photoIndices": [6], "characterType": "imaginary", "suggestedName": "Winged creature"}

Return ONLY valid JSON matching this structure. Each photo must appear in exactly one group.`;
  }

  /**
   * Get JSON schema for deduplication response
   */
  private getDeduplicationSchema(): any {
    return {
      type: 'object' as const,
      properties: {
        groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              groupId: {
                type: 'string',
                description: 'Sequential group ID: "1", "2", "3", etc.',
              },
              photoIndices: {
                type: 'array',
                items: { type: 'number' },
                description: '0-indexed photo indices in this group',
              },
              characterType: {
                type: 'string',
                enum: ['person', 'animal', 'imaginary'],
                description: 'Type of character',
              },
              suggestedName: {
                type: 'string',
                description: 'Descriptive name for this individual',
              },
            },
            required: ['groupId', 'photoIndices', 'characterType', 'suggestedName'],
          },
        },
      },
      required: ['groups'],
    };
  }
}

/**
 * Get singleton instance of Face Deduplication Service
 */
let faceDeduplicationServiceInstance: FaceDeduplicationService | null = null;
let faceDeduplicationTextProvider: ITextProvider | null = null;

export function getFaceDeduplicationService(): FaceDeduplicationService {
  const { getTextProvider } = require('./aiService');
  const textProvider = getTextProvider() as ITextProvider;
  if (!faceDeduplicationServiceInstance || faceDeduplicationTextProvider !== textProvider) {
    faceDeduplicationServiceInstance = new FaceDeduplicationService(textProvider);
    faceDeduplicationTextProvider = textProvider;
  }
  
  return faceDeduplicationServiceInstance;
}
