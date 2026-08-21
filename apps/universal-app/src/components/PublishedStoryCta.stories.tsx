import type { Meta, StoryObj } from '@storybook/react-native';
import { PublishedStoryCta } from './PublishedStoryCta';

const meta: Meta<typeof PublishedStoryCta> = {
  title: 'Story/Published story CTA',
  component: PublishedStoryCta,
  args: { slug: 'moonlit-garden', isAuthenticated: false },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Sidebar: Story = { args: { inSidebar: true } };
