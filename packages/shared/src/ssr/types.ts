/**
 * StoryPublicView - Contract for API/SSR published story
 */
import type { AlignmentData, StoryAudioMetadata } from '../types';

export type PublicStoryFormat = 'story' | 'graphic_novel' | 'mixed_story';

export interface PublicStoryScene {
  sceneId: number;
  text: string;
  imageUrl?: string | null;
  mixedStoryBlockKind?: 'prose' | 'comic';
  mixedStoryScreenOrder?: number;
  graphicNovelPageNumber?: number;
}

export interface PublicGraphicNovelTextOverlayItem {
  id: string;
  segmentId: string;
  pageNumber: number;
  panelIndex: number;
  bubbleIndex: number;
  readingOrder: number;
  kind: 'speech' | 'thought' | 'caption';
  speaker?: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  cssPercent?: { left: string; top: string; width: string; height: string };
  tailTo?: { x: number; y: number };
  ariaLabel?: string;
}

export interface PublicGraphicNovelTextOverlay {
  mode: 'html_overlay';
  coordinateSpace: 'normalized_0_1';
  pageNumber: number;
  pageSize: { width: number; height: number };
  textStyle?: {
    fontSizePx: number;
    lineHeightPx: number;
    paddingXPx: number;
    paddingYPx: number;
    targetPageWidthPx: number;
    targetPageHeightPx: number;
  };
  items: PublicGraphicNovelTextOverlayItem[];
}

export interface PublicGraphicNovelPage {
  pageNumber: number;
  pageRole: string;
  status: string;
  imageUrl: string | null;
  textOverlay: PublicGraphicNovelTextOverlay | null;
}

export interface PublicMixedStoryReadingOrderItem {
  screenOrder: number;
  kind: 'prose' | 'comic';
  sceneId?: number;
  pageNumber?: number;
  sourceSceneIds: number[];
  textSegmentIds: string[];
}

export interface StoryPublicView {
  id: string;
  title: string;
  fullText: string;
  storyFormat: PublicStoryFormat;
  /** Story content language, separate from the surrounding UI locale. */
  language?: string;
  /** Human-readable target age range persisted with the story. */
  ageGroup?: string;
  /** Short SEO description (1-2 sentences, max 160 chars). Used for og:description, meta name="description". */
  seoDescription?: string;
  scenes: PublicStoryScene[];
  comicPages?: PublicGraphicNovelPage[];
  mixedStoryReadingOrder?: PublicMixedStoryReadingOrderItem[];
  author?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    aboutMe?: string | null;
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

export interface PublicStoryListItem {
  id: string;
  title: string;
  language: string;
  ageGroup: string;
  storyFormat: PublicStoryFormat;
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl?: string | null;
  coverAssetId: string | null;
  coverImageUrl: string | null;
  coverThumbnailUrl: string | null;
  publishedAt: string | null;
  publishedSlug: string;
  scenes: PublicStoryScene[];
  audioMetadata?: StoryAudioMetadata | null;
  hasAudio: boolean;
  scenarioCardId: string | null;
  shareUrl: string;
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
