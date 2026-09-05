import React, { useEffect, useRef } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';
import type { Meta, StoryObj } from '@storybook/react-native';
import { StoryBottomSheet } from './StoryBottomSheet';

type StoryBottomSheetArgs = Omit<React.ComponentProps<typeof StoryBottomSheet>, 'bottomSheetRef'>;

function OpenStoryBottomSheet(args: StoryBottomSheetArgs) {
  const bottomSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => bottomSheetRef.current?.snapToIndex(0));
    return () => cancelAnimationFrame(frame);
  }, []);

  return <StoryBottomSheet {...args} bottomSheetRef={bottomSheetRef} />;
}

const meta: Meta<typeof OpenStoryBottomSheet> = {
  title: 'Popups/Story actions sheet',
  component: OpenStoryBottomSheet,
  args: {
    storyId: 'moonlit-garden',
    story: { isPublished: false },
    hasAlignment: false,
    onHighlightToggle: () => undefined,
    onPositionChange: () => undefined,
    onFinish: () => undefined,
    onActivateAudio: async () => undefined,
    onPublish: () => undefined,
    onDeleteStory: () => undefined,
    onReportProblem: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Unpublished: Story = {};
export const Published: Story = {
  args: {
    story: { isPublished: true, visibility: 'catalog' },
    onShare: () => undefined,
    onUnpublish: () => undefined,
  },
};
export const PublishedUnlisted: Story = {
  args: {
    story: { isPublished: true, visibility: 'unlisted' },
    onShare: () => undefined,
    onUnpublish: () => undefined,
  },
};
