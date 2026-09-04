import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import type { Voice } from '@/api/voices';
import { theme } from '@/theme';
import { AudioGenerationStarter } from './AudioGenerationStarter';

const voices: Voice[] = [
  { id: 'luna', name: 'luna', displayName: 'Luna', gender: 'female', description: 'Warm and gentle', isPremium: false, isLocked: false, provider: 'openai' },
  { id: 'milo', name: 'milo', displayName: 'Milo', gender: 'male', description: 'Calm storyteller', isPremium: true, isLocked: true, provider: 'elevenlabs' },
];

function ControlledStarter(props: React.ComponentProps<typeof AudioGenerationStarter>) {
  const [voiceId, setVoiceId] = useState(props.selectedVoiceId);
  return <AudioGenerationStarter {...props} selectedVoiceId={voiceId} onVoiceChange={setVoiceId} />;
}

const meta: Meta<typeof ControlledStarter> = {
  title: 'Audio/Generation start', component: ControlledStarter,
  args: {
    voices, selectedVoiceId: 'luna', onVoiceChange: () => undefined, language: 'en', userPlan: 'free',
    hasPremiumAccess: false, audioUsage: { remaining: 1, limit: 1 },
    onGenerate: () => undefined, onUpgrade: () => undefined,
  },
  decorators: [(Story) => (
    <View style={{ width: 360, padding: theme.spacing[5], borderWidth: 2, borderColor: theme.colors.interactive.primary, borderRadius: theme.spacing[4], backgroundColor: theme.colors.background.secondary }}>
      <Story />
    </View>
  )],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToGenerate: Story = { render: (args) => <ControlledStarter {...args} /> };
export const RetryingFailedAudio: Story = { args: { audioFailed: true }, render: (args) => <ControlledStarter {...args} /> };
export const Queued: Story = { args: { isGenerating: true, jobStatus: 'queued' }, render: (args) => <ControlledStarter {...args} /> };
export const Generating: Story = { args: { isGenerating: true, jobStatus: 'processing' }, render: (args) => <ControlledStarter {...args} /> };
export const PremiumVoiceLocked: Story = { args: { selectedVoiceId: 'milo' }, render: (args) => <ControlledStarter {...args} /> };
