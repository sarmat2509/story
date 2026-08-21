import type { Meta, StoryObj } from '@storybook/react-native';
import { NavigationContext } from '@react-navigation/native';
import ThemeSettingsScreen from './ThemeSettingsScreen';

const storyNavigation = {
  setOptions: () => undefined,
  navigate: () => undefined,
} as any;

const meta: Meta<typeof ThemeSettingsScreen> = {
  title: 'Profile/Theme settings',
  component: ThemeSettingsScreen,
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
