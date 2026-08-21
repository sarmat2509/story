import type { Meta, StoryObj } from '@storybook/react-native';
import { PublishShareDialog } from './PublishShareDialog';

const meta: Meta<typeof PublishShareDialog> = {
  title: 'Popups/Publish and share',
  component: PublishShareDialog,
  args: {
    visible: true,
    onCancel: () => undefined,
    onPublishAndShare: () => undefined,
    userPseudonym: 'Moonwriter',
    coverAssets: [{ assetId: 'cover-1', imageUrl: null }],
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Publish: Story = {};
export const Published: Story = {
  args: {
    shareUrl: 'https://wondertales.app/stories/moonlit-garden',
    onUnpublish: () => undefined,
  },
};
export const ShareRequiresPublish: Story = { args: { openedFromShare: true } };
