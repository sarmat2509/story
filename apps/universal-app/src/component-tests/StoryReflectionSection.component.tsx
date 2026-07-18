import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { StoryReflectionSection } from '@/components/StoryReflectionSection';

const mockUseStoryQuiz = jest.fn();
const mockGenerateQuizMutate = jest.fn();
const mockSaveQuizAnswerMutate = jest.fn();

jest.mock('@/api/stories', () => ({
  useStoryQuiz: (storyId: string, enabled: boolean) => mockUseStoryQuiz(storyId, enabled),
  useGenerateStoryQuiz: () => ({
    isPending: false,
    error: null,
    mutate: mockGenerateQuizMutate,
  }),
  useSaveStoryQuizAnswer: () => ({ mutate: mockSaveQuizAnswerMutate }),
}));

describe('StoryReflectionSection', () => {
  beforeEach(() => {
    mockUseStoryQuiz.mockReturnValue({ data: null });
  });

  it('renders the optional invitation and lets the user dismiss it', () => {
    const view = render(<StoryReflectionSection storyId="story-1" enabled />);

    expect(view.getByTestId('story-quiz-invitation')).toBeOnTheScreen();
    expect(view.getByRole('button', { name: 'Prepare activities' })).toBeOnTheScreen();

    fireEvent.press(view.getByText('Не сейчас'));

    expect(view.queryByTestId('story-quiz-invitation')).toBeNull();
  });

  it('renders nothing when reflection is disabled', () => {
    const view = render(<StoryReflectionSection storyId="story-1" enabled={false} />);

    expect(view.toJSON()).toBeNull();
  });

  it('starts quiz generation only from the invitation and opens the existing query afterward', () => {
    const view = render(<StoryReflectionSection storyId="story-1" enabled />);

    expect(mockUseStoryQuiz).toHaveBeenLastCalledWith('story-1', false);
    expect(mockGenerateQuizMutate).not.toHaveBeenCalled();

    fireEvent.press(view.getByRole('button', { name: 'Prepare activities' }));

    expect(mockGenerateQuizMutate).toHaveBeenCalledTimes(1);
    expect(mockGenerateQuizMutate.mock.calls[0][0]).toEqual({ storyId: 'story-1' });

    act(() => {
      mockGenerateQuizMutate.mock.calls[0][1].onSettled();
    });

    expect(mockUseStoryQuiz).toHaveBeenLastCalledWith('story-1', true);
  });
});
