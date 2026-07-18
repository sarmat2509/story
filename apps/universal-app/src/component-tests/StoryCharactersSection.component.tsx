import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StoryCharactersSection, type StoryCharacter } from '@/components/StoryCharactersSection';

const CHARACTERS: StoryCharacter[] = [
  {
    id: 'character-1',
    name: 'Mira',
    type: 'child',
    referencePhotoUrl: '/api/v1/assets/characters/mira.jpg',
    isHidden: true,
    description: 'A brave young explorer.',
  },
];

describe('StoryCharactersSection', () => {
  it('expands characters, previews a character, and reports a save action', () => {
    const onSaveCharacter = jest.fn();
    const view = render(
      <StoryCharactersSection
        characters={CHARACTERS}
        savedCharacterIds={[]}
        isArtisanMode
        onSaveCharacter={onSaveCharacter}
        isSavePending={false}
        collapsible
      />
    );

    const sectionToggle = view.getByRole('button');
    expect(sectionToggle).toBeCollapsed();
    expect(view.queryByTestId('story-character-character-1')).toBeNull();

    fireEvent.press(sectionToggle);

    expect(sectionToggle).toBeExpanded();
    const character = view.getByRole('button', { name: 'Mira' });
    expect(character).toBeCollapsed();

    fireEvent.press(character);

    expect(character).toBeExpanded();
    expect(view.getByTestId('story-character-preview-character-1')).toBeOnTheScreen();

    fireEvent.press(view.getByRole('button', { name: 'story_viewer.save_character' }));

    expect(onSaveCharacter).toHaveBeenCalledTimes(1);
    expect(onSaveCharacter).toHaveBeenCalledWith('character-1', 'A brave young explorer.');
  });
});
