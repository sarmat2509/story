import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoUploadGrid } from '@/components/form/PhotoUploadGrid';
import { confirmImageRights } from '@/utils/imageRightsConsent';
import { deletePhoto, uploadPhoto } from '@/utils/uploadPhoto';

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/utils/imageRightsConsent', () => ({
  confirmImageRights: jest.fn(),
}));

jest.mock('@/utils/uploadPhoto', () => ({
  uploadPhoto: jest.fn(),
  deletePhoto: jest.fn(),
}));

jest.mock('@/utils/assetUrl', () => ({
  isServerAssetUrl: (url: string) => url.startsWith('/api/v1/assets/'),
}));

jest.mock('@/utils/localizedApiError', () => ({
  getLocalizedApiError: (_t: unknown, _error: unknown, fallback: string) => fallback,
}));

describe('PhotoUploadGrid', () => {
  beforeEach(() => {
    Image.getSize = jest.fn((_url, success) => {
      success(150, 150);
      return Promise.resolve({ width: 150, height: 150 });
    }) as unknown as typeof Image.getSize;
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (confirmImageRights as jest.Mock).mockResolvedValue({
      imageRightsAccepted: true,
      noPublicFiguresAccepted: true,
    });
  });

  it('emits optimistic and persisted photo states through the real upload interaction', async () => {
    const onPhotosChange = jest.fn();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///picked-child.jpg',
          fileName: 'picked-child.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    });
    (uploadPhoto as jest.Mock).mockResolvedValue({
      url: '/api/v1/assets/test/user/photos/child/uploaded.jpg',
      uploadedAt: '2026-07-17T00:00:00.000Z',
    });

    const view = render(
      <PhotoUploadGrid
        photos={[]}
        onPhotosChange={onPhotosChange}
        photoType="child"
        childDataConsentAccepted
      />
    );

    fireEvent.press(view.getByTestId('photo-upload-add'));

    await waitFor(() => expect(onPhotosChange).toHaveBeenCalledTimes(2));
    expect(onPhotosChange.mock.calls[0][0]).toEqual([
      expect.objectContaining({ url: 'file:///picked-child.jpg', isUploading: true }),
    ]);
    expect(onPhotosChange.mock.calls[1][0]).toEqual([
      expect.objectContaining({
        url: '/api/v1/assets/test/user/photos/child/uploaded.jpg',
        isUploading: false,
      }),
    ]);
    expect(uploadPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///picked-child.jpg' }),
      'child',
      expect.objectContaining({
        childDataConsentAccepted: true,
        imageRightsAccepted: true,
        noPublicFiguresAccepted: true,
      })
    );
  });

  it('removes a persisted server photo immediately and starts best-effort deletion', () => {
    const onPhotosChange = jest.fn();
    const photos = [
      {
        url: '/api/v1/assets/test/user/photos/character/existing.jpg',
        uploadedAt: '2026-07-17T00:00:00.000Z',
      },
    ];
    const view = render(
      <PhotoUploadGrid photos={photos} onPhotosChange={onPhotosChange} photoType="character" />
    );

    fireEvent.press(view.getByTestId('photo-upload-remove-0'));

    expect(deletePhoto).toHaveBeenCalledWith(photos[0].url);
    expect(onPhotosChange).toHaveBeenCalledWith([]);
  });

  it('does not expose the add action when the photo limit is reached', () => {
    const view = render(
      <PhotoUploadGrid
        photos={[{ url: 'file:///one.jpg', uploadedAt: '2026-07-17T00:00:00.000Z' }]}
        onPhotosChange={jest.fn()}
        maxPhotos={1}
      />
    );

    expect(view.queryByTestId('photo-upload-add')).toBeNull();
  });
});
