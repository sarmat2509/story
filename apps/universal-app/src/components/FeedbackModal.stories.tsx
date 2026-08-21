import type { Meta, StoryObj } from '@storybook/react-native';
import { FeedbackModal } from './FeedbackModal';

const meta: Meta<typeof FeedbackModal> = {
  title: 'Popups/Feedback',
  component: FeedbackModal,
  args: { visible: true, onClose: () => undefined, initialReportedScreen: 'story_viewer' },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const General: Story = {};
export const ContentReport: Story = {
  args: {
    initialTopic: 'unsafe_content',
    contentReportContext: { storyId: 'moonlit-garden', sceneId: 2, contentType: 'scene' },
  },
};
