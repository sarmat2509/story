export type CostBreakdownCategoryId =
  | 'text_creation'
  | 'image_generate'
  | 'image_edit'
  | 'validation'
  | 'reference_assets'
  | 'audio'
  | 'other';

export type CostBreakdownCategory = {
  id: CostBreakdownCategoryId;
  label: string;
};

export const COST_BREAKDOWN_CATEGORIES: CostBreakdownCategory[] = [
  {
    id: 'text_creation',
    label: 'Text creation',
  },
  {
    id: 'image_generate',
    label: 'Image generate',
  },
  {
    id: 'image_edit',
    label: 'Image edit',
  },
  {
    id: 'validation',
    label: 'Validation',
  },
  {
    id: 'reference_assets',
    label: 'Reference assets',
  },
  {
    id: 'audio',
    label: 'Audio',
  },
  {
    id: 'other',
    label: 'Other',
  },
];

export const ALL_COST_CATEGORY_IDS = COST_BREAKDOWN_CATEGORIES.map((category) => category.id);
export const COST_CATEGORY_BY_ID = new Map(
  COST_BREAKDOWN_CATEGORIES.map((category) => [category.id, category])
);

export function classifyCostOperation(operation: string): CostBreakdownCategoryId {
  const normalized = operation.trim().toLowerCase();

  if (
    normalized === 'audio_synthesize' ||
    normalized.includes('audio') ||
    normalized.includes('tts') ||
    normalized.includes('prosody')
  ) {
    return 'audio';
  }

  if (
    normalized === 'image_environment' ||
    normalized === 'environment_image' ||
    normalized === 'image_environment_reference' ||
    normalized === 'image_character_reference' ||
    normalized === 'image_outfit_plate' ||
    normalized === 'outfit_plate_image' ||
    normalized === 'image_character_outfit_turnaround' ||
    normalized === 'character_outfit_turnaround_image' ||
    normalized === 'character_turnaround' ||
    normalized === 'image_map_tile' ||
    normalized.includes('turnaround')
  ) {
    return 'reference_assets';
  }

  if (
    normalized === 'image_edit' ||
    normalized.endsWith('_edit') ||
    normalized.includes('_edit_') ||
    normalized.includes('repair_edit')
  ) {
    return 'image_edit';
  }

  if (normalized === 'graphic_novel_panel_crop_validation_regenerate') {
    return 'image_generate';
  }

  if (
    normalized.includes('validation') ||
    normalized.startsWith('validate') ||
    normalized.startsWith('director_compare') ||
    normalized === 'face_dedup'
  ) {
    return 'validation';
  }

  if (
    normalized === 'image_generate' ||
    normalized === 'image_batch' ||
    normalized.startsWith('scene_image') ||
    normalized.startsWith('comic_page') ||
    normalized.startsWith('graphic_novel_page') ||
    normalized === 'graphic_novel_panel_art_generate' ||
    normalized.startsWith('graphic_novel_template_panel_')
  ) {
    return 'image_generate';
  }

  if (
    normalized.includes('text') ||
    normalized.includes('script') ||
    normalized.includes('layout') ||
    normalized === 'director' ||
    normalized.startsWith('director_') ||
    normalized === 'map_tile_brief' ||
    normalized === 'regeneratescene' ||
    normalized === 'character_analysis' ||
    normalized === 'translation'
  ) {
    return 'text_creation';
  }

  return 'other';
}
