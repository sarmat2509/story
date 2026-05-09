import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_TOPICS,
  getFeedbackCategoryForTopic,
  isContentReportTopic,
} from '@wondertales/shared';
import { optionalAuth } from '../middleware/authMiddleware';
import { createFeedback } from '../services/feedbackService';
import { logger } from '../utils/logger';
import { createRateLimitHandler } from '../middleware/rateLimiter';
import rateLimit from 'express-rate-limit';
import { CaptchaVerificationError, requireCaptcha } from '../services/captchaService';
import { queueReportedContentReview } from '../services/reportedContentReviewService';

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
  category: z.enum(FEEDBACK_CATEGORIES).optional(),
  supportTopic: z.enum(FEEDBACK_TOPICS).optional(),
  message: z.string().min(10).max(2000),
  email: z.string().email().optional().or(z.literal('')),
  screenshotUrl: z.string().max(500).optional(),
  reportedScreen: z.enum(REPORTED_SCREENS),
  captchaToken: z.string().max(4096).optional(),
  url: z.string().max(2000).optional(),
  platform: z.string().max(60).optional(),
  storyId: z.string().uuid().optional(),
  storySlug: z.string().min(1).max(160).optional(),
  shareToken: z.string().min(8).max(128).optional(),
  sceneId: z.number().int().min(0).max(1000).optional(),
  contentType: z.enum(['story', 'scene', 'image', 'audio', 'other']).optional(),
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

export function rejectChildFeedbackSubmission(req: Request, res: Response): boolean {
  if (req.sessionMode !== 'child') {
    return false;
  }

  res.status(403).json({
    status: 'error',
    message: 'Parent session required',
    code: 'PARENT_SESSION_REQUIRED',
  });
  return true;
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
  handler: createRateLimitHandler('feedback'),
  skip: () => process.env.NODE_ENV === 'development',
});

/**
 * POST /api/v1/feedback
 * Submit user feedback (bug report, feature request)
 * Auth: optional — anonymous can submit with email
 */
router.post('/', optionalAuth, feedbackLimiter, async (req: Request, res: Response) => {
  try {
    if (rejectChildFeedbackSubmission(req, res)) {
      return;
    }

    const parsed = feedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const {
      message,
      email,
      screenshotUrl,
      reportedScreen,
      storyId,
      storySlug,
      shareToken,
      sceneId,
      contentType,
    } = parsed.data;
    const supportTopic = parsed.data.supportTopic ?? parsed.data.category ?? 'other';
    const category = parsed.data.supportTopic
      ? getFeedbackCategoryForTopic(parsed.data.supportTopic)
      : (parsed.data.category ?? 'other');
    const isContentReport = isContentReportTopic(supportTopic);

    const userId = req.user?.id;
    if (!userId && !email && !isContentReport) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required when not logged in',
      });
    }

    await requireCaptcha('feedback', parsed.data.captchaToken, req);

    const platform = (req.headers['x-platform'] as string) || parsed.data.platform || 'web';
    const userAgent = req.headers['user-agent'] || undefined;
    const url = parsed.data.url;

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
        supportTopic,
        ...(storyId && { storyId }),
        ...(storySlug && { storySlug }),
        ...(shareToken && { shareToken }),
        ...(sceneId != null && { sceneId }),
        contentType: contentType ?? (isContentReport ? 'story' : undefined),
        ...(isContentReport && { contentReviewStatus: 'queued' }),
      },
    });

    const contentReview = await queueReportedContentReview({
      feedbackId: result.id,
      reporterUserId: userId,
      supportTopic,
      storyId,
      storySlug,
      shareToken,
      sceneId,
      contentType: contentType ?? 'story',
    });

    res.status(201).json({
      status: 'success',
      feedback: {
        id: result.id,
        contentReview,
      },
    });
  } catch (error) {
    if (error instanceof CaptchaVerificationError) {
      return res.status(error.statusCode).json({
        status: 'error',
        message: error.message,
        code: error.code,
      });
    }
    logger.error({ err: error }, 'Feedback submission failed');
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit feedback';
    res.status(500).json({
      status: 'error',
      message: errorMessage,
    });
  }
});

export default router;
