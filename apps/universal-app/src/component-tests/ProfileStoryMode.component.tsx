import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ProfileScreen from '@/screens/profile/ProfileScreen';

const mockMutateAsync = jest.fn();
const mockSetOptions = jest.fn();
const mockSetUser = jest.fn();
let mockPending = false;
let mockUserMode: 'instant' | 'artisan' = 'instant';

const user = () => ({
  id: 'profile-user',
  email: 'profile@example.test',
  displayName: 'Profile User',
  role: 'user',
  status: 'active',
  mode: mockUserMode,
  preferredLocale: 'en',
  childModeExitPasscodeConfigured: false,
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions, navigate: jest.fn() }),
}));

jest.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ user: user(), logout: jest.fn(), setUser: mockSetUser }),
}));

jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false }) }));
jest.mock('@/hooks/useScreenEnter', () => ({ useScreenEnter: () => 1 }));

jest.mock('@/api/plans', () => ({
  usePlansWithAuth: () => ({ data: { plans: [], enableRealPayments: false }, isLoading: false }),
  useSubscriptionUsage: () => ({ data: null, isLoading: false }),
  useCreatePortalSession: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/api/privacyRequests', () => ({
  usePrivacyRequests: () => ({ data: [], isLoading: false }),
  useCreatePrivacyRequest: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/api/auth', () => ({
  useUpdateMe: () => ({ mutate: jest.fn(), mutateAsync: mockMutateAsync, isPending: mockPending }),
  useUser: () => ({ data: user(), refetch: jest.fn() }),
  useUpdateChildModeExitPasscode: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRequestChildModeExitRecovery: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteAccount: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/components/AnimatedSection', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AnimatedSection: ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('@/components/UsageSummaryCard', () => ({ UsageSummaryCard: () => null }));
jest.mock('@/components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/FeedbackModal', () => ({ FeedbackModal: () => null }));
jest.mock('@/components/FeedbackHeaderButton', () => ({ FeedbackHeaderButton: () => null }));

jest.mock('@/services/analytics/consent', () => ({
  getAnalyticsConsent: () => 'denied',
  onAnalyticsConsentChange: () => jest.fn(),
  setAnalyticsConsent: jest.fn(),
}));
jest.mock('@/services/analytics/posthogProvider', () => ({
  disablePostHogClient: jest.fn(),
  getPostHogClient: jest.fn(),
}));
jest.mock('@/utils/uploadPhoto', () => ({ uploadPhoto: jest.fn(), deletePhoto: jest.fn() }));
jest.mock('@/utils/imageRightsConsent', () => ({ confirmImageRights: jest.fn() }));
jest.mock('@/utils/webRuntime', () => ({ assignWebLocation: jest.fn() }));
jest.mock('@/utils/localizedApiError', () => ({
  getLocalizedApiError: (_t: unknown, _error: unknown, fallback: string) => fallback,
}));

describe('Profile story mode controls', () => {
  beforeEach(() => {
    mockPending = false;
    mockUserMode = 'instant';
    mockMutateAsync.mockResolvedValue({ mode: 'artisan' });
  });

  it('shows the persisted mode and sends the selected replacement mode', async () => {
    const view = render(<ProfileScreen />);

    expect(
      view.getByTestId('profile-story-mode-instant').props.accessibilityState.checked
    ).toBe(true);
    expect(
      view.getByTestId('profile-story-mode-artisan').props.accessibilityState.checked
    ).toBe(false);

    fireEvent.press(view.getByTestId('profile-story-mode-artisan'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ mode: 'artisan' }));
  });

  it('does not submit the already selected mode', () => {
    const view = render(<ProfileScreen />);

    fireEvent.press(view.getByTestId('profile-story-mode-instant'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('disables both options while a mode update is pending', () => {
    mockPending = true;
    const view = render(<ProfileScreen />);

    expect(view.getByTestId('profile-story-mode-instant')).toBeDisabled();
    expect(view.getByTestId('profile-story-mode-artisan')).toBeDisabled();

    fireEvent.press(view.getByTestId('profile-story-mode-artisan'));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
