import { Platform } from 'react-native';

export type AnalyticsConsent = 'granted' | 'denied' | null;

export const ANALYTICS_CONSENT_CHANGED_EVENT = 'wondertales:analytics-consent-changed';

const ANALYTICS_CONSENT_STORAGE_KEY = 'wondertales:analytics-consent';

function isWebStorageAvailable(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && !!window.localStorage;
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (!isWebStorageAvailable()) {
    return null;
  }

  const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
  return value === 'granted' || value === 'denied' ? value : null;
}

export function isAnalyticsAllowed(): boolean {
  if (Platform.OS !== 'web') {
    return true;
  }

  return getAnalyticsConsent() === 'granted';
}

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, null>): void {
  if (!isWebStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
}

export function onAnalyticsConsentChange(listener: () => void): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, listener);
  return () => window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, listener);
}
