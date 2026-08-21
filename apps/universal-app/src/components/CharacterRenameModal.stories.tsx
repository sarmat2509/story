import type { Meta, StoryObj } from '@storybook/react-native';
import { CharacterRenameModal } from './CharacterRenameModal';

const meta: Meta<typeof CharacterRenameModal> = {
  title: 'Popups/Character rename',
  component: CharacterRenameModal,
  args: {
    visible: true,
    presentation: 'inline',
    character: { id: 'storybook-character', name: 'Luna' },
    onClose: () => undefined,
  },
  argTypes: { onClose: { action: 'closed' } },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LongName: Story = {
  args: { character: { id: 'storybook-character', name: 'Professor Whiskers' } },
};
export const NoCharacter: Story = { args: { character: null } };
