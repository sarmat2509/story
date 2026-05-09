import type { FeedbackTopic } from '@wondertales/shared';
import { isContentReportTopic } from '@wondertales/shared';
import type { Story } from '../db/schema';
import { getStoryRepository } from '../repositories';
import { incrementLandingRenderVersion, removePublishedSlug } from '../ssr/storyCache';
import { invalidateSitemapCache } from './sitemapService';
import { logger } from '../utils/logger';

export interface ReportedContentTarget {
  storyId?: string;
  storySlug?: string;
  shareToken?: string;
  sceneId?: number;
  contentType?: 'story' | 'scene' | 'image' | 'audio' | 'other';
}

export interface ReportedContentReviewInput extends ReportedContentTarget {
  feedbackId: string;
  reporterUserId?: string;
  supportTopic?: FeedbackTopic | string | null;
}

export interface ReportedContentReviewResult {
  reviewQueued: boolean;
  quarantinedStoryId?: string;
  reason: 'not_content_report' | 'missing_target' | 'target_not_found' | 'story_quarantined';
}

function mergePolicyChecks(
  current: unknown,
  input: ReportedContentReviewInput
): Record<string, unknown> {
  const existing =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};

  const previousReports = Array.isArray(existing.contentReports)
    ? existing.contentReports.slice(-9)
    : [];

  return {
    ...existing,
    reportedForReview: true,
    reportedContentQuarantined: true,
    lastReportId: input.feedbackId,
    lastReportTopic: input.supportTopic ?? null,
    lastReportedAt: new Date().toISOString(),
    contentReports: [
      ...previousReports,
      {
        reportId: input.feedbackId,
        topic: input.supportTopic ?? null,
        sceneId: input.sceneId ?? null,
        contentType: input.contentType ?? 'story',
        reportedAt: new Date().toISOString(),
      },
    ],
  };
}

async function resolveReportableStory(input: ReportedContentReviewInput): Promise<Story | null> {
  const repo = getStoryRepository();

  if (input.storySlug) {
    const story = await repo.findByPublishedSlug(input.storySlug);
    if (story) return story;
  }

  if (input.shareToken) {
    const story = await repo.findByShareToken(input.shareToken);
    if (story) return story;
  }

  if (input.storyId && input.reporterUserId) {
    return repo.findByIdAndUser(input.storyId, input.reporterUserId);
  }

  return null;
}

export async function queueReportedContentReview(
  input: ReportedContentReviewInput
): Promise<ReportedContentReviewResult> {
  if (!isContentReportTopic(input.supportTopic)) {
    return { reviewQueued: false, reason: 'not_content_report' };
  }

  if (!input.storyId && !input.storySlug && !input.shareToken) {
    return { reviewQueued: false, reason: 'missing_target' };
  }

  const story = await resolveReportableStory(input);
  if (!story) {
    logger.warn(
      {
        feedbackId: input.feedbackId,
        storyId: input.storyId,
        storySlug: input.storySlug,
        hasShareToken: !!input.shareToken,
        supportTopic: input.supportTopic,
      },
      'Reported content target could not be resolved'
    );
    return { reviewQueued: false, reason: 'target_not_found' };
  }

  const repo = getStoryRepository();
  const wasPublished = story.isPublished === true;
  const previousSlug = story.publishedSlug;
  const wasShownOnHomePage = story.showOnHomePage === true;

  await repo.updateStory(story.id, {
    isPublished: false,
    publishedAt: null,
    publishedSlug: null,
    visibility: null,
    shareToken: null,
    showOnHomePage: false,
    policyChecks: mergePolicyChecks(story.policyChecks, {
      ...input,
      storyId: story.id,
      contentType: input.contentType ?? 'story',
    }),
    updatedAt: new Date(),
  });
  await repo.incrementPublicRenderVersion(story.id);

  if (previousSlug) {
    await removePublishedSlug(previousSlug);
  }
  if (wasPublished && previousSlug) {
    await invalidateSitemapCache();
  }
  if (wasShownOnHomePage) {
    await incrementLandingRenderVersion();
  }

  logger.warn(
    {
      feedbackId: input.feedbackId,
      storyId: story.id,
      previousSlug,
      supportTopic: input.supportTopic,
      reporterUserId: input.reporterUserId,
    },
    'Reported story quarantined for content review'
  );

  return {
    reviewQueued: true,
    quarantinedStoryId: story.id,
    reason: 'story_quarantined',
  };
}
