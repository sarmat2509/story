import type { Meta, StoryObj } from '@storybook/react-native';
import { AudioFilterToggle } from './AudioFilterToggle';

const meta: Meta<typeof AudioFilterToggle> = {
  title: 'Components/AudioFilterToggle', component: AudioFilterToggle,
  args: { allStoriesLabel: 'All stories', audioOnlyLabel: 'With audio', onToggle: () => undefined },
  argTypes: { onToggle: { action: 'changed' } },
};

export default meta;
type Story = StoryObj<typeof meta>;
export const AllStories: Story = {};
export const AudioOnly: Story = { args: { initialValue: true } };
