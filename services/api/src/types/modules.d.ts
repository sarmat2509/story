/**
 * Type declarations for optional dependencies.
 * These modules may be provided at runtime (e.g. in Docker) but not installed for tsc.
 */

declare module '@aws-sdk/client-s3' {
  export interface GetObjectCommandOutput {
    Body?: AsyncIterable<Uint8Array>;
  }
  export class S3Client {
    constructor(config?: unknown);
    send(command: unknown): Promise<GetObjectCommandOutput>;
  }
  export class PutObjectCommand {
    constructor(params: unknown);
  }
  export class GetObjectCommand {
    constructor(params: unknown);
  }
}

declare module 'ioredis' {
  export default class Redis {
    constructor(url: string, options?: Record<string, unknown>);
    connect(): Promise<void>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, expiryMode: 'EX', ttl: number): Promise<'OK'>;
    setex(key: string, ttl: number, value: string): Promise<'OK'>;
    ttl(key: string): Promise<number>;
    del(key: string): Promise<number>;
    sadd(key: string, ...members: string[]): Promise<number>;
    srem(key: string, ...members: string[]): Promise<number>;
    sismember(key: string, member: string): Promise<number>;
    disconnect(): void;
  }
}
