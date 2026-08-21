import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import type { Voice } from '@/api/voices';
import VoiceSelector from './VoiceSelector';

const voices: Voice[] = [
  {
    id: 'luna',
    name: 'luna',
    displayName: 'Luna',
    gender: 'female',
    description: 'Warm and gentle',
    isPremium: false,
    isLocked: false,
    provider: 'openai',
  },
  {
    id: 'milo',
    name: 'milo',
    displayName: 'Milo',
    gender: 'male',
    description: 'Calm storyteller',
    isPremium: true,
    isLocked: true,
    provider: 'elevenlabs',
  },
];
function ControlledVoiceSelector(props: React.ComponentProps<typeof VoiceSelector>) {
  const [voiceId, setVoiceId] = React.useState(props.selectedVoiceId);
  return <VoiceSelector {...props} selectedVoiceId={voiceId} onVoiceChange={setVoiceId} />;
}
const meta: Meta<typeof VoiceSelector> = {
  title: 'Selectors/Voice selector',
  component: VoiceSelector,
  args: {
    voices,
    selectedVoiceId: 'luna',
    onVoiceChange: () => undefined,
    language: 'en',
    userPlan: 'free',
    hasPremiumAccess: false,
    audioUsage: { remaining: 2, limit: 5 },
  },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const WithLockedVoice: Story = { render: (args) => <ControlledVoiceSelector {...args} /> };
export const Empty: Story = {
  args: { voices: [], selectedVoiceId: undefined },
  render: (args) => <ControlledVoiceSelector {...args} />,
};
