import type { IFileManager, UploadedFile } from '../../providers/base/IFileManager';
import type {
  BatchJob,
  BatchResult,
  BatchStatus,
  EditImageRequest,
  GeneratedImage,
  GenerateImageRequest,
  IImageProvider,
  ImageBatchRequest,
} from '../../providers/base/IImageProvider';

export type MockImageStep =
  | { kind: 'generate'; operation: string; response: GeneratedImage | Promise<GeneratedImage> }
  | { kind: 'edit'; operation: string; response: GeneratedImage | Promise<GeneratedImage> }
  | { kind: 'batch-create'; response: BatchJob }
  | { kind: 'batch-status'; response: BatchStatus }
  | { kind: 'batch-results'; response: BatchResult[] }
  | {
      kind: 'error';
      endpoint: 'generate' | 'edit' | 'batch-create' | 'batch-status' | 'batch-results';
      operation?: string;
      error: Error;
    };

export type MockImageRequest =
  | { kind: 'generate'; request: GenerateImageRequest }
  | { kind: 'edit'; request: EditImageRequest }
  | { kind: 'batch-create'; request: ImageBatchRequest[] }
  | { kind: 'batch-status'; batchId: string }
  | { kind: 'batch-results'; batchId: string };

function cloneImage(image: GeneratedImage): GeneratedImage {
  return {
    ...structuredClone({ ...image, imageData: undefined }),
    imageData: Buffer.from(image.imageData),
  } as GeneratedImage;
}

class MockFileManager implements IFileManager {
  readonly uploads: Array<{
    buffer: Buffer;
    mimeType: string;
    displayName?: string;
    cacheKey?: string;
  }> = [];
  readonly deletions: string[] = [];

  async upload(
    buffer: Buffer,
    mimeType: string,
    displayName?: string,
    cacheKey?: string
  ): Promise<UploadedFile> {
    this.uploads.push({ buffer: Buffer.from(buffer), mimeType, displayName, cacheKey });
    const id = this.uploads.length;
    return {
      uri: `mock://files/${id}`,
      name: `files/mock-${id}`,
      mimeType,
      displayName,
    };
  }

  async delete(fileName: string): Promise<void> {
    this.deletions.push(fileName);
  }
}

/** Strict, data-only image-provider mock with request capture. */
export class MockImageProvider implements IImageProvider {
  readonly requests: MockImageRequest[] = [];
  readonly fileManager = new MockFileManager();
  private readonly steps: MockImageStep[];

  constructor(steps: MockImageStep[] = []) {
    this.steps = [...steps];
  }

  queueGenerate(operation: string, response: GeneratedImage | Promise<GeneratedImage>): this {
    this.steps.push({ kind: 'generate', operation, response });
    return this;
  }

  queueEdit(operation: string, response: GeneratedImage | Promise<GeneratedImage>): this {
    this.steps.push({ kind: 'edit', operation, response });
    return this;
  }

  queueBatchCreate(response: BatchJob): this {
    this.steps.push({ kind: 'batch-create', response });
    return this;
  }

  queueBatchStatus(response: BatchStatus): this {
    this.steps.push({ kind: 'batch-status', response });
    return this;
  }

  queueBatchResults(response: BatchResult[]): this {
    this.steps.push({ kind: 'batch-results', response });
    return this;
  }

  queueError(
    endpoint: 'generate' | 'edit' | 'batch-create' | 'batch-status' | 'batch-results',
    error: Error | string,
    operation?: string
  ): this {
    this.steps.push({
      kind: 'error',
      endpoint,
      operation,
      error: typeof error === 'string' ? new Error(error) : error,
    });
    return this;
  }

  async generateImage(request: GenerateImageRequest): Promise<GeneratedImage> {
    this.requests.push({ kind: 'generate', request });
    const step = this.takeStep('generate', request.operation || 'image_generate');
    if (step.kind === 'error') throw step.error;
    if (step.kind !== 'generate') throw new Error(`Expected generate image mock, got ${step.kind}`);
    return cloneImage(await step.response);
  }

  async editImage(request: EditImageRequest): Promise<GeneratedImage> {
    this.requests.push({ kind: 'edit', request });
    const step = this.takeStep('edit', request.operation || 'image_edit');
    if (step.kind === 'error') throw step.error;
    if (step.kind !== 'edit') throw new Error(`Expected edit image mock, got ${step.kind}`);
    return cloneImage(await step.response);
  }

  async generateImages(
    request: GenerateImageRequest & { count: number }
  ): Promise<GeneratedImage[]> {
    const results: GeneratedImage[] = [];
    for (let index = 0; index < request.count; index += 1) {
      results.push(await this.generateImage(request));
    }
    return results;
  }

  getFileManager(): IFileManager {
    return this.fileManager;
  }

  async createImageBatch(requests: ImageBatchRequest[]): Promise<BatchJob> {
    this.requests.push({ kind: 'batch-create', request: requests });
    const step = this.takeStep('batch-create');
    if (step.kind === 'error') throw step.error;
    if (step.kind !== 'batch-create')
      throw new Error(`Expected batch-create mock, got ${step.kind}`);
    return structuredClone(step.response);
  }

  async getBatchStatus(batchId: string): Promise<BatchStatus> {
    this.requests.push({ kind: 'batch-status', batchId });
    const step = this.takeStep('batch-status');
    if (step.kind === 'error') throw step.error;
    if (step.kind !== 'batch-status')
      throw new Error(`Expected batch-status mock, got ${step.kind}`);
    return structuredClone(step.response);
  }

  async getBatchResults(batchId: string): Promise<BatchResult[]> {
    this.requests.push({ kind: 'batch-results', batchId });
    const step = this.takeStep('batch-results');
    if (step.kind === 'error') throw step.error;
    if (step.kind !== 'batch-results')
      throw new Error(`Expected batch-results mock, got ${step.kind}`);
    return step.response.map((result) => ({
      ...result,
      imageData: result.imageData ? Buffer.from(result.imageData) : undefined,
    }));
  }

  assertExhausted(): void {
    if (this.steps.length > 0) {
      throw new Error(
        `Unused image mock responses: ${this.steps.map((step) => step.kind).join(', ')}`
      );
    }
  }

  private takeStep(
    endpoint: 'generate' | 'edit' | 'batch-create' | 'batch-status' | 'batch-results',
    operation?: string
  ): MockImageStep {
    const step = this.steps.shift();
    if (!step) {
      throw new Error(
        `Unexpected ${endpoint} image AI call${operation ? ` for operation "${operation}"` : ''}`
      );
    }
    const stepEndpoint = step.kind === 'error' ? step.endpoint : step.kind;
    const stepOperation = 'operation' in step ? step.operation : undefined;
    if (
      stepEndpoint !== endpoint ||
      ((endpoint === 'generate' || endpoint === 'edit') && stepOperation !== operation)
    ) {
      throw new Error(
        `Image mock call mismatch: expected ${stepEndpoint}:${stepOperation || ''}, received ${endpoint}:${operation || ''}`
      );
    }
    return step;
  }
}
