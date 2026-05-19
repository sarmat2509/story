/**
 * AnalyticsIdentity - Calls identify when user logs in, reset on logout.
 */

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAnalytics } from '@/services/analytics';
import { onAnalyticsConsentChange } from '@/services/analytics/consent';

export function AnalyticsIdentity() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [consentVersion, setConsentVersion] = useState(0);

  useEffect(
    () =>
      onAnalyticsConsentChange(() => {
        setConsentVersion((version) => version + 1);
      }),
    []
  );

  useEffect(() => {
    const analytics = getAnalytics();
    if (isAuthenticated && user?.id) {
      analytics.identify(user.id, {
        mode: user.mode,
        preferredLocale: user.preferredLocale,
      });
    } else {
      analytics.reset();
    }
  }, [consentVersion, isAuthenticated, user?.id, user?.mode, user?.preferredLocale]);

  return null;
}
