import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { GenerationProgressModal } from '@/components/GenerationProgressModal';

describe('GenerationProgressModal', () => {
  it('lets the user close a failed generation and dismisses it before reporting', () => {
    const onClose = jest.fn();
    const onReport = jest.fn();
    const view = render(
      <GenerationProgressModal
        visible
        presentation="inline"
        requestId="failed-request"
        status="failed"
        progress={0}
        onClose={onClose}
        onReport={onReport}
        allowManualClose
      />
    );

    fireEvent.press(view.getByTestId('generation-progress-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.press(view.getByTestId('generation-progress-report'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onClose.mock.invocationCallOrder[1]).toBeLessThan(onReport.mock.invocationCallOrder[0]);
  });
});
