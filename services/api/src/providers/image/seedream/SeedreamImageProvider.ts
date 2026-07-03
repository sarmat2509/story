/**
 * Seedream Image Provider - BytePlus ModelArk image generation.
 *
 * BytePlus exposes Seedream through an OpenAI-compatible Image Generation API:
 * POST /images/generations with optional reference images in the `image` field.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import type {
  EditImageRequest,
  GenerateImageRequest,
  GeneratedImage,
  IImageProvider,
  ReferenceImage,
} from '../../base/IImageProvider';
import { logger } from '../../../utils/logger';
import { config } from '../../../config';

type SeedreamOutputFormat = 'jpeg' | 'png';
type SeedreamResponseFormat = 'url' | 'b64_json';

interface SeedreamImageItem {
  url?: string;
  b64_json?: string;
  size?: string;
  revised_prompt?: string;
}

interface SeedreamImagesResponse {
  created?: number;
  data?: SeedreamImageItem[];
  usage?: {
    generated_images?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

interface SeedreamCallParams {
  prompt: string;
  systemInstruction?: string;
  aspectRatio?: GenerateImageRequest['aspectRatio'];
  referenceImages?: ReferenceImage[];
  operation: string;
  onUsage?: GenerateImageRequest['onUsage'];
}

export class SeedreamImageProvider implements IImageProvider {
  private client: OpenAI;
  private model: string;
  private sizeOverride: string;
  private outputFormat: SeedreamOutputFormat;
  private responseFormat: SeedreamResponseFormat;
  private watermark: boolean;
  private optimizePromptMode: string;

  constructor(apiKey?: string) {
    const key = apiKey || config.seedream?.apiKey || '';

    if (!key) {
      throw new Error('Seedream API key is required. Set SEEDREAM_API_KEY env var.');
    }

    this.client = new OpenAI({
      apiKey: key,
      baseURL: config.seedream?.baseUrl || 'https://ark.ap-southeast.bytepluses.com/api/v3',
      timeout: config.seedream?.timeoutMs || 180000,
    });
    this.model = config.seedream?.model || 'seedream-5-0-260128';
    this.sizeOverride = config.seedream?.size || '';
    this.outputFormat = this.normalizeOutputFormat(config.seedream?.outputFormat);
    this.responseFormat = this.normalizeResponseFormat(config.seedream?.responseFormat);
    this.watermark = config.seedream?.watermark === true;
    this.optimizePromptMode = config.seedream?.optimizePromptMode || '';

    logger.info(
      {
        model: this.model,
        baseUrl: config.seedream?.baseUrl,
        sizeOverride: this.sizeOverride || null,
        outputFormat: this.outputFormat,
        responseFormat: this.responseFormat,
        watermark: this.watermark,
        timeoutMs: config.seedream?.timeoutMs,
      },
      'Seedream Image Provider initialized'
    );
  }

  async generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
    return this.generateSeedreamImage({
      prompt: request.prompt,
      systemInstruction: request.systemInstruction,
      aspectRatio: request.aspectRatio,
      referenceImages: request.referenceImages,
      operation: request.operation || 'image_generate',
      onUsage: request.onUsage,
    });
  }

  async editImage(request: EditImageRequest): Promise<GeneratedImage> {
    const originalImageReference: ReferenceImage = {
      base64Data: request.originalImage.toString('base64'),
      mimeType: request.originalMimeType,
      instructionText:
        request.operation === 'graphic_novel_page_edit'
          ? 'Image 1 is the source comic page to edit. Preserve the existing page aspect, visible panel count, panel borders, gutters, and bubble placement.'
          : 'Image 1 is the generated scene that needs repair. Preserve the correct composition and style, but replace wrong character identity or outfit details with the reference images.',
      referenceKind: 'object',
    };

    return this.generateSeedreamImage({
      prompt: request.editInstructions,
      systemInstruction: request.systemInstruction,
      aspectRatio: request.aspectRatio,
      referenceImages: [originalImageReference, ...(request.referenceImages || [])],
      operation: request.operation || 'image_edit',
      onUsage: request.onUsage,
    });
  }

  private async generateSeedreamImage(params: SeedreamCallParams): Promise<GeneratedImage> {
    const refs = params.referenceImages || [];
    const size = this.mapSize(params.aspectRatio);

    logger.info(
      {
        promptLength: params.prompt.length,
        promptWordCount: params.prompt.split(/\s+/).length,
        hasReferences: refs.length > 0,
        referenceCount: refs.length,
        referenceInstructions: refs.map((ref, index) => ({
          index,
          instructionText: ref.instructionText || null,
          characterName: ref.characterName || null,
          referenceKind: ref.referenceKind || null,
        })),
        hasSystemInstruction: !!params.systemInstruction,
        systemInstructionLength: params.systemInstruction?.length || 0,
        size,
        model: this.model,
        outputFormat: this.effectiveOutputFormat(),
        responseFormat: this.responseFormat,
        operation: params.operation,
      },
      'Generating image with Seedream'
    );

    try {
      const referenceDataUrls = await Promise.all(
        refs.map((ref, index) => this.referenceToDataUrl(ref, index + 1))
      );
      const body = this.buildRequestBody({
        prompt: this.buildPrompt(params.prompt, params.systemInstruction, refs),
        referenceDataUrls,
        size,
      });

      const startedAt = Date.now();
      const response = await this.client.post<SeedreamImagesResponse>('/images/generations', {
        body,
      });
      const durationMs = Date.now() - startedAt;
      const item = response.data?.[0];

      if (!item?.b64_json && !item?.url) {
        logger.error({ response }, 'Seedream response did not include image data');
        throw new Error('Seedream response did not include image data');
      }

      const image = item.b64_json
        ? {
            imageData: Buffer.from(this.stripDataUrlPrefix(item.b64_json), 'base64'),
            mimeType: this.mimeTypeForFormat(this.effectiveOutputFormat()),
          }
        : await this.downloadGeneratedImage(item.url!);
      const dimensions = this.dimensionsFromSize(item.size || size, params.aspectRatio);
      const format = this.formatFromMimeType(image.mimeType);

      params.onUsage?.({
        provider: 'seedream',
        operation: params.operation,
        model: this.model,
        inputUnits: response.usage?.input_tokens ?? 1,
        outputUnits: response.usage?.output_tokens,
        imageTokens: response.usage?.generated_images ?? 1,
        durationMs,
        durationSeconds: durationMs / 1000,
      });

      logger.info(
        {
          imageSize: image.imageData.length,
          mimeType: image.mimeType,
          width: dimensions.width,
          height: dimensions.height,
          revisedPrompt: item.revised_prompt || null,
          durationMs,
        },
        'Seedream image generated successfully'
      );

      return {
        imageData: image.imageData,
        mimeType: image.mimeType,
        width: dimensions.width,
        height: dimensions.height,
        format,
        revisedPrompt: item.revised_prompt,
      };
    } catch (error: any) {
      const errorCode = error?.error?.code || error?.code;
      const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
      if (errorCode === 'ModelNotOpen') {
        logger.warn(
          {
            status: error?.status,
            code: errorCode,
            model: this.model,
          },
          'Seedream model is not activated for this Ark account'
        );
        throw new Error(
          `Seedream model "${this.model}" is not activated in BytePlus Ark Console. Activate the model service or set SEEDREAM_MODEL to an activated Seedream model.`
        );
      }

      if (error?.status === 401) {
        logger.warn(
          {
            status: error.status,
            code: errorCode,
            model: this.model,
          },
          'Seedream authentication failed'
        );
        throw new Error('Seedream authentication failed. Check SEEDREAM_API_KEY and SEEDREAM_BASE_URL.');
      }

      if (error?.status === 429) {
        logger.warn(
          {
            error: errorMessage,
            retryAfter: error.headers?.['retry-after'],
          },
          'Seedream rate limit hit'
        );
        throw new Error(`Seedream rate limit exceeded. ${errorMessage}`);
      }

      logger.error(
        {
          status: error?.status,
          code: errorCode,
          message: errorMessage,
        },
        'Failed to generate image with Seedream'
      );
      throw new Error(`Seedream image generation failed: ${errorMessage}`);
    }
  }

  private buildRequestBody(params: {
    prompt: string;
    referenceDataUrls: string[];
    size: string;
  }): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      prompt: params.prompt,
      size: params.size,
      response_format: this.responseFormat,
      watermark: this.watermark,
      stream: false,
    };

    if (params.referenceDataUrls.length === 1) {
      body.image = params.referenceDataUrls[0];
    } else if (params.referenceDataUrls.length > 1) {
      body.image = params.referenceDataUrls;
    }

    const outputFormat = this.effectiveOutputFormat();
    if (this.supportsOutputFormat()) {
      body.output_format = outputFormat;
    }

    if (this.optimizePromptMode) {
      body.optimize_prompt_options = { mode: this.optimizePromptMode };
    }

    return body;
  }

  private buildPrompt(
    prompt: string,
    systemInstruction?: string,
    referenceImages?: ReferenceImage[]
  ): string {
    const referenceGuide = (referenceImages || [])
      .map((ref, index) => {
        const label =
          ref.characterName ||
          ref.subjectDescription ||
          (ref.referenceKind ? `${ref.referenceKind} reference` : 'reference image');
        const instruction = ref.instructionText?.trim();
        return `Image ${index + 1}: ${label}${instruction ? `. ${instruction}` : ''}`;
      })
      .join('\n');

    return [
      systemInstruction?.trim(),
      referenceGuide ? `REFERENCE IMAGES\n${referenceGuide}` : '',
      prompt.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private async referenceToDataUrl(ref: ReferenceImage, index: number): Promise<string> {
    if (ref.fileUri) {
      throw new Error(
        `Seedream does not support provider fileUri references. Reference ${index} must be url or base64Data.`
      );
    }

    if (ref.base64Data) {
      return `data:${this.normalizeMimeType(ref.mimeType)};base64,${this.stripDataUrlPrefix(
        ref.base64Data
      )}`;
    }

    if (!ref.url) {
      throw new Error(`Seedream reference ${index} must have url or base64Data`);
    }

    if (ref.url.startsWith('data:image/')) {
      return ref.url;
    }

    if (/^https?:\/\//i.test(ref.url)) {
      const response = await fetch(ref.url);
      if (!response.ok) {
        throw new Error(`Failed to download Seedream reference ${index}: HTTP ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = this.normalizeMimeType(
        response.headers.get('content-type')?.split(';')[0] || ref.mimeType
      );
      return this.toDataUrl(buffer, mimeType);
    }

    const filePath = this.resolveLocalFilePath(ref.url);
    const buffer = await fs.readFile(filePath);
    return this.toDataUrl(buffer, this.mimeTypeFromPath(filePath, ref.mimeType));
  }

  private async downloadGeneratedImage(url: string): Promise<{ imageData: Buffer; mimeType: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download Seedream image: HTTP ${response.status}`);
    }
    const imageData = Buffer.from(await response.arrayBuffer());
    const mimeType = this.normalizeMimeType(
      response.headers.get('content-type')?.split(';')[0] ||
        this.mimeTypeForFormat(this.effectiveOutputFormat())
    );
    return { imageData, mimeType };
  }

  private resolveLocalFilePath(value: string): string {
    if (value.startsWith('file://')) {
      return fileURLToPath(value);
    }
    return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  }

  private toDataUrl(buffer: Buffer, mimeType: string): string {
    return `data:${this.normalizeMimeType(mimeType)};base64,${buffer.toString('base64')}`;
  }

  private stripDataUrlPrefix(value: string): string {
    const commaIndex = value.indexOf(',');
    return value.startsWith('data:image/') && commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
  }

  private normalizeMimeType(mimeType?: string | null): string {
    const normalized = (mimeType || 'image/png').toLowerCase();
    if (normalized.includes('png')) return 'image/png';
    if (normalized.includes('webp')) return 'image/webp';
    return 'image/jpeg';
  }

  private mimeTypeFromPath(filePath: string, fallback?: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return this.normalizeMimeType(fallback);
  }

  private mimeTypeForFormat(format: SeedreamOutputFormat): 'image/jpeg' | 'image/png' {
    return format === 'png' ? 'image/png' : 'image/jpeg';
  }

  private formatFromMimeType(mimeType: string): GeneratedImage['format'] {
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('webp')) return 'webp';
    return 'jpeg';
  }

  private mapSize(aspectRatio?: GenerateImageRequest['aspectRatio']): string {
    if (this.sizeOverride) return this.sizeOverride;

    const sizeMap: Record<NonNullable<GenerateImageRequest['aspectRatio']>, string> = {
      '1:1': '2048x2048',
      '16:9': '2560x1440',
      '9:16': '1440x2560',
      '4:3': '2304x1728',
      '3:4': '1728x2304',
    };

    return sizeMap[aspectRatio || '16:9'];
  }

  private dimensionsFromSize(
    size: string,
    aspectRatio?: GenerateImageRequest['aspectRatio']
  ): { width: number; height: number } {
    const exact = size.match(/^(\d+)x(\d+)$/);
    if (exact) {
      return {
        width: Number(exact[1]),
        height: Number(exact[2]),
      };
    }

    const fallback = this.mapSize(aspectRatio).match(/^(\d+)x(\d+)$/);
    if (fallback) {
      return {
        width: Number(fallback[1]),
        height: Number(fallback[2]),
      };
    }

    if (aspectRatio === '1:1') return { width: 2048, height: 2048 };
    if (aspectRatio === '9:16') return { width: 1440, height: 2560 };
    if (aspectRatio === '4:3') return { width: 2304, height: 1728 };
    if (aspectRatio === '3:4') return { width: 1728, height: 2304 };
    return { width: 2560, height: 1440 };
  }

  private supportsOutputFormat(): boolean {
    return this.model.includes('seedream-5-0');
  }

  private effectiveOutputFormat(): SeedreamOutputFormat {
    return this.supportsOutputFormat() ? this.outputFormat : 'jpeg';
  }

  private normalizeOutputFormat(value?: string): SeedreamOutputFormat {
    return value?.toLowerCase() === 'png' ? 'png' : 'jpeg';
  }

  private normalizeResponseFormat(value?: string): SeedreamResponseFormat {
    return value === 'url' ? 'url' : 'b64_json';
  }
}
