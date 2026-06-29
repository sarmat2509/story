export type StoryGenerationKind = 'story' | 'graphic_novel' | 'mixed_story' | string | undefined;

export function isGraphicNovelStyleGenerationKind(
  generationKind: StoryGenerationKind
): generationKind is 'graphic_novel' | 'mixed_story' {
  return generationKind === 'graphic_novel' || generationKind === 'mixed_story';
}

export function imageJobTypeForGenerationKind(
  generationKind: StoryGenerationKind
): 'image_batch' | 'graphic_novel_pages' {
  return isGraphicNovelStyleGenerationKind(generationKind)
    ? 'graphic_novel_pages'
    : 'image_batch';
}
