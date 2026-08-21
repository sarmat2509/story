import type { Meta, StoryObj } from '@storybook/react-native';
import { ChildFormContent } from './ChildFormContent';

const initialData = {
  name: 'Mia',
  birthDate: new Date('2019-05-12'),
  languages: ['en', 'es'],
  aiGeneratedDescription: 'Mia is a curious young explorer who loves friendly dragons.',
  authorPseudonym: 'Moonwriter',
  authorAboutMe: 'Parent and bedtime-story fan.',
};
const meta: Meta<typeof ChildFormContent> = {
  title: 'Forms/Child editor',
  component: ChildFormContent,
  args: {
    childId: 'mia',
    initialData,
    onSuccess: () => undefined,
    onCancel: () => undefined,
    variant: 'inline',
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const FullForm: Story = {};
export const Identity: Story = { args: { inlineSection: 'identity' } };
export const ChildProfile: Story = { args: { inlineSection: 'childProfile' } };
export const StoryAuthor: Story = { args: { inlineSection: 'storyAuthor' } };
