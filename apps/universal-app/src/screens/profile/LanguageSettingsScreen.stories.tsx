import type { Meta, StoryObj } from '@storybook/react-native';
import { NavigationContext } from '@react-navigation/native';
import LanguageSettingsScreen from './LanguageSettingsScreen';

const storyNavigation = {
  setOptions: () => undefined,
  navigate: () => undefined,
} as any;

const meta: Meta<typeof LanguageSettingsScreen> = {
  title: 'Profile/Language settings',
  component: LanguageSettingsScreen,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <NavigationContext.Provider value={storyNavigation}>
        <Story />
      </NavigationContext.Provider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
