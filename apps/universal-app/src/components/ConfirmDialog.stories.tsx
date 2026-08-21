import type { Meta, StoryObj } from '@storybook/react-native';
import { ConfirmDialog } from './ConfirmDialog';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  args: {
    visible: true,
    presentation: 'inline',
    title: 'Delete this story?',
    message: 'This story and its illustrations will be permanently removed.',
    confirmText: 'Delete',
    cancelText: 'Keep story',
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
  argTypes: {
    onConfirm: { action: 'confirmed' },
    onCancel: { action: 'cancelled' },
    variant: { control: 'select', options: ['danger', 'warning', 'info'] },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;
export const Danger: Story = {};
export const Warning: Story = {
  args: { variant: 'warning', title: 'Leave story creation?', confirmText: 'Leave' },
};
export const Info: Story = {
  args: { variant: 'info', title: 'Ready to publish?', confirmText: 'Publish' },
};
