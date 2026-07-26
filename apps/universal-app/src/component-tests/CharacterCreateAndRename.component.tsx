import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { CharacterFormModal } from '@/components/CharacterFormModal';
import { CharacterRenameModal } from '@/components/CharacterRenameModal';

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockRename = jest.fn();
const mockClose = jest.fn();
const mockChildrenData = { children: [] };

jest.mock('@/api/characters', () => ({
  useCreateCharacter: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateCharacter: () => ({ mutateAsync: mockUpdate, isPending: false }),
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
  ChipSelector: ({ label, options }: { label: string; options: string[] }) => {
    const React = require('react');
    const { Text, View } = require('react-native');
    return React.createElement(
      View,
      {
        testID:
          label === 'character_form.subtype_label'
            ? 'character-form-subtype-selector'
            : `chip-selector-${label}`,
      },
      React.createElement(Text, null, options.join(','))
    );
  },
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
    mockUpdate.mockReset().mockResolvedValue({ id: 'character-1' });
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

  it('renders every subtype in one selector instead of repeating its label', () => {
    const view = render(<CharacterFormModal visible onClose={mockClose} />);

    expect(view.getAllByTestId('character-form-subtype-selector')).toHaveLength(1);
    expect(view.getByText('dog,cat,hamster,parrot,rabbit,turtle,fish,goat,cow,horse,other_animal'))
      .toBeOnTheScreen();
  });

  it('excludes non-visual imaginary subtypes from the selector', () => {
    const view = render(<CharacterFormModal visible onClose={mockClose} />);

    fireEvent.press(view.getByTestId('character-form-type-imaginary'));

    expect(view.getByTestId('character-form-subtype-selector')).toHaveTextContent(
      'dragon,unicorn,fairy,elf,gnome,mermaid,phoenix,griffin,centaur,troll,monster,wizard,witch,ghost,robot,alien,other_creature'
    );
    expect(view.queryByText(/toy,drawing,imaginary_friend/)).toBeNull();
  });

  it('uses selectable pills for imaginary character size and magical features', () => {
    const view = render(<CharacterFormModal visible onClose={mockClose} />);

    fireEvent.press(view.getByTestId('character-form-type-imaginary'));

    expect(view.getByTestId('chip-selector-character_form.size')).toHaveTextContent(
      /tiny,small,medium,large,giant/
    );
    expect(view.getByTestId('chip-selector-character_form.magical_features')).toHaveTextContent(
      /wings,horns,tail,sparkles,glow/
    );
  });

  it('uses selectable personality pills for a person character', () => {
    const view = render(<CharacterFormModal visible onClose={mockClose} />);

    fireEvent.press(view.getByTestId('character-form-type-person'));

    expect(view.getByTestId('chip-selector-character_form.personality_traits')).toHaveTextContent(
      /curious,brave,shy,energetic,calm/
    );
    expect(
      view.getByTestId('chip-selector-character_form.favorite_activities')
    ).toHaveTextContent(/reading,drawing,painting,sports,football/);
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

  it('asks for confirmation before a description edit regenerates the turnaround', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const view = render(
      <CharacterFormModal
        visible
        characterId="character-1"
        initialData={{
          name: 'Milo',
          type: 'animal',
          description: 'A small friendly explorer.',
          referencePhotos: [],
        }}
        onClose={mockClose}
      />
    );

    fireEvent.changeText(
      view.getByTestId('character-form-description'),
      'A small friendly explorer wearing a red scarf.'
    );
    fireEvent.press(view.getByTestId('character-form-save'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'character_form.regeneration_confirm_title',
        'character_form.regeneration_confirm_message',
        expect.any(Array)
      );
    });
    expect(mockUpdate).not.toHaveBeenCalled();

    const actions = alertSpy.mock.calls[0]?.[2] as
      | Array<{ onPress?: () => void }>
      | undefined;
    await act(async () => {
      actions?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'character-1',
          data: expect.objectContaining({
            description: 'A small friendly explorer wearing a red scarf.',
          }),
        })
      );
    });

    alertSpy.mockRestore();
  });

  it('saves a name-only edit without a turnaround regeneration confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const view = render(
      <CharacterFormModal
        visible
        characterId="character-1"
        initialData={{
          name: 'Milo',
          type: 'animal',
          description: 'A small friendly explorer.',
          referencePhotos: [],
        }}
        onClose={mockClose}
      />
    );

    fireEvent.changeText(view.getByTestId('character-form-name'), 'Milo the Explorer');
    fireEvent.press(view.getByTestId('character-form-save'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'character-1',
          data: expect.objectContaining({ name: 'Milo the Explorer' }),
        })
      );
    });
    expect(alertSpy).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
