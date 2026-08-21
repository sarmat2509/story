import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { AudioFilterToggleRef } from './AudioFilterToggle';
import { LibraryHeader } from './LibraryHeader';

function ControlledLibraryHeader() {
  const audioToggleRef = React.useRef<AudioFilterToggleRef>(null);
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [page, setPage] = React.useState(2);
  const [audioOnly, setAudioOnly] = React.useState(false);
  const [scenario, setScenario] = React.useState<string | null>(null);
  return (
    <LibraryHeader
      viewMode={viewMode}
      currentPage={page}
      totalPages={5}
      initialAudioFilter={audioOnly}
      audioToggleRef={audioToggleRef}
      onToggleViewMode={() => setViewMode((current) => (current === 'grid' ? 'list' : 'grid'))}
      onToggleAudioFilter={setAudioOnly}
      onPageChange={setPage}
      t={(key) => key}
      scenarioCards={[
        { id: 'magic_wizards', name: 'Magic & wizards' },
        { id: 'space_odyssey', name: 'Space odyssey' },
      ]}
      selectedScenarioId={scenario}
      onScenarioChange={setScenario}
      ageOptions={[
        { label: 'All ages', value: null },
        { label: '6–8', value: '6-8' },
      ]}
      selectedAgeGroup={null}
      onAgeGroupChange={() => undefined}
      languageOptions={[
        { label: 'English', value: 'en' },
        { label: 'Spanish', value: 'es' },
      ]}
      selectedLanguage="en"
      onLanguageChange={() => undefined}
    />
  );
}
const meta: Meta<typeof LibraryHeader> = { title: 'Library/Header', component: LibraryHeader };
export default meta;
type Story = StoryObj<typeof meta>;
export const FiltersAndPagination: Story = { render: () => <ControlledLibraryHeader /> };
