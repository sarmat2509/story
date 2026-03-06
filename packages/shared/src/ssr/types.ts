/**
 * StoryPublicView - Contract for API/SSR published story
 */
import type { AlignmentData } from '../types';

export interface StoryPublicView {
  id: string;
  title: string;
  fullText: string;
  scenes: Array<{
    sceneId: number;
    text: string;
    imageUrl?: string | null;
  }>;
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
}

export interface StoryMetaParams {
  title: string;
  description: string;
  ogImageUrl: string;
  url: string;
  locale?: string;
  robots?: 'index,follow' | 'noindex,nofollow';
}
