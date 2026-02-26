import rateLimit from 'express-rate-limit';

// Global rate limiter for all endpoints
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for production (was 100) - allows ~66 req/min
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
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
  message: {
    status: 'error',
    message: 'Too many OAuth attempts from this IP, please try again in an hour',
  },
  skipSuccessfulRequests: false, // Count all requests
});

// Rate limiter for API endpoints (after auth)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Higher limit for authenticated users
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'API rate limit exceeded',
  },
  // Skip rate limiting in development
  skip: () => process.env.NODE_ENV === 'development',
});
