import { Platform } from 'react-native';

export type CaptchaAction = 'login' | 'register' | 'password_reset' | 'feedback';

const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: 'invisible';
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
    }
  ) => string;
  execute: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function isTurnstileAvailable(): boolean {
  return (
    Platform.OS === 'web' &&
    !!TURNSTILE_SITE_KEY &&
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export async function getCaptchaToken(action: CaptchaAction): Promise<string | undefined> {
  if (!isTurnstileAvailable()) return undefined;

  await loadTurnstileScript();
  if (!window.turnstile) {
    throw new Error('Turnstile is unavailable');
  }

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1px';
  container.style.height = '1px';
  document.body.appendChild(container);

  let widgetId: string | null = null;
  try {
    return await new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Turnstile timed out')), 15000);
      widgetId = window.turnstile!.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        size: 'invisible',
        callback: (token) => {
          window.clearTimeout(timeout);
          resolve(token);
        },
        'error-callback': () => {
          window.clearTimeout(timeout);
          reject(new Error('Turnstile verification failed'));
        },
        'expired-callback': () => {
          window.clearTimeout(timeout);
          reject(new Error('Turnstile token expired'));
        },
      });
      window.turnstile!.execute(widgetId);
    });
  } finally {
    if (widgetId && window.turnstile) {
      window.turnstile.remove(widgetId);
    }
    container.remove();
  }
}
