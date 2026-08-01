import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

export type StoryScheduleRuleInput = {
  childProfileIds: string[];
  cadence: 'daily' | 'every_2_days' | 'twice_weekly' | 'weekly';
  runAtTime: string;
  timezone: string;
  formats: Array<'story' | 'comic' | 'mixed'>;
  themes: string[];
  morals: string[];
  languages: string[];
  imageStyles: string[];
  userNotes?: string | null;
};
export const useStorySchedule = (enabled = true) =>
  useQuery({
    queryKey: ['story-schedule'],
    queryFn: async () => (await apiClient.get('/api/v1/me/story-schedule')).data.rule,
    enabled,
  });
export const useSaveStorySchedule = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: StoryScheduleRuleInput) =>
      (await apiClient.put('/api/v1/me/story-schedule', input)).data.rule,
    onSuccess: () => client.invalidateQueries({ queryKey: ['story-schedule'] }),
  });
};
export const useDeleteStorySchedule = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await apiClient.delete('/api/v1/me/story-schedule');
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['story-schedule'] }),
  });
};
