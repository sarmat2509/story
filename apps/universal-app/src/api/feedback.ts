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
  storyId?: string;
  storySlug?: string;
  shareToken?: string;
  sceneId?: number;
  contentType?: 'story' | 'scene' | 'image' | 'audio' | 'other';
}

interface SubmitFeedbackResponse {
  status: string;
  feedback: {
    id: string;
    contentReview?: {
      reviewQueued: boolean;
      quarantinedStoryId?: string;
      reason: string;
    };
  };
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

      const response = await apiClient.post<SubmitFeedbackResponse>(
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
