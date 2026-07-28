import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { ReferenceList } from '@/admin/screens/AdminImageGenerationDetailScreen';

describe('Admin image generation references', () => {
  it('renders a stored reference as an interactive row and opens its preview', () => {
    const view = render(
      <ReferenceList
        references={[
          {
            index: 1,
            referenceKind: 'character',
            characterName: 'Ukraispa',
            source: 'character_reference',
            type: 'character_reference',
            storagePath: 'character_turnarounds/ukraispa.png',
            url: '/api/v1/assets/character_turnarounds/ukraispa.png',
            hasBase64Data: true,
          },
        ]}
      />
    );

    expect(view.getByText('Image 1 · character · Ukraispa')).toBeTruthy();
    expect(view.queryByTestId('admin-reference-preview-0')).toBeNull();

    fireEvent.press(view.getByTestId('admin-reference-row-0'));

    expect(view.getByTestId('admin-reference-preview-0')).toBeTruthy();
  });

  it('does not make a base64-only manifest row falsely clickable', () => {
    const view = render(
      <ReferenceList
        references={[
          {
            index: 1,
            referenceKind: 'character',
            characterName: 'Missing path',
            hasBase64Data: true,
          },
        ]}
      />
    );

    fireEvent.press(view.getByTestId('admin-reference-row-0'));
    expect(view.queryByTestId('admin-reference-preview-0')).toBeNull();
  });
});
