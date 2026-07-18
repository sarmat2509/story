import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AudioFilterToggleRef } from '@/components/AudioFilterToggle';
import { LibraryHeader } from '@/components/LibraryHeader';

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false }),
}));

describe('LibraryHeader', () => {
  it('renders desktop controls and reports filter, paging, and view changes', () => {
    const onToggleViewMode = jest.fn();
    const onToggleAudioFilter = jest.fn();
    const onPageChange = jest.fn();
    const onScenarioChange = jest.fn();
    const audioToggleRef = React.createRef<AudioFilterToggleRef>();
    const view = render(
      <LibraryHeader
        viewMode="grid"
        currentPage={2}
        totalPages={3}
        initialAudioFilter
        audioToggleRef={audioToggleRef}
        onToggleViewMode={onToggleViewMode}
        onToggleAudioFilter={onToggleAudioFilter}
        onPageChange={onPageChange}
        t={(key) => key}
        scenarioCards={[{ id: 'adventure', name: 'Adventure' }]}
        selectedScenarioId={null}
        onScenarioChange={onScenarioChange}
      />
    );

    expect(view.getByRole('radio', { name: 'library.audio_only' })).toBeSelected();
    expect(view.getByRole('radio', { name: 'library.all_stories' })).not.toBeSelected();

    const scenarioDropdown = view.getByTestId('catalog-filter-scenario-button');
    expect(scenarioDropdown).toBeCollapsed();

    fireEvent.press(scenarioDropdown);

    expect(scenarioDropdown).toBeExpanded();
    fireEvent.press(view.getByTestId('catalog-filter-scenario-option-adventure'));
    expect(onScenarioChange).toHaveBeenCalledWith('adventure');
    expect(view.queryByTestId('catalog-filter-scenario-option-adventure')).toBeNull();

    fireEvent.press(view.getByTestId('catalog-page-prev'));
    fireEvent.press(view.getByTestId('catalog-page-next'));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);

    fireEvent.press(view.getByLabelText('library.switch_to_list_view'));
    expect(onToggleViewMode).toHaveBeenCalledTimes(1);
  });
});
