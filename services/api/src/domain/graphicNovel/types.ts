import type { StoryEnvironment, StoryOutfitRow } from '../../ai/types';
import type { SceneVisual } from '../../services/types';

export type GraphicNovelAgeGroup = '0-1' | '1y' | '2-3' | '4-5' | '6-8' | '9-12';

export type GraphicNovelPageRole =
  | 'opening'
  | 'setup'
  | 'conversation'
  | 'action'
  | 'reveal'
  | 'reflection'
  | 'resolution';

export type GraphicNovelBeatType =
  | 'setup'
  | 'change'
  | 'reaction'
  | 'response'
  | 'conversation'
  | 'action'
  | 'reveal'
  | 'resolution';

export interface GraphicNovelLine {
  characterRef?: string;
  speaker: string;
  text: string;
  emotion?: string;
}

export interface GraphicNovelPanelVisual {
  environmentId: string;
  primaryRead: string;
  sceneVisual: SceneVisual;
}

export interface GraphicNovelPanelScript {
  panelId: string;
  dialogue: GraphicNovelLine[];
  thoughts: GraphicNovelLine[];
  caption?: string;
  visual: GraphicNovelPanelVisual;

  /** Deprecated compatibility fields; new LLM output must not depend on these. */
  beatType?: GraphicNovelBeatType;
  visualAction?: string;
  setting?: string;
  charactersPresent?: string[];
  emotion?: string;
  artPrompt?: string;
  panelVisual?: unknown;
}

export interface GraphicNovelPageScript {
  pageNumber: number;
  pageRole: GraphicNovelPageRole;
  panels: GraphicNovelPanelScript[];
}

export interface GraphicNovelScript {
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
  pages: GraphicNovelPageScript[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphicNovelPanelTemplate {
  id: string;
  rect: Rect;
}

export interface GraphicNovelPageTemplate {
  id: string;
  aspectRatio: '3:4' | '2:1';
  pageSize?: { width: number; height: number };
  templateFamily?: 'graphic_novel_page' | 'mixed_story_strip';
  panelCount: number;
  panels: GraphicNovelPanelTemplate[];
  readingOrder: string[];
  allowedAgeGroups: GraphicNovelAgeGroup[];
  bestUseCases: GraphicNovelPageRole[];
}

export interface BubbleGeometry {
  id: string;
  kind: 'speech' | 'thought' | 'caption';
  speaker?: string;
  text: string;
  rect: Rect;
  tailTo?: { x: number; y: number };
  overflow: boolean;
}

export interface GraphicNovelTextOverlayCssPercent {
  left: string;
  top: string;
  width: string;
  height: string;
}

export interface GraphicNovelTextOverlayItem {
  id: string;
  htmlId: string;
  segmentId: string;
  pageNumber: number;
  panelId: string;
  panelIndex: number;
  bubbleIndex: number;
  readingOrder: number;
  kind: BubbleGeometry['kind'];
  speaker?: string;
  rawText: string;
  text: string;
  audioText: string;
  rect: Rect;
  cssPercent: GraphicNovelTextOverlayCssPercent;
  tailTo?: { x: number; y: number };
  ariaLabel: string;
}

export interface GraphicNovelBubbleTextSizing {
  fontSizePx: number;
  lineHeightPx: number;
  paddingXPx: number;
  paddingYPx: number;
  targetPageWidthPx: number;
  targetPageHeightPx: number;
}

export interface GraphicNovelPageTextOverlay {
  mode: 'html_overlay';
  coordinateSpace: 'normalized_0_1';
  pageNumber: number;
  pageSize: { width: number; height: number };
  textStyle?: GraphicNovelBubbleTextSizing;
  items: GraphicNovelTextOverlayItem[];
  rawPlainText: string;
  plainText: string;
}

export interface PlannedGraphicNovelPanel {
  script: GraphicNovelPanelScript;
  templatePanel: GraphicNovelPanelTemplate;
  bubbles: BubbleGeometry[];
}

export interface PlannedGraphicNovelPage {
  pageNumber: number;
  pageRole: GraphicNovelPageRole;
  template: GraphicNovelPageTemplate;
  pageSize?: { width: number; height: number };
  bubbleTextSizing?: GraphicNovelBubbleTextSizing;
  outfits?: StoryOutfitRow[];
  characterAliases?: Record<string, string[]>;
  panels: PlannedGraphicNovelPanel[];
}
