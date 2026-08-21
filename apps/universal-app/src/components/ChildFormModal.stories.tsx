import type { Meta, StoryObj } from '@storybook/react-native';
import { ChildFormModal } from './ChildFormModal';

const meta: Meta<typeof ChildFormModal> = {
  title: 'Popups/Child editor',
  component: ChildFormModal,
  args: {
    visible: true,
    childId: 'mia',
    onClose: () => undefined,
    initialData: { name: 'Mia', birthDate: new Date('2019-05-12'), languages: ['en'] },
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Edit: Story = {};
