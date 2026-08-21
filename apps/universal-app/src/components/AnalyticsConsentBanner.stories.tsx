import React, { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  getAnalyticsConsent,
  setAnalyticsConsent,
} from '@/services/analytics/consent';
import { getWebLocalStorage } from '@/utils/webRuntime';
import { AnalyticsConsentBanner } from './AnalyticsConsentBanner';

function ConsentBannerPreview() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const previousConsent = getAnalyticsConsent();
    getWebLocalStorage()?.removeItem('wondertales:analytics-consent');
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
    setReady(true);
    return () => {
      if (previousConsent) {
        setAnalyticsConsent(previousConsent);
      } else {
        getWebLocalStorage()?.removeItem('wondertales:analytics-consent');
        window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
      }
    };
  }, []);

  return (
    <View style={{ height: 280, position: 'relative' }}>{ready && <AnalyticsConsentBanner />}</View>
  );
}

const meta: Meta<typeof ConsentBannerPreview> = {
  title: 'Popups/Analytics consent banner',
  component: ConsentBannerPreview,
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
