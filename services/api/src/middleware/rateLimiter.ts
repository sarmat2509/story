import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * Extract real client IP from proxy headers.
 * When behind Nginx reverse proxy, the actual client IP is in X-Forwarded-For or X-Real-IP headers.
 * This prevents all requests from being treated as coming from the Nginx container IP.
 */
export const getClientIp = (req: Request): string => {
  // Check X-Forwarded-For header (set by Nginx)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can be comma-separated list, get first (original client)
    const ip = typeof forwarded === 'string' 
      ? forwarded.split(',')[0].trim()
      : forwarded[0];
    return ip;
  }
  
  // Fallback to X-Real-IP header
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return typeof realIp === 'string' ? realIp : realIp[0];
  }
  
  // Fallback to req.ip (Express with trust proxy)
  return req.ip || 'unknown';
};

const isDevelopment = (): boolean => process.env.NODE_ENV === 'development';

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isReadOnlyRequest = (req: Request): boolean => (
  req.method === 'GET' ||
  req.method === 'HEAD' ||
  req.method === 'OPTIONS'
);

export const hashRateLimitIdentity = (value: string): string => (
  crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)
);

export const getRateLimitLogContext = (req: Request, limiterName: string) => {
  const ownerUserId = req.parentUserId || req.user?.id;
  const clientIp = getClientIp(req);
  const rateLimitState = (req as Request & {
    rateLimit?: {
      limit?: number;
      used?: number;
      remaining?: number;
      resetTime?: Date;
    };
  }).rateLimit;

  return {
    abuseSignal: true,
    limiterName,
    method: req.method,
    routeBase: req.baseUrl || '/',
    keyScope: ownerUserId ? 'user' : 'ip',
    userId: ownerUserId,
    clientIpHash: hashRateLimitIdentity(clientIp),
    limit: rateLimitState?.limit,
    used: rateLimitState?.used,
    remaining: rateLimitState?.remaining,
    resetTime: rateLimitState?.resetTime?.toISOString(),
  };
};

export const createRateLimitHandler = (limiterName: string) => (
  req: Request,
  res: Response,
  _next: unknown,
  options: { statusCode?: number; message?: unknown }
) => {
  logger.warn(getRateLimitLogContext(req, limiterName), 'Rate limit exceeded');
  res.status(options.statusCode || 429).send(options.message);
};

// Global rate limiter for all endpoints
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for production (was 100) - allows ~66 req/min
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => getClientIp(req), // Use real client IP for rate limiting
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later',
  },
  handler: createRateLimitHandler('global'),
  // Skip rate limiting in development
  skip: isDevelopment,
});

// Stricter rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req), // Use real client IP for rate limiting
  message: {
    status: 'error',
    message: 'Too many authentication attempts from this IP, please try again later',
  },
  handler: createRateLimitHandler('auth'),
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Very strict rate limiter for OAuth callbacks
export const oauthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 OAuth attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req), // Use real client IP for rate limiting
  message: {
    status: 'error',
    message: 'Too many OAuth attempts from this IP, please try again in an hour',
  },
  handler: createRateLimitHandler('oauth'),
  skipSuccessfulRequests: false, // Count all requests
  skip: isDevelopment,
});

// Password reset emails can be abused even when the endpoint returns 200 for privacy.
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    status: 'error',
    message: 'Too many password reset requests from this IP, please try again later',
  },
  handler: createRateLimitHandler('password_reset'),
  skipSuccessfulRequests: false,
  skip: isDevelopment,
});

// Rate limiter for public story rating (POST /rating)
export const ratingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 rating submissions per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    status: 'error',
    message: 'Too many rating requests from this IP, please try again later',
  },
  handler: createRateLimitHandler('rating'),
  skip: isDevelopment,
});

// Broad write limiter for story mutations before route-specific authentication runs.
export const storyWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    status: 'error',
    message: 'Too many story write requests from this IP, please try again later',
  },
  handler: createRateLimitHandler('story_write'),
  skip: (req) => isDevelopment() || isReadOnlyRequest(req),
});

export const getExpensiveGenerationRateLimitKey = (req: Request): string => {
  const ownerUserId = req.parentUserId || req.user?.id;
  return ownerUserId ? `user:${ownerUserId}` : `ip:${getClientIp(req)}`;
};

// Provider-costly operations: story generation, continuations, image retries/regeneration, audio, and alignment.
export const expensiveGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parsePositiveInteger(process.env.EXPENSIVE_GENERATION_RATE_LIMIT_MAX, 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getExpensiveGenerationRateLimitKey,
  message: {
    status: 'error',
    code: 'EXPENSIVE_GENERATION_RATE_LIMITED',
    message: 'Too many generation requests. Please try again later.',
  },
  handler: createRateLimitHandler('expensive_generation'),
  skip: isDevelopment,
});

// Uploads are memory-buffered and can be abused independently of authenticated API reads.
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    status: 'error',
    message: 'Too many upload requests from this IP, please try again later',
  },
  handler: createRateLimitHandler('upload'),
  skip: isDevelopment,
});

// Billing actions can create external provider sessions and should be low-volume.
export const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: {
    status: 'error',
    message: 'Too many billing requests from this IP, please try again later',
  },
  handler: createRateLimitHandler('billing'),
  skip: isDevelopment,
});

// Rate limiter for API endpoints (after auth)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Higher limit for authenticated users
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req), // Use real client IP for rate limiting
  message: {
    status: 'error',
    message: 'API rate limit exceeded',
  },
  handler: createRateLimitHandler('api'),
  // Skip rate limiting in development
  skip: isDevelopment,
});
