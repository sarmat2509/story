/**
 * AnalyticsIdentity - Calls identify when user logs in, reset on logout.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAnalytics } from '@/services/analytics';

export function AnalyticsIdentity() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    const analytics = getAnalytics();
    if (isAuthenticated && user?.id) {
      analytics.identify(user.id, {
        email: user.email,
        displayName: user.displayName,
        mode: user.mode,
      });
    } else {
      analytics.reset();
    }
  }, [isAuthenticated, user?.id, user?.email, user?.displayName, user?.mode]);

  return null;
}
