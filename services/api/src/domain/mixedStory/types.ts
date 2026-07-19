import type { StoryEnvironment, StoryOutfitRow } from '../../ai/types';
import type { GraphicNovelPanelScript } from '../graphicNovel';

export interface MixedStoryComicBlock {
  kind: 'comic';
  screenOrder: number;
  sceneId: number;
  comicPageNumber: number;
  panels: GraphicNovelPanelScript[];
}

export interface MixedStoryProseBlock {
  kind: 'prose';
  screenOrder: number;
  sceneIds: number[];
  text: string;
}

export type MixedStoryReadingBlock = MixedStoryComicBlock | MixedStoryProseBlock;

export interface MixedStoryScript {
  title: string;
  description: string;
  language: string;
  characters?: Array<{
    characterRef: string;
    name: string;
    type: string;
    description: string;
    role?: string;
    personality?: string;
  }>;
  environments: StoryEnvironment[];
  outfits?: StoryOutfitRow[];
  readingBlocks: MixedStoryReadingBlock[];
}

export interface MixedStoryComicAgeConstraintViolation {
  path: string;
  message: string;
  repaired: boolean;
}

export interface MixedStoryScriptValidationIssue {
  path: string;
  message: string;
}
