/** Strict, data-only mock for the external embedding boundary. */
export class MockEmbeddingGenerator {
  readonly requests: string[] = [];

  constructor(private readonly responses: Array<number[] | Error> = []) {}

  queueEmbedding(response: number[]): this {
    this.responses.push([...response]);
    return this;
  }

  queueError(error: Error | string): this {
    this.responses.push(typeof error === 'string' ? new Error(error) : error);
    return this;
  }

  readonly generate = async (text: string): Promise<number[]> => {
    this.requests.push(text);
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected embedding AI call');
    if (response instanceof Error) throw response;
    return [...response];
  };

  assertExhausted(): void {
    if (this.responses.length > 0) {
      throw new Error(`Unused embedding mock responses: ${this.responses.length}`);
    }
  }
}
