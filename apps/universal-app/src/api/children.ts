import { useQuery } from '@tanstack/react-query';
import apiClient from './client';

interface ChildProfile {
  id: string;
  name: string;
  birthDate: string;
  gender?: string;
  languages: string[];
}

// List child profiles
export const useChildren = () => {
  return useQuery({
    queryKey: ['children'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; children: ChildProfile[] }>(
        '/api/v1/children'
      );
      return response.data.children;
    },
  });
};
