import { Response } from 'express';

const COOKIE_NAME = 'wt_session';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Set HttpOnly session cookie containing the JWT.
 * Used so that <img> / <Image> requests automatically include auth
 * without needing signed URLs or custom headers.
 */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/v1/assets',
    maxAge: SEVEN_DAYS_MS,
  });
}

/**
 * Clear the session cookie (on logout).
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/v1/assets',
  });
}

export { COOKIE_NAME };
