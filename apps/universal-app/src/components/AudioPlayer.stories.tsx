import type { Meta, StoryObj } from '@storybook/react-native';
import AudioPlayer from './AudioPlayer';

const meta: Meta<typeof AudioPlayer> = {
  title: 'Audio/Player',
  component: AudioPlayer,
  args: {
    storyId: 'moonlit-garden',
    audioUrl: 'https://example.com/story.mp3',
    duration: 185,
    title: 'The Moonlit Garden',
    onActivate: async () => undefined,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const WithTextHighlight: Story = { args: { hasAlignment: true } };
