import type { Meta, StoryObj } from '@storybook/react-native';
import { TagsInput } from './TagsInput';

const meta: Meta<typeof TagsInput> = {
  title: 'Forms/TagsInput', component: TagsInput,
  args: { label: 'Story details', tags: ['Kindness'], suggestions: ['Friendship', 'Courage', 'Magic', 'Family'], max: 4, onTagsChange: () => undefined },
  argTypes: { onTagsChange: { action: 'changed' } },
};

export default meta;
type Story = StoryObj<typeof meta>;
export const WithTags: Story = {};
export const Empty: Story = { args: { tags: [] } };
export const AtLimit: Story = { args: { tags: ['Kindness', 'Courage', 'Friendship', 'Magic'] } };
