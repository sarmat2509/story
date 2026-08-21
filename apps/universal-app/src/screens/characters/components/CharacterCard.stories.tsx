import type { Meta, StoryObj } from '@storybook/react-native';
import { CharacterCard } from './CharacterCard';

const meta: Meta<typeof CharacterCard> = {
  title: 'Cards/Character card',
  component: CharacterCard,
  args: { character: { id: 'luna', name: 'Luna', type: 'imaginary' }, onPress: () => undefined },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Placeholder: Story = {};
export const WithDeleteAction: Story = { args: { onDelete: () => undefined } };
export const NotOwned: Story = {
  args: { character: { id: 'fox', name: 'Forest Fox', type: 'animal', isOwned: false } },
};
