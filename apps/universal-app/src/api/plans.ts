import { useQuery } from '@tanstack/react-query';
import apiClient from './client';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  billingPeriod: 'month' | 'year';
  features: Record<string, any>;
  active: boolean;
}

// List subscription plans (public endpoint)
export const usePlans = () => {
  return useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const response = await apiClient.get<{ status: string; plans: Plan[] }>(
        '/api/v1/plans'
      );
      return response.data.plans;
    },
  });
};
