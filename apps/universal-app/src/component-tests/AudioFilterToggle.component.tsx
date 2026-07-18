import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AudioFilterToggle } from '@/components/AudioFilterToggle';

describe('AudioFilterToggle', () => {
  it('renders the selected segment and reports user selection changes', () => {
    const onToggle = jest.fn();
    const view = render(
      <AudioFilterToggle
        allStoriesLabel="All stories"
        audioOnlyLabel="Audio only"
        onToggle={onToggle}
      />
    );

    const allStories = view.getByRole('radio', { name: 'All stories' });
    const audioOnly = view.getByRole('radio', { name: 'Audio only' });

    expect(allStories).toBeSelected();
    expect(audioOnly).not.toBeSelected();

    fireEvent.press(audioOnly);

    expect(onToggle).toHaveBeenLastCalledWith(true);
    expect(allStories).not.toBeSelected();
    expect(audioOnly).toBeSelected();

    fireEvent.press(allStories);

    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
