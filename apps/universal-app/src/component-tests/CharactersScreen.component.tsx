import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CharactersScreen from '@/screens/characters/CharactersScreen';

const mockSetOptions = jest.fn();
const mockUseCharacterGenerationUsage = jest.fn();
let mockCharacters: Array<{
  id: string;
  name: string;
  type: 'person' | 'animal' | 'imaginary';
  childProfileId?: string | null;
  createdByMode?: 'parent' | 'child';
  createdByChildProfileId?: string | null;
  isOwned?: boolean;
}> = [];

let mockAuthState: {
  sessionMode: 'parent' | 'child';
  user: { mode: 'instant' | 'artisan' };
  activeChild: { id?: string; storyCreationMode: 'instant' | 'artisan' } | null;
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock('@/api/characters', () => ({
  useCharacters: () => ({ data: mockCharacters, isLoading: false, error: null }),
  useCharacterGenerationUsage: (enabled: boolean) => mockUseCharacterGenerationUsage(enabled),
  useDeleteCharacter: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

jest.mock('@/hooks/useScreenEnter', () => ({
  useScreenEnter: () => 1,
}));

jest.mock('@/components/AnimatedSection', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AnimatedSection: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('@/components/CharacterFormModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CharacterFormModal: ({ visible }: { visible: boolean }) =>
      visible ? React.createElement(View, { testID: 'character-form-modal' }) : null,
  };
});

jest.mock('@/components/CharacterRenameModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CharacterRenameModal: ({ visible }: { visible: boolean }) =>
      visible ? React.createElement(View, { testID: 'character-rename-modal' }) : null,
  };
});

jest.mock('@/screens/characters/components/CharacterCard', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    CharacterCard: ({
      character,
      onPress,
    }: {
      character: { id: string };
      onPress: () => void;
    }) =>
      React.createElement(Pressable, {
        testID: `character-card-button-${character.id}`,
        onPress,
      }),
  };
});
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/FeedbackModal', () => ({ FeedbackModal: () => null }));
jest.mock('@/components/FeedbackHeaderButton', () => ({ FeedbackHeaderButton: () => null }));

describe('CharactersScreen story creation modes', () => {
  beforeEach(() => {
    mockCharacters = [];
    mockAuthState = {
      sessionMode: 'parent',
      user: { mode: 'instant' },
      activeChild: null,
    };
    mockUseCharacterGenerationUsage.mockReturnValue({ data: null });
  });

  it('hides manual character creation for an Instant parent account', () => {
    const view = render(<CharactersScreen />);

    expect(view.getByText('characters.no_characters_instant_hint')).toBeOnTheScreen();
    expect(view.queryByTestId('characters-add')).toBeNull();
    expect(mockUseCharacterGenerationUsage).toHaveBeenCalledWith(false);
  });

  it('opens the existing character form for an Artisan parent account', () => {
    mockAuthState.user.mode = 'artisan';
    const view = render(<CharactersScreen />);

    expect(view.getByText('characters.no_characters_hint')).toBeOnTheScreen();
    expect(mockUseCharacterGenerationUsage).toHaveBeenCalledWith(true);

    fireEvent.press(view.getByTestId('characters-add'));

    expect(view.getByTestId('character-form-modal')).toBeOnTheScreen();
  });

  it('lets an Instant parent open rename for a character created by a child', () => {
    mockCharacters = [
      {
        id: 'child-character',
        name: 'Milo',
        type: 'animal',
        childProfileId: 'child-profile',
        createdByMode: 'child',
        createdByChildProfileId: 'child-profile',
        isOwned: true,
      },
    ];
    const view = render(<CharactersScreen />);

    expect(view.queryByTestId('characters-add')).toBeNull();
    fireEvent.press(view.getByTestId('character-card-button-child-character'));

    expect(view.getByTestId('character-rename-modal')).toBeOnTheScreen();
  });

  it('uses the active child mode instead of the parent account mode in a child session', () => {
    mockAuthState = {
      sessionMode: 'child',
      user: { mode: 'artisan' },
      activeChild: { storyCreationMode: 'instant' },
    };
    const view = render(<CharactersScreen />);

    expect(view.getByText('characters.no_characters_instant_hint')).toBeOnTheScreen();
    expect(view.queryByTestId('characters-add')).toBeNull();
    expect(mockUseCharacterGenerationUsage).toHaveBeenCalledWith(false);
  });

  it('allows the existing character form for an Artisan child without loading parent quota', () => {
    mockAuthState = {
      sessionMode: 'child',
      user: { mode: 'instant' },
      activeChild: { storyCreationMode: 'artisan' },
    };
    const view = render(<CharactersScreen />);

    expect(view.getByTestId('characters-add')).toBeOnTheScreen();
    expect(mockUseCharacterGenerationUsage).toHaveBeenCalledWith(false);

    fireEvent.press(view.getByTestId('characters-add'));

    expect(view.getByTestId('character-form-modal')).toBeOnTheScreen();
  });
});
