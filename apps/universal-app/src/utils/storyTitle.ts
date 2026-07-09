import type { TFunction } from 'i18next';

export const GENERATING_STORY_TITLE = 'Generating...';

export function getLocalizedStoryTitle(title: string | null | undefined, t: TFunction): string {
  if (title === GENERATING_STORY_TITLE) {
    return t('story.generating', { defaultValue: 'Creating story...' });
  }

  return title || t('story_viewer.untitled_story', { defaultValue: 'Story' });
}
