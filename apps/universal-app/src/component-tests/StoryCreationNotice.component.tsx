import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StoryCreationNotice } from '@/screens/wizard/components/StoryCreationNotice';

describe('StoryCreationNotice', () => {
  it('expands and collapses its explanatory content', () => {
    const view = render(<StoryCreationNotice testID="creation-notice" />);
    const toggle = view.getByTestId('creation-notice-toggle');
    const noticeText =
      'Your content will be created with AI. Minor image or text generation errors may occasionally appear, so a quick adult review of the result is recommended.';

    expect(toggle).toBeCollapsed();
    expect(view.queryByText(noticeText)).toBeNull();

    fireEvent.press(toggle);

    expect(toggle).toBeExpanded();
    expect(view.getByText(noticeText)).toBeOnTheScreen();
    expect(view.getByText(/I have the legal right to use this image/)).toBeOnTheScreen();

    fireEvent.press(toggle);

    expect(toggle).toBeCollapsed();
    expect(view.queryByText(noticeText)).toBeNull();
  });
});
