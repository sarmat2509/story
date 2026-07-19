import type { ImageEditRepairIssueKind } from '../prompts/image/ImageEditPrompt';

export const GRAPHIC_NOVEL_PANEL_REPAIR_ISSUE_KINDS = [
  'presence',
  'duplicate',
  'head',
  'face',
  'hair',
  'age',
  'body',
  'design',
  'silhouette',
  'colors',
  'outfit',
  'unexpected',
  'text',
  'generic',
] as const satisfies readonly ImageEditRepairIssueKind[];

export type GraphicNovelPanelRepairMode = 'edit' | 'regenerate';

export interface GraphicNovelPanelRepairIssue {
  kind: ImageEditRepairIssueKind;
  comment: string;
  characterId?: string;
  characterName?: string;
}

export interface GraphicNovelPanelRepairTarget {
  panelNumber: number;
  panelId?: string;
  mode: GraphicNovelPanelRepairMode;
  issues: GraphicNovelPanelRepairIssue[];
}

export interface GraphicNovelPanelRepairRequest {
  storyId: string;
  pageNumber: number;
  panels: GraphicNovelPanelRepairTarget[];
  refreshTurnaroundCharacterIds?: string[];
  style?: string;
}
