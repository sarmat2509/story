import type { Meta, StoryObj } from '@storybook/react-native';
import { StoryCharactersSection } from './StoryCharactersSection';

const characters = [
  { id: 'luna', name: 'Luna', type: 'person', description: 'A brave young explorer.' },
  { id: 'milo', name: 'Milo', type: 'animal', description: 'A curious orange cat.' },
  { id: 'star', name: 'Starlight', type: 'imaginary', description: 'A friendly star dragon.' },
];
const meta: Meta<typeof StoryCharactersSection> = {
  title: 'Story/Characters section',
  component: StoryCharactersSection,
  args: {
    characters,
    savedCharacterIds: ['luna'],
    isArtisanMode: false,
    isSavePending: false,
    onSaveCharacter: () => undefined,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const PublicStory: Story = { args: { canSaveCharacters: true } };
export const Artisan: Story = { args: { isArtisanMode: true, collapsible: true } };
