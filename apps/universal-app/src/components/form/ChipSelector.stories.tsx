import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ChipSelector } from './ChipSelector';

function ControlledChipSelector({
  selected: initialSelected,
  onSelect,
  ...props
}: React.ComponentProps<typeof ChipSelector>) {
  const [selected, setSelected] = React.useState(initialSelected);

  const handleSelect = (value: string | string[]) => {
    setSelected(value);
    onSelect(value);
  };

  return <ChipSelector {...props} selected={selected} onSelect={handleSelect} />;
}

const meta: Meta<typeof ChipSelector> = {
  title: 'Forms/ChipSelector',
  component: ChipSelector,
  args: {
    label: 'Choose a theme',
    options: ['Adventure', 'Friendship', 'Animals', 'Magic'],
    selected: 'Adventure',
    onSelect: () => undefined,
  },
  argTypes: { onSelect: { action: 'selected' } },
};

export default meta;
type Story = StoryObj<typeof meta>;
export const SingleChoice: Story = { render: (args) => <ControlledChipSelector {...args} /> };
export const MultipleChoice: Story = {
  args: { multiple: true, max: 2, selected: ['Adventure'] },
  render: (args) => <ControlledChipSelector {...args} />,
};
export const AtLimit: Story = {
  args: { multiple: true, max: 2, selected: ['Adventure', 'Animals'] },
  render: (args) => <ControlledChipSelector {...args} />,
};
