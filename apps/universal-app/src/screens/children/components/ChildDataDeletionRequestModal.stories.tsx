import type { Meta, StoryObj } from '@storybook/react-native';
import { ChildDataDeletionRequestModal } from './ChildDataDeletionRequestModal';

const meta: Meta<typeof ChildDataDeletionRequestModal> = {
  title: 'Popups/Child data deletion request',
  component: ChildDataDeletionRequestModal,
  args: { visible: true, child: { id: 'mia', name: 'Mia' }, onClose: () => undefined },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
