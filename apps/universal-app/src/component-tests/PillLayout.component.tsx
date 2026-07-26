import React from 'react';
import { ScrollView } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ChipSelector } from '@/components/form/ChipSelector';
import { TagsInput } from '@/components/form/TagsInput';
import { theme } from '@/theme';

describe('pill layouts', () => {
  it('wraps chip selector options instead of placing them in a horizontal scroll view', () => {
    const view = render(
      <ChipSelector
        label="Who is this?"
        options={['cat', 'hamster', 'parrot']}
        selected=""
        onSelect={jest.fn()}
      />
    );

    expect(view.getByText('cat')).toBeOnTheScreen();
    expect(view.getByText('hamster')).toBeOnTheScreen();
    expect(view.UNSAFE_queryByType(ScrollView)).toBeNull();

    const chip = view.getByTestId('chip-selector-option-cat');
    fireEvent(chip, 'hoverIn');
    expect(chip.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: theme.colors.interactive.secondaryHover,
          borderColor: theme.colors.interactive.primaryHover,
        }),
      ])
    );
  });

  it('wraps tag suggestions instead of placing them in a horizontal scroll view', () => {
    const view = render(
      <TagsInput
        label="Traits"
        tags={[]}
        suggestions={['brave', 'curious', 'kind']}
        onTagsChange={jest.fn()}
      />
    );

    fireEvent.changeText(view.getByPlaceholderText('Add tag...'), '');
    fireEvent.changeText(view.getByPlaceholderText('Add tag...'), 'i');

    expect(view.getByText('curious')).toBeOnTheScreen();
    expect(view.getByText('kind')).toBeOnTheScreen();
    expect(view.UNSAFE_queryByType(ScrollView)).toBeNull();

    const suggestion = view.getByTestId('tags-input-suggestion-kind');
    fireEvent(suggestion, 'hoverIn');
    expect(suggestion.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: theme.colors.interactive.secondaryHover,
          borderColor: theme.colors.interactive.primaryHover,
        }),
      ])
    );
  });
});
