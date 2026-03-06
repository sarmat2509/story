/**
 * Legacy redirect screen for backwards compatibility.
 * LibraryRedirect: /library → /me/stories
 * StoryRedirect: /story/:storyId → Story (author view)
 */

import { useEffect } from 'react';
import { useRoute } from '@react-navigation/native';
import { navigationRef, navigateToStory } from '@/navigation/navigationRef';

type StoryRedirectParams = { storyId: string };

export default function LegacyRedirectScreen() {
  const route = useRoute();
  const routeName = route.name;
  const params = route.params as StoryRedirectParams | undefined;

  useEffect(() => {
    if (routeName === 'LibraryRedirect') {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Main', { screen: 'Library' });
      }
    } else if (routeName === 'StoryRedirect' && params?.storyId) {
      navigateToStory(params.storyId, { autoPlay: false });
    }
  }, [routeName, params?.storyId]);

  return null;
}
