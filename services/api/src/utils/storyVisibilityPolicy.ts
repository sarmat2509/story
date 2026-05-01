import { eq, isNotNull, or, sql } from 'drizzle-orm';
import * as schema from '../db/schema';

export interface StoryVisibilityPolicyRecord {
  isPublished?: boolean | null;
  visibility?: string | null;
  publishedSlug?: string | null;
  shareToken?: string | null;
  hidden?: boolean | null;
  parentReviewStatus?: string | null;
  policyChecks?: unknown;
}

export function getStoryPolicyFlag(policyChecks: unknown, key: string): boolean {
  if (!policyChecks || typeof policyChecks !== 'object') {
    return false;
  }
  return (policyChecks as Record<string, unknown>)[key] === true;
}

export function hasStoryTextModerationPassed(story: StoryVisibilityPolicyRecord): boolean {
  return getStoryPolicyFlag(story.policyChecks, 'textValidated');
}

export function hasPublicParentReviewStatus(story: StoryVisibilityPolicyRecord): boolean {
  return story.parentReviewStatus === 'not_required' || story.parentReviewStatus === 'approved';
}

export function isPublicCatalogStoryRecord(story: StoryVisibilityPolicyRecord): boolean {
  return (
    story.hidden !== true &&
    story.isPublished === true &&
    story.visibility === 'public' &&
    !!story.publishedSlug &&
    hasStoryTextModerationPassed(story) &&
    hasPublicParentReviewStatus(story)
  );
}

export function isUnlistedShareStoryRecord(
  story: StoryVisibilityPolicyRecord,
  shareToken?: string | null
): boolean {
  return (
    story.hidden !== true &&
    story.isPublished === true &&
    story.visibility === 'unlisted' &&
    !!story.shareToken &&
    shareToken === story.shareToken &&
    hasStoryTextModerationPassed(story) &&
    hasPublicParentReviewStatus(story)
  );
}

export function parentReviewPublicSqlCondition() {
  return or(
    eq(schema.stories.parentReviewStatus, 'not_required'),
    eq(schema.stories.parentReviewStatus, 'approved')
  )!;
}

export function textModerationPassedSqlCondition() {
  return sql<boolean>`(${schema.stories.policyChecks}->>'textValidated') = 'true'`;
}

export function publicCatalogStorySqlConditions() {
  return [
    eq(schema.stories.isPublished, true),
    isNotNull(schema.stories.publishedSlug),
    eq(schema.stories.visibility, 'public'),
    eq(schema.stories.hidden, false),
    parentReviewPublicSqlCondition(),
    textModerationPassedSqlCondition(),
  ];
}

export function unlistedShareStorySqlConditions() {
  return [
    eq(schema.stories.isPublished, true),
    isNotNull(schema.stories.shareToken),
    eq(schema.stories.visibility, 'unlisted'),
    eq(schema.stories.hidden, false),
    parentReviewPublicSqlCondition(),
    textModerationPassedSqlCondition(),
  ];
}

export function shareablePublishedStorySqlConditions() {
  return [
    eq(schema.stories.isPublished, true),
    eq(schema.stories.hidden, false),
    parentReviewPublicSqlCondition(),
    textModerationPassedSqlCondition(),
    or(
      sql<boolean>`(${schema.stories.visibility} = 'public' AND ${schema.stories.publishedSlug} IS NOT NULL)`,
      sql<boolean>`(${schema.stories.visibility} = 'unlisted' AND ${schema.stories.shareToken} IS NOT NULL)`
    )!,
  ];
}
