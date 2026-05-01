import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { optionalAuth } from '../middleware/authMiddleware';
import { createFeedback } from '../services/feedbackService';
import { logger } from '../utils/logger';
import rateLimit from 'express-rate-limit';

const router = Router();

export const REPORTED_SCREENS = [
  'dashboard',
  'wizard',
  'story_viewer',
  'library',
  'children',
  'characters',
  'plans',
  'profile',
  'published_story',
  'other',
] as const;

const feedbackSchema = z.object({
  category: z.enum(['bug', 'feature', 'other']),
  message: z.string().min(10).max(2000),
  email: z.string().email().optional().or(z.literal('')),
  screenshotUrl: z.string().max(500).optional(),
  reportedScreen: z.enum(REPORTED_SCREENS),
});

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0];
    return ip || 'unknown';
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) return typeof realIp === 'string' ? realIp : realIp[0];
  return req.ip || 'unknown';
}

// 5 submissions per hour per IP (or per userId when logged in)
const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    return userId ? `user:${userId}` : `ip:${getClientIp(req)}`;
  },
  message: {
    status: 'error',
    message: 'Too many feedback submissions. Please try again later.',
  },
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * POST /api/v1/feedback
 * Submit user feedback (bug report, feature request)
 * Auth: optional — anonymous can submit with email
 */
router.post('/', optionalAuth, feedbackLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { category, message, email, screenshotUrl, reportedScreen } = parsed.data;

    const userId = req.user?.id;
    if (!userId && !email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required when not logged in',
      });
    }

    const platform =
      (req.headers['x-platform'] as string) ||
      (req.body.platform as string) ||
      'web';
    const userAgent = req.headers['user-agent'] || undefined;
    const url = req.body.url as string | undefined;

    const result = await createFeedback({
      userId,
      category,
      message,
      email: email || undefined,
      screenshotUrl: screenshotUrl || undefined,
      context: {
        platform,
        userAgent,
        url,
        reportedScreen,
      },
    });

    res.status(201).json({
      status: 'success',
      feedback: { id: result.id },
    });
  } catch (error) {
    logger.error({ err: error }, 'Feedback submission failed');
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit feedback';
    res.status(500).json({
      status: 'error',
      message: errorMessage,
    });
  }
});

export default router;
