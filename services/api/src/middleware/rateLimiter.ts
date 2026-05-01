import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Extract real client IP from proxy headers.
 * When behind Nginx reverse proxy, the actual client IP is in X-Forwarded-For or X-Real-IP headers.
 * This prevents all requests from being treated as coming from the Nginx container IP.
 */
const getClientIp = (req: Request): string => {
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
  // Skip rate limiting in development
  skip: () => process.env.NODE_ENV === 'development',
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
  skipSuccessfulRequests: false, // Count all requests
  skip: () => process.env.NODE_ENV === 'development',
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
  skipSuccessfulRequests: false,
  skip: () => process.env.NODE_ENV === 'development',
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
  skip: () => process.env.NODE_ENV === 'development',
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
  // Skip rate limiting in development
  skip: () => process.env.NODE_ENV === 'development',
});
