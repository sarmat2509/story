import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScenarioCardsGrid } from './ScenarioCardsGrid';

const scenarios = [
  {
    id: 'magic_wizards',
    name: 'Magic & wizards',
    description: 'Spells, castles and secret worlds.',
  },
  { id: 'space_odyssey', name: 'Space odyssey', description: 'A voyage among the stars.' },
  {
    id: 'jungle_adventures',
    name: 'Jungle adventures',
    description: 'Explore a wild green world.',
  },
];
function ControlledScenarioGrid(props: React.ComponentProps<typeof ScenarioCardsGrid>) {
  const [selected, setSelected] = React.useState(props.selected);
  const [selectedScenarios, setSelectedScenarios] = React.useState(props.selectedScenarios ?? []);
  return (
    <ScenarioCardsGrid
      {...props}
      selected={selected}
      onSelect={setSelected}
      selectedScenarios={props.schedulerMode ? selectedScenarios : undefined}
      onScenariosChange={props.schedulerMode ? setSelectedScenarios : undefined}
    />
  );
}
const meta: Meta<typeof ScenarioCardsGrid> = {
  title: 'Selectors/Theme selector',
  component: ScenarioCardsGrid,
  args: { scenarios, selected: 'magic_wizards', onSelect: () => undefined },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const SingleChoice: Story = { render: (args) => <ControlledScenarioGrid {...args} /> };
export const MultipleChoice: Story = {
  args: { schedulerMode: true, selectedScenarios: ['magic_wizards'] },
  render: (args) => <ControlledScenarioGrid {...args} />,
};
