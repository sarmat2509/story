import { Platform } from 'react-native';

function isWebRuntime(): boolean {
  return Platform.OS === 'web';
}

export function getWebLocation(): Location | null {
  if (!isWebRuntime() || typeof window === 'undefined' || !window.location) {
    return null;
  }

  return window.location;
}

export function getWebHistory(): History | null {
  if (!isWebRuntime() || typeof window === 'undefined' || !window.history) {
    return null;
  }

  return window.history;
}

export function getWebOrigin(fallback?: string): string | undefined {
  return getWebLocation()?.origin ?? fallback;
}

export function getWebPathname(): string | undefined {
  return getWebLocation()?.pathname;
}

export function getWebSearch(): string | undefined {
  return getWebLocation()?.search;
}

export function getWebHref(): string | undefined {
  return getWebLocation()?.href;
}

export function assignWebLocation(href: string): boolean {
  const location = getWebLocation();
  if (!location) {
    return false;
  }

  location.assign(href);
  return true;
}

export function replaceWebLocation(href: string): boolean {
  const location = getWebLocation();
  if (!location) {
    return false;
  }

  location.replace(href);
  return true;
}

export function getWebLocalStorage(): Storage | null {
  if (!isWebRuntime() || typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

export function getWebSessionStorage(): Storage | null {
  if (!isWebRuntime() || typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  return window.sessionStorage;
}

export function getWebDocumentLang(): string | undefined {
  if (!isWebRuntime() || typeof document === 'undefined') {
    return undefined;
  }

  return document.documentElement?.lang || undefined;
}
