/**
 * StoryPublicView - Contract for API/SSR published story
 */
import type { AlignmentData } from '../types';

export interface StoryPublicView {
  id: string;
  title: string;
  fullText: string;
  /** Short SEO description (1-2 sentences, max 160 chars). Used for og:description, meta name="description". */
  seoDescription?: string;
  scenes: Array<{
    sceneId: number;
    text: string;
    imageUrl?: string | null;
  }>;
  author?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  authorDisplayName: string;
  publishedAt: string | null;
  audio?: {
    url?: string;
    alignment?: AlignmentData;
    duration?: number;
  };
  share: {
    url: string;
    ogImageUrl: string;
  };
  publicRenderVersion: number;
  /** Present when count > 0 */
  rating?: { avg: number; count: number };
}

export interface PublicAuthorView {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  aboutMe?: string | null;
}

export interface StoryMetaParams {
  title: string;
  description: string;
  ogImageUrl: string;
  url: string;
  locale?: string;
  robots?: 'index,follow' | 'noindex,nofollow';
}
