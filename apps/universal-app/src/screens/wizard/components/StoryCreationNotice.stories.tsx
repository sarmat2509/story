import type { Meta, StoryObj } from '@storybook/react-native';
import { StoryCreationNotice } from './StoryCreationNotice';

const meta: Meta<typeof StoryCreationNotice> = {
  title: 'Wizard/Story creation notice',
  component: StoryCreationNotice,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
