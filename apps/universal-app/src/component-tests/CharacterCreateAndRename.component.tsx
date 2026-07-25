import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CharacterFormModal } from '@/components/CharacterFormModal';
import { CharacterRenameModal } from '@/components/CharacterRenameModal';

const mockCreate = jest.fn();
const mockRename = jest.fn();
const mockClose = jest.fn();
const mockChildrenData = { children: [] };

jest.mock('@/api/characters', () => ({
  useCreateCharacter: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateCharacter: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRenameCharacter: () => ({ mutateAsync: mockRename, isPending: false }),
  useAnalyzeCharacter: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/api/children', () => ({
  useChildren: () => ({ data: mockChildrenData }),
}));

jest.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { sessionMode: 'parent' }) => unknown) =>
    selector({ sessionMode: 'parent' }),
}));

jest.mock('@/utils/storage', () => ({
  storage: { getLanguage: jest.fn().mockResolvedValue('en') },
}));

jest.mock('@/components/form/PhotoUploadGrid', () => ({
  PhotoUploadGrid: () => null,
}));

jest.mock('@/components/form/ChipSelector', () => ({
  ChipSelector: () => null,
}));

jest.mock('@/components/form/TagsInput', () => ({
  TagsInput: () => null,
}));

jest.mock('@/components/ExpandableCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ExpandableCard: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('@/components/FeedbackModal', () => ({ FeedbackModal: () => null }));

describe('character create and rename forms', () => {
  beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({ id: 'created-character' });
    mockRename.mockReset().mockResolvedValue({ id: 'character-1', name: 'New Name' });
    mockClose.mockReset();
  });

  it('creates a character from form fields without any AI dependency', async () => {
    const view = render(<CharacterFormModal visible onClose={mockClose} />);

    fireEvent.changeText(view.getByTestId('character-form-name'), 'Milo');
    fireEvent.changeText(
      view.getByTestId('character-form-description'),
      'A small friendly explorer.'
    );
    fireEvent.press(view.getByTestId('character-form-save'));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Milo',
        type: 'animal',
        description: 'A small friendly explorer.',
        referencePhotos: [],
      })
    );
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('renames a character with a name-only payload without any AI dependency', async () => {
    const view = render(
      <CharacterRenameModal
        visible
        character={{ id: 'character-1', name: 'Old Name' }}
        onClose={mockClose}
      />
    );

    fireEvent.changeText(view.getByTestId('character-rename-name'), '  New Name  ');
    fireEvent.press(view.getByTestId('character-rename-save'));

    await waitFor(() => {
      expect(mockRename).toHaveBeenCalledWith({
        id: 'character-1',
        name: 'New Name',
      });
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
