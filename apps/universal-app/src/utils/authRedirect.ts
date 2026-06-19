import { Platform } from 'react-native';
import { getWebLocation, getWebSessionStorage, replaceWebLocation } from '@/utils/webRuntime';

const AUTH_REDIRECT_STORAGE_KEY = 'auth_intended_path';

function isAuthEntryPath(pathname: string): boolean {
  return /^\/(?:[a-z]{2}\/)?(?:welcome|register|auth\/)/.test(pathname);
}

function normalizeStoredPath(value: string | null): string | null {
  if (!value || !value.startsWith('/')) {
    return null;
  }

  const pathname = value.split(/[?#]/, 1)[0] || '/';
  if (isAuthEntryPath(pathname)) {
    return null;
  }

  return value;
}

export function rememberCurrentWebPathForAuthRedirect(): void {
  if (Platform.OS !== 'web') {
    return;
  }

  const location = getWebLocation();
  const storage = getWebSessionStorage();
  if (!location || !storage || isAuthEntryPath(location.pathname)) {
    return;
  }

  storage.setItem(
    AUTH_REDIRECT_STORAGE_KEY,
    `${location.pathname}${location.search}${location.hash}`
  );
}

export function clearWebAuthRedirectPath(): void {
  if (Platform.OS !== 'web') {
    return;
  }

  getWebSessionStorage()?.removeItem(AUTH_REDIRECT_STORAGE_KEY);
}

export function consumeWebAuthRedirectPath(): string | null {
  if (Platform.OS !== 'web') {
    return null;
  }

  const storage = getWebSessionStorage();
  if (!storage) {
    return null;
  }

  const target = normalizeStoredPath(storage.getItem(AUTH_REDIRECT_STORAGE_KEY));
  storage.removeItem(AUTH_REDIRECT_STORAGE_KEY);
  return target;
}

export function replaceWithStoredWebAuthRedirect(): boolean {
  const target = consumeWebAuthRedirectPath();
  return !!target && replaceWebLocation(target);
}
