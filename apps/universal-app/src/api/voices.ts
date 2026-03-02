import { useQuery } from '@tanstack/react-query';
import { VoiceApi } from '@wondertales/shared';
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
      try {
        console.log('[useVoices] Fetching voices for language:', language);
        const url = `/api/v1/voices?language=${language}`;
        console.log('[useVoices] Request URL:', url);
        
        const response = await apiClient.get(url);
        
        console.log('[useVoices] Response status:', response.status);
        console.log('[useVoices] Response data:', JSON.stringify(response.data, null, 2));
        
        return response.data;
      } catch (error) {
        console.error('[useVoices] Error fetching voices:', error);
        console.error('[useVoices] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          response: (error as any)?.response?.data,
          status: (error as any)?.response?.status,
        });
        throw error;
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
};
