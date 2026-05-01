import { USER_ROLE_ADMIN } from '../constants/userRoles';
import {
  isPublicCatalogStoryRecord,
  isUnlistedShareStoryRecord,
} from '../utils/storyVisibilityPolicy';

export interface AssetAccessStory {
  userId: string;
  isPublished: boolean | null;
  visibility: string | null;
  publishedSlug: string | null;
  shareToken: string | null;
  hidden: boolean | null;
  parentReviewStatus?: string | null;
  policyChecks?: unknown;
}

export interface AssetAccessSession {
  userId: string;
  role?: string | null;
}

export interface AssetAccessInput {
  story: AssetAccessStory;
  session?: AssetAccessSession | null;
  shareToken?: string | null;
  hasValidSignedUrl?: boolean;
}

export type AssetAccessDecision =
  | { allowed: true; cacheControl: 'public' | 'private'; reason: string }
  | { allowed: false; status: 401 | 403 | 404; reason: string };

export function isPublicCatalogStory(story: AssetAccessStory): boolean {
  return isPublicCatalogStoryRecord(story);
}

export function isValidUnlistedShare(story: AssetAccessStory, shareToken?: string | null): boolean {
  return isUnlistedShareStoryRecord(story, shareToken);
}

export function isAdminSession(session?: AssetAccessSession | null): boolean {
  return session?.role === USER_ROLE_ADMIN;
}

export function isOwnerOrAdmin(
  story: AssetAccessStory,
  session?: AssetAccessSession | null
): boolean {
  return !!session && (session.userId === story.userId || isAdminSession(session));
}

export function decideStoryAssetAccess(input: AssetAccessInput): AssetAccessDecision {
  const { story, session, shareToken, hasValidSignedUrl = false } = input;

  if (story.hidden === true && !isAdminSession(session)) {
    return { allowed: false, status: 404, reason: 'story_hidden' };
  }

  if (isPublicCatalogStory(story)) {
    return { allowed: true, cacheControl: 'public', reason: 'public_catalog_story' };
  }

  if (isValidUnlistedShare(story, shareToken)) {
    return { allowed: true, cacheControl: 'public', reason: 'unlisted_share_token' };
  }

  if (hasValidSignedUrl && story.hidden !== true) {
    return { allowed: true, cacheControl: 'public', reason: 'signed_asset_url' };
  }

  if (isOwnerOrAdmin(story, session)) {
    return { allowed: true, cacheControl: 'private', reason: 'owner_or_admin_session' };
  }

  if (!session) {
    return { allowed: false, status: 401, reason: 'authentication_required' };
  }

  return { allowed: false, status: 403, reason: 'access_denied' };
}
