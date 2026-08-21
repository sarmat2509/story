import type { Meta, StoryObj } from '@storybook/react-native';
import { GenerationProgressModal } from './GenerationProgressModal';

const meta: Meta<typeof GenerationProgressModal> = {
  title: 'Popups/Generation progress',
  component: GenerationProgressModal,
  args: {
    visible: true,
    presentation: 'inline',
    requestId: 'storybook-request',
    status: 'processing',
    progress: 45,
    onClose: () => undefined,
  },
  argTypes: {
    onClose: { action: 'closed' },
    onRetry: { action: 'retried' },
    onReport: { action: 'reported' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = { args: { status: 'pending', progress: 0 } };
export const Processing: Story = {
  args: {
    progressData: {
      overallProgress: 45,
      completedTasks: ['analyzing_photos'],
      activeTasks: [{ task: 'generating_text', progress: 45, details: {} }],
      plannedTasks: [
        { task: 'analyzing_photos', estimatedMs: 5_000, rangeStart: 0, rangeEnd: 20 },
        { task: 'generating_text', estimatedMs: 20_000, rangeStart: 20, rangeEnd: 60 },
      ],
    },
  },
};
export const TakingLonger: Story = {
  args: {
    progress: 76,
    progressData: {
      overallProgress: 76,
      completedTasks: ['analyzing_photos', 'generating_text'],
      activeTasks: [
        { task: 'generating_images', progress: 76, details: { takingLongerThanExpected: true } },
      ],
      plannedTasks: [
        { task: 'generating_images', estimatedMs: 30_000, rangeStart: 60, rangeEnd: 90 },
      ],
    },
  },
};
export const Failed: Story = {
  args: { status: 'failed', progress: 0, onRetry: () => undefined, onReport: () => undefined },
};
export const Completed: Story = {
  args: { status: 'completed', progress: 100, allowManualClose: true },
};
