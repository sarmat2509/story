import { useMutation } from '@tanstack/react-query';
import { Platform } from 'react-native';
import type { FeedbackCategory, FeedbackTopic } from '@wondertales/shared';
import apiClient from './client';
import { getCaptchaToken } from '@/utils/captcha';

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
  category: FeedbackCategory;
  supportTopic?: FeedbackTopic;
  message: string;
  email?: string;
  screenshotUrl?: string;
  reportedScreen: ReportedScreen;
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (input: SubmitFeedbackInput) => {
      const platform = Platform.OS === 'web' ? 'web' : Platform.OS;
      const captchaToken = await getCaptchaToken('feedback');
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
          captchaToken,
        }
      );
      return response.data.feedback;
    },
  });
}
