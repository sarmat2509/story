import { Platform } from 'react-native';
import { getWebLocalStorage } from '@/utils/webRuntime';

export type AnalyticsConsent = 'granted' | 'denied' | null;

export const ANALYTICS_CONSENT_CHANGED_EVENT = 'wondertales:analytics-consent-changed';

const ANALYTICS_CONSENT_STORAGE_KEY = 'wondertales:analytics-consent';

type NativeAnalyticsConsentStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

const nativeListeners = new Set<() => void>();
let nativeStorage: NativeAnalyticsConsentStorage | null | undefined;

function isWebStorageAvailable(): boolean {
  return Platform.OS === 'web' && !!getWebLocalStorage();
}

function getNativeStorage(): NativeAnalyticsConsentStorage | null {
  if (nativeStorage !== undefined) return nativeStorage;

  try {
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    nativeStorage = createMMKV({ id: 'wondertales.analytics' });
  } catch {
    nativeStorage = null;
  }

  return nativeStorage;
}

function normalizeAnalyticsConsent(value: unknown): AnalyticsConsent {
  return value === 'granted' || value === 'denied' ? value : null;
}

function notifyNativeAnalyticsConsentListeners(): void {
  for (const listener of nativeListeners) {
    listener();
  }
}

export function getAnalyticsConsent(): AnalyticsConsent {
  if (Platform.OS === 'web') {
    if (!isWebStorageAvailable()) {
      return null;
    }

    return normalizeAnalyticsConsent(getWebLocalStorage()?.getItem(ANALYTICS_CONSENT_STORAGE_KEY));
  }

  return normalizeAnalyticsConsent(getNativeStorage()?.getString(ANALYTICS_CONSENT_STORAGE_KEY));
}

export function isAnalyticsAllowed(): boolean {
  return getAnalyticsConsent() === 'granted';
}

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, null>): void {
  if (Platform.OS === 'web') {
    if (!isWebStorageAvailable()) {
      return;
    }

    getWebLocalStorage()?.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
    return;
  }

  getNativeStorage()?.set(ANALYTICS_CONSENT_STORAGE_KEY, consent);
  notifyNativeAnalyticsConsentListeners();
}

export function onAnalyticsConsentChange(listener: () => void): () => void {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return () => {};
    }

    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, listener);
    return () => window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, listener);
  }

  nativeListeners.add(listener);
  return () => {
    nativeListeners.delete(listener);
  };
}
