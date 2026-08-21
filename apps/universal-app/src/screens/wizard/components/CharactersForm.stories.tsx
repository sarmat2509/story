import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { CharactersForm } from './CharactersForm';

const characters = [
  { id: 'mia', name: 'Mia', type: 'person', subtype: 'child' },
  { id: 'milo', name: 'Milo', type: 'animal', subtype: 'cat' },
  { id: 'star', name: 'Starlight', type: 'imaginary' },
];
function ControlledCharactersForm(props: React.ComponentProps<typeof CharactersForm>) {
  const [selectedCharacters, setSelectedCharacters] = React.useState(props.selectedCharacters);
  return (
    <CharactersForm
      {...props}
      selectedCharacters={selectedCharacters}
      onCharactersChange={setSelectedCharacters}
    />
  );
}
const meta: Meta<typeof CharactersForm> = {
  title: 'Wizard/Characters picker',
  component: CharactersForm,
  args: {
    characters,
    selectedCharacters: ['mia'],
    maxSelections: 2,
    onCharactersChange: () => undefined,
    onAddCharacter: () => undefined,
    onAddChild: () => undefined,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Selection: Story = { render: (args) => <ControlledCharactersForm {...args} /> };
export const LimitReached: Story = {
  args: { selectedCharacters: ['mia', 'milo'] },
  render: (args) => <ControlledCharactersForm {...args} />,
};
export const Empty: Story = {
  args: { characters: [], selectedCharacters: [] },
  render: (args) => <ControlledCharactersForm {...args} />,
};
