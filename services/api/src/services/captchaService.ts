import type { Request } from 'express';
import config from '../config';
import { logger } from '../utils/logger';

export type CaptchaAction = 'login' | 'register' | 'password_reset' | 'feedback';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export class CaptchaVerificationError extends Error {
  constructor(
    public readonly code: 'CAPTCHA_REQUIRED' | 'CAPTCHA_FAILED' | 'CAPTCHA_UNAVAILABLE',
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'CaptchaVerificationError';
  }
}

export function isCaptchaRequired(action: CaptchaAction): boolean {
  return config.captcha.requiredActions.includes(action);
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0];
    return first || undefined;
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return typeof realIp === 'string' ? realIp : realIp[0];
  return req.ip || undefined;
}

export async function verifyTurnstileToken(input: {
  action: CaptchaAction;
  token: string;
  secretKey: string;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const body = new URLSearchParams();
  body.set('secret', input.secretKey);
  body.set('response', input.token);
  if (input.remoteIp) body.set('remoteip', input.remoteIp);

  const doFetch = input.fetchImpl ?? fetch;
  const response = await doFetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    logger.warn(
      { action: input.action, status: response.status },
      'Turnstile verification endpoint returned non-OK status'
    );
    return false;
  }

  const data = (await response.json()) as {
    success?: boolean;
    action?: string;
    'error-codes'?: string[];
  };
  if (!data.success) {
    logger.warn(
      { action: input.action, errorCodes: data['error-codes'] ?? [] },
      'Turnstile verification failed'
    );
    return false;
  }

  if (data.action && data.action !== input.action) {
    logger.warn(
      { expectedAction: input.action, actualAction: data.action },
      'Turnstile verification action mismatch'
    );
    return false;
  }

  return true;
}

export async function requireCaptcha(
  action: CaptchaAction,
  token: string | undefined,
  req: Request
): Promise<void> {
  if (!isCaptchaRequired(action)) return;

  if (!token) {
    throw new CaptchaVerificationError(
      'CAPTCHA_REQUIRED',
      400,
      'Human verification is required'
    );
  }

  if (!config.captcha.turnstileSecretKey) {
    throw new CaptchaVerificationError(
      'CAPTCHA_UNAVAILABLE',
      503,
      'Human verification is temporarily unavailable'
    );
  }

  const verified = await verifyTurnstileToken({
    action,
    token,
    secretKey: config.captcha.turnstileSecretKey,
    remoteIp: getClientIp(req),
  });

  if (!verified) {
    throw new CaptchaVerificationError(
      'CAPTCHA_FAILED',
      400,
      'Human verification failed'
    );
  }
}
