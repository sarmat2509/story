import type { Meta, StoryObj } from '@storybook/react-native';
import { GenerationErrorModal } from './GenerationErrorModal';

const meta: Meta<typeof GenerationErrorModal> = {
  title: 'Popups/Generation error',
  component: GenerationErrorModal,
  args: { visible: true, presentation: 'inline', onClose: () => undefined },
  argTypes: { onClose: { action: 'closed' } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const DetailedMessage: Story = {
  args: { message: 'The illustration service is taking longer than expected. Please try again.' },
};
