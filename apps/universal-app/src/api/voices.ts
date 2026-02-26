import { useQuery } from '@tanstack/react-query';
import { VoiceApi } from '@kazka/shared';
import { apiClient } from './client';

// Use shared type
export type Voice = VoiceApi;

export interface VoicesResponse {
  status: 'success';
  data: Voice[];
  meta: {
    userPlan: string;
    hasPremiumAccess: boolean;
  };
}

export const useVoices = (language: string = 'uk') => {
  return useQuery<VoicesResponse>({
    queryKey: ['voices', language],
    queryFn: async () => {
      const response = await apiClient.get(`/api/v1/voices?language=${language}`);
      return response.data;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};
