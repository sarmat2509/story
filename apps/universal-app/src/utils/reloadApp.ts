import { Alert, Platform } from 'react-native';
import i18n from 'i18next';

/**
 * Trigger a full application reload so theme tokens captured by
 * `StyleSheet.create()` are re-evaluated with the new active palette.
 *
 * - Web: `window.location.reload()` re-mounts the entire bundle.
 * - Native dev: `DevSettings.reload()` from `react-native` fast-reloads JS.
 * - Native prod: we show a localized alert asking the user to restart the app.
 *   (Using `expo-updates` would require an additional dep and OTA config; for
 *   now we keep the prod behaviour minimal and explicit.)
 */
export function reloadApp(): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
    return;
  }

  if (__DEV__) {
    try {
      const { DevSettings } = require('react-native') as typeof import('react-native');
      DevSettings.reload();
      return;
    } catch {
      // fall through to prod-style alert
    }
  }

  Alert.alert(
    i18n.t('theme.restart_required_title'),
    i18n.t('theme.restart_required_message')
  );
}
