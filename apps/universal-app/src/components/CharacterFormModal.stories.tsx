import type { Meta, StoryObj } from '@storybook/react-native';
import { CharacterFormModal } from './CharacterFormModal';

const meta: Meta<typeof CharacterFormModal> = {
  title: 'Forms/Character editor',
  component: CharacterFormModal,
  args: { visible: true, onClose: () => undefined, characterId: 'character-luna' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Person: Story = {
  args: {
    initialData: {
      name: 'Luna',
      type: 'person',
      description: 'A brave young explorer.',
      appearanceTraits: {
        ageRange: 'child',
        hairColor: 'brown',
        hairLength: 'long',
        eyeColor: 'green',
      },
      personality: { traits: ['brave', 'curious'], favoriteActivities: ['exploring'] },
    },
  },
};

export const Animal: Story = {
  args: {
    initialData: {
      name: 'Milo',
      type: 'animal',
      subtype: 'cat',
      description: 'A clever orange cat.',
      appearanceTraits: {
        breed: 'mixed',
        furColor: 'orange',
        furLength: 'short',
        eyeColor: 'green',
      },
      personality: { traits: ['playful'], favoriteActivities: ['playing'] },
    },
  },
};

export const Imaginary: Story = {
  args: {
    initialData: {
      name: 'Starlight',
      type: 'imaginary',
      description: 'A friendly creature made of starlight.',
      appearanceTraits: {
        species: 'Star dragon',
        primaryColor: 'purple',
        secondaryColor: 'gold',
        size: 'medium',
        magicalFeatures: ['glowing'],
      },
      personality: { traits: ['kind'], favoriteActivities: ['flying'] },
    },
  },
};
