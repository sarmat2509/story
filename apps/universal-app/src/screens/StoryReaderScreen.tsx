/**
 * Unified Story Reader Screen
 * Handles both public (stories/:slug) and auth (me/stories/:storyId) routes.
 * Public: read-only view with audio. Auth: full viewer with edit, generation, etc.
 */

import React from 'react';
import { useRoute } from '@react-navigation/native';
import PublishedStoryScreen from '@/screens/published/PublishedStoryScreen';
import StoryViewerScreen from '@/screens/story/StoryViewerScreen';
import NotFoundScreen from '@/screens/public/NotFoundScreen';
type StoryReaderParams =
  | { slug: string }
  | { token: string }
  | { storyId: string; autoPlay?: boolean };

export default function StoryReaderScreen() {
  const route = useRoute();
  const params = route.params as StoryReaderParams | undefined;

  if (params && ('slug' in params || 'token' in params)) {
    return <PublishedStoryScreen />;
  }
  if (params && 'storyId' in params) {
    return <StoryViewerScreen />;
  }
  return <NotFoundScreen />;
}
