import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

export type PrivacyRequestType = 'export' | 'deletion';
export type PrivacyRequestStatus = 'open' | 'in_review' | 'fulfilled' | 'rejected' | 'canceled';

export interface PrivacyRequestItem {
  id: string;
  userId: string | null;
  requesterEmail: string | null;
  requestType: PrivacyRequestType | string;
  status: PrivacyRequestStatus | string;
  message: string | null;
  adminNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePrivacyRequestInput {
  requestType: PrivacyRequestType;
  message?: string | null;
}

export function usePrivacyRequests() {
  return useQuery({
    queryKey: ['privacy-requests'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; data: PrivacyRequestItem[] }>(
        '/api/v1/me/privacy-requests'
      );
      return response.data.data;
    },
  });
}

export function useCreatePrivacyRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePrivacyRequestInput) => {
      const response = await apiClient.post<{ status: string; data: PrivacyRequestItem }>(
        '/api/v1/me/privacy-requests',
        input
      );
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'privacy-requests'] });
    },
  });
}
