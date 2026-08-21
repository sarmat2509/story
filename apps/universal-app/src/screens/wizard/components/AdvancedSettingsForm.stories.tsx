import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { AdvancedSettingsForm } from './AdvancedSettingsForm';

const args = {
  children: [
    { id: 'mia', name: 'Mia' },
    { id: 'leo', name: 'Leo' },
  ],
  goals: [
    { slug: 'kindness', name: 'Kindness' },
    { slug: 'courage', name: 'Courage' },
  ],
  onChildProfileChange: () => undefined,
  onGoalsChange: () => undefined,
  onImageStyleChange: () => undefined,
  onNotesChange: () => undefined,
};
function ControlledAdvancedSettings(props: React.ComponentProps<typeof AdvancedSettingsForm>) {
  const [childProfileId, setChildProfileId] = React.useState(props.childProfileId);
  const [childProfileIds, setChildProfileIds] = React.useState(props.childProfileIds ?? []);
  const [goals, setGoals] = React.useState(props.selectedGoals ?? []);
  const [notes, setNotes] = React.useState(props.userNotes ?? '');
  return (
    <AdvancedSettingsForm
      {...props}
      childProfileId={childProfileId}
      onChildProfileChange={setChildProfileId}
      childProfileIds={props.schedulerMode ? childProfileIds : undefined}
      onChildProfilesChange={props.schedulerMode ? setChildProfileIds : undefined}
      selectedGoals={goals}
      onGoalsChange={setGoals}
      userNotes={notes}
      onNotesChange={setNotes}
    />
  );
}
const meta: Meta<typeof AdvancedSettingsForm> = {
  title: 'Wizard/Advanced settings',
  component: AdvancedSettingsForm,
  args: {
    ...args,
    childProfileId: 'mia',
    selectedGoals: ['kindness'],
    userNotes: 'Include a friendly dragon.',
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  render: (storyArgs) => <ControlledAdvancedSettings {...storyArgs} />,
};
export const Scheduler: Story = {
  args: { ...args, schedulerMode: true, childProfileIds: ['mia'], selectedGoals: ['kindness'] },
  render: (storyArgs) => <ControlledAdvancedSettings {...storyArgs} />,
};
export const NoChildProfiles: Story = {
  args: { ...args, children: [], onAddChild: () => undefined },
  render: (storyArgs) => <ControlledAdvancedSettings {...storyArgs} />,
};
