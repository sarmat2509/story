import type { ITextProvider } from '../../providers/base/ITextProvider';
import type {
  GenerateStructuredRequest,
  GenerateTextRequest,
  StreamCallback,
} from '../../providers/base/JsonSchema';

export type MockTextStep =
  | {
      kind: 'text';
      operation: string;
      response: string;
    }
  | {
      kind: 'structured';
      operation: string;
      response: unknown;
    }
  | {
      kind: 'error';
      endpoint: 'text' | 'structured';
      operation: string;
      error: Error;
    };

export type MockTextRequest =
  | { kind: 'text'; request: GenerateTextRequest }
  | { kind: 'structured'; request: GenerateStructuredRequest<unknown> };

function cloneFixture<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Strict, data-only text-provider mock.
 *
 * Responses are consumed in call order. A missing, extra, or differently named
 * operation fails immediately so a test can never silently fall through to a
 * real provider or accidentally reuse a fixture for another LLM request.
 */
export class MockTextProvider implements ITextProvider {
  readonly requests: MockTextRequest[] = [];
  private readonly steps: MockTextStep[];

  get structuredRequests(): GenerateStructuredRequest<unknown>[] {
    return this.requests
      .filter(
        (entry): entry is Extract<MockTextRequest, { kind: 'structured' }> =>
          entry.kind === 'structured'
      )
      .map((entry) => entry.request);
  }

  get textRequests(): GenerateTextRequest[] {
    return this.requests
      .filter((entry): entry is Extract<MockTextRequest, { kind: 'text' }> => entry.kind === 'text')
      .map((entry) => entry.request);
  }

  constructor(steps: MockTextStep[] = []) {
    this.steps = [...steps];
  }

  queueText(operation: string, response: string): this {
    this.steps.push({ kind: 'text', operation, response });
    return this;
  }

  queueStructured<T>(operation: string, response: T): this {
    this.steps.push({ kind: 'structured', operation, response });
    return this;
  }

  queueError(endpoint: 'text' | 'structured', operation: string, error: Error | string): this {
    this.steps.push({
      kind: 'error',
      endpoint,
      operation,
      error: typeof error === 'string' ? new Error(error) : error,
    });
    return this;
  }

  async generateText(request: GenerateTextRequest): Promise<string> {
    this.requests.push({ kind: 'text', request });
    const step = this.takeStep('text', request.operation);
    if (step.kind === 'error') throw step.error;
    if (step.kind !== 'text') {
      throw new Error(`Mock text step mismatch: expected text, received ${step.kind}`);
    }
    return step.response;
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<T> {
    this.requests.push({
      kind: 'structured',
      request: request as GenerateStructuredRequest<unknown>,
    });
    const step = this.takeStep('structured', request.operation);
    if (step.kind === 'error') throw step.error;
    if (step.kind !== 'structured') {
      throw new Error(`Mock text step mismatch: expected structured, received ${step.kind}`);
    }
    return cloneFixture(step.response) as T;
  }

  async generateStream(request: GenerateTextRequest & StreamCallback): Promise<void> {
    const text = await this.generateText(request);
    request.onChunk(text);
    request.onComplete?.();
  }

  assertExhausted(): void {
    if (this.steps.length > 0) {
      const pending = this.steps.map((step) => `${step.kind}:${step.operation}`).join(', ');
      throw new Error(`Unused text mock responses: ${pending}`);
    }
  }

  private takeStep(endpoint: 'text' | 'structured', operation?: string): MockTextStep {
    const step = this.steps.shift();
    if (!step) {
      throw new Error(
        `Unexpected ${endpoint} AI call for operation "${operation || '(missing operation)'}"`
      );
    }

    const stepEndpoint = step.kind === 'error' ? step.endpoint : step.kind;
    if (stepEndpoint !== endpoint || step.operation !== operation) {
      throw new Error(
        `AI mock call mismatch: expected ${stepEndpoint}:${step.operation}, received ${endpoint}:${operation || '(missing operation)'}`
      );
    }
    return step;
  }
}
