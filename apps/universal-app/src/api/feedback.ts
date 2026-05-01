import { useMutation } from '@tanstack/react-query';
import { Platform } from 'react-native';
import apiClient from './client';

export type ReportedScreen =
  | 'dashboard'
  | 'wizard'
  | 'story_viewer'
  | 'library'
  | 'children'
  | 'characters'
  | 'plans'
  | 'profile'
  | 'published_story'
  | 'other';

export interface SubmitFeedbackInput {
  category: 'bug' | 'feature' | 'other';
  message: string;
  email?: string;
  screenshotUrl?: string;
  reportedScreen: ReportedScreen;
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (input: SubmitFeedbackInput) => {
      const platform = Platform.OS === 'web' ? 'web' : Platform.OS;
      const url =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.pathname
          : undefined;

      const response = await apiClient.post<{ status: string; feedback: { id: string } }>(
        '/api/v1/feedback',
        {
          ...input,
          platform,
          url,
        }
      );
      return response.data.feedback;
    },
  });
}
