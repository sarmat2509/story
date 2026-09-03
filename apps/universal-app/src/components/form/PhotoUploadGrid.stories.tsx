import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { PhotoUploadGrid } from './PhotoUploadGrid';

function ControlledPhotoGrid(props: React.ComponentProps<typeof PhotoUploadGrid>) {
  const [photos, setPhotos] = React.useState(props.photos);
  return <PhotoUploadGrid {...props} photos={photos} onPhotosChange={setPhotos} />;
}
const meta: Meta<typeof PhotoUploadGrid> = {
  title: 'Forms/Photo upload grid',
  component: PhotoUploadGrid,
  args: { photos: [], onPhotosChange: () => undefined, maxPhotos: 3, photoType: 'character' },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { render: (args) => <ControlledPhotoGrid {...args} /> };
export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <ControlledPhotoGrid {...args} />,
};
export const WithUploads: Story = {
  args: {
    photos: [
      {
        url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
        uploadedAt: '2026-08-21T00:00:00.000Z',
      },
    ],
  },
  render: (args) => <ControlledPhotoGrid {...args} />,
};
