import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@/types/navigation';
import type { LastMainRoute } from '@/store/mainNavigationStore';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Navigate to a Main navigator screen (Tab or Drawer).
 * Safe to call from outside React (e.g. after orientation switch).
 * No-op if container is not ready.
 */
export function navigateToMainRoute(route: LastMainRoute): void {
  if (route == null) return;
  if (!navigationRef.isReady()) return;
  (navigationRef as any).navigate('Main', {
    screen: route.name,
    params: route.params,
  });
}

/**
 * Reset the root navigator to a Main route.
 * This keeps auth transitions from getting stranded on a now-hidden public route.
 */
export function resetToMainRoute(route: Exclude<LastMainRoute, null>): boolean {
  if (!navigationRef.isReady()) return false;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          state: {
            routes: [{ name: route.name, params: route.params }],
            index: 0,
          },
        },
      ],
    })
  );
  return true;
}

/**
 * Navigate to Story screen from anywhere in the app.
 * Works regardless of current navigator context (Tab/Drawer/Outside).
 * @param storyId - Story ID to navigate to
 * @param params - Optional additional params (e.g., autoPlay, scrollToQuiz)
 */
export function navigateToStory(
  storyId: string,
  params?: { autoPlay?: boolean; scrollToQuiz?: boolean }
): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', {
    screen: 'Story',
    params: { storyId, ...params },
  });
}
