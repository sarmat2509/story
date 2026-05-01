import crypto from 'crypto';
import config from '../config';

export type ParentGateOAuthProvider = 'google' | 'apple';

export interface ParentGateOAuthState {
  type: 'parent_gate';
  provider: ParentGateOAuthProvider;
  parentUserId: string;
  childSessionId: string;
  redirectUri?: string;
  issuedAt: number;
}

export type ParentGateOAuthStateErrorCode =
  | 'INVALID_PARENT_GATE_STATE'
  | 'EXPIRED_PARENT_GATE_STATE';

export class ParentGateOAuthStateError extends Error {
  constructor(public code: ParentGateOAuthStateErrorCode) {
    super(code);
    this.name = 'ParentGateOAuthStateError';
  }
}

const STATE_PREFIX = 'pg';
const MAX_STATE_AGE_MS = 10 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', config.jwt.secret)
    .update(payload)
    .digest('base64url');
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isParentGateOAuthState(state: unknown): state is string {
  return typeof state === 'string' && state.startsWith(`${STATE_PREFIX}.`);
}

export function createParentGateOAuthState(input: {
  provider: ParentGateOAuthProvider;
  parentUserId: string;
  childSessionId: string;
  redirectUri?: string;
  issuedAt?: number;
}): string {
  const state: ParentGateOAuthState = {
    type: 'parent_gate',
    provider: input.provider,
    parentUserId: input.parentUserId,
    childSessionId: input.childSessionId,
    ...(input.redirectUri ? { redirectUri: input.redirectUri } : {}),
    issuedAt: input.issuedAt ?? Date.now(),
  };
  const payload = encodeBase64Url(JSON.stringify(state));
  const signature = signPayload(payload);
  return `${STATE_PREFIX}.${payload}.${signature}`;
}

export function parseParentGateOAuthState(
  state: unknown,
  expectedProvider: ParentGateOAuthProvider,
  nowMs = Date.now()
): ParentGateOAuthState | null {
  if (!isParentGateOAuthState(state)) return null;

  const parts = state.split('.');
  if (parts.length !== 3 || parts[0] !== STATE_PREFIX) {
    throw new ParentGateOAuthStateError('INVALID_PARENT_GATE_STATE');
  }

  const [, payload, signature] = parts;
  const expectedSignature = signPayload(payload);
  if (!signaturesMatch(signature, expectedSignature)) {
    throw new ParentGateOAuthStateError('INVALID_PARENT_GATE_STATE');
  }

  let parsed: Partial<ParentGateOAuthState>;
  try {
    parsed = JSON.parse(decodeBase64Url(payload));
  } catch {
    throw new ParentGateOAuthStateError('INVALID_PARENT_GATE_STATE');
  }

  if (
    parsed.type !== 'parent_gate' ||
    parsed.provider !== expectedProvider ||
    typeof parsed.parentUserId !== 'string' ||
    parsed.parentUserId.length === 0 ||
    typeof parsed.childSessionId !== 'string' ||
    parsed.childSessionId.length === 0 ||
    typeof parsed.issuedAt !== 'number'
  ) {
    throw new ParentGateOAuthStateError('INVALID_PARENT_GATE_STATE');
  }

  if (parsed.issuedAt > nowMs + MAX_CLOCK_SKEW_MS || nowMs - parsed.issuedAt > MAX_STATE_AGE_MS) {
    throw new ParentGateOAuthStateError('EXPIRED_PARENT_GATE_STATE');
  }

  if (parsed.redirectUri !== undefined && typeof parsed.redirectUri !== 'string') {
    throw new ParentGateOAuthStateError('INVALID_PARENT_GATE_STATE');
  }

  return parsed as ParentGateOAuthState;
}
