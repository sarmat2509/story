import type { Meta, StoryObj } from '@storybook/react-native';
import { ChildCard } from './ChildCard';

const meta: Meta<typeof ChildCard> = {
  title: 'Cards/Child card',
  component: ChildCard,
  args: {
    child: { id: 'mia', name: 'Mia', birthDate: '2019-05-12' },
    onPress: () => undefined,
    showChildModeStatus: false,
    showChildModeStartAction: false,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Profile: Story = {};
export const WithActions: Story = {
  args: {
    onDelete: () => undefined,
    onRequestDataDeletion: () => undefined,
    dataDeletionRequestLabel: 'Request data deletion',
  },
};
