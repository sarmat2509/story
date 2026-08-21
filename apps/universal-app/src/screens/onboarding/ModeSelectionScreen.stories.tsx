import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ProductTourProvider } from '@/features/productTour/ProductTourProvider';
import { useAuthStore, type User } from '@/store/authStore';
import ModeSelectionScreen, { type CreatedChild, type OnboardingStep } from './ModeSelectionScreen';

const previewUser = {
  id: 'storybook-parent',
  email: 'parent@example.com',
  onboardingCompleted: false,
  productTourCompleted: true,
  childModeExitPasscodeConfigured: true,
} as User;

useAuthStore.setState({
  user: previewUser,
  token: 'storybook-token',
  isAuthenticated: true,
  isLoading: false,
  sessionMode: 'parent',
  activeChild: null,
});

function OnboardingPreview({ step }: { step: OnboardingStep }) {
  const child: CreatedChild = {
    id: 'storybook-child',
    name: 'Emilia',
    storyCreationMode: 'instant',
  };

  return (
    <ProductTourProvider>
      <ModeSelectionScreen
        initialStep={step}
        initialCreatedChild={step === 'done' ? child : null}
      />
    </ProductTourProvider>
  );
}

const meta: Meta<typeof OnboardingPreview> = {
  title: 'Onboarding/Registration flow',
  component: OnboardingPreview,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const ChildProfile: Story = { args: { step: 'profile' } };
export const StorySetup: Story = { args: { step: 'setup' } };
export const Ready: Story = { args: { step: 'done' } };
