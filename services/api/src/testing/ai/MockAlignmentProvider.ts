import type {
  AlignmentRequest,
  AlignmentResult,
  IAlignmentProvider,
} from '../../providers/base/IAlignmentProvider';

/** Strict forced-alignment mock with fixed queued output. */
export class MockAlignmentProvider implements IAlignmentProvider {
  readonly requests: AlignmentRequest[] = [];

  constructor(private readonly responses: Array<AlignmentResult | Error> = []) {}

  queueAlignment(response: AlignmentResult): this {
    this.responses.push(response);
    return this;
  }

  queueError(error: Error | string): this {
    this.responses.push(typeof error === 'string' ? new Error(error) : error);
    return this;
  }

  async generateAlignment(request: AlignmentRequest): Promise<AlignmentResult> {
    this.requests.push({ ...request, audioBuffer: Buffer.from(request.audioBuffer) });
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected forced-alignment AI call');
    if (response instanceof Error) throw response;
    return structuredClone(response);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  getProviderName(): string {
    return 'MockAlignment';
  }

  assertExhausted(): void {
    if (this.responses.length > 0) {
      throw new Error(`Unused alignment mock responses: ${this.responses.length}`);
    }
  }
}
