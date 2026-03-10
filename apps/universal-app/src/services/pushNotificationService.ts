import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { navigateToStory } from '@/navigation/navigationRef';

/**
 * Configure notification handler (how notifications appear when app is in foreground)
 */
Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    } as Notifications.NotificationBehavior),
});

export const pushNotificationService = {
  /**
   * Request permissions for push notifications
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  },

  /**
   * Send local notification (iOS/Android only)
   * @param notificationTitle - Translated title (e.g. from i18n toast.audio_ready_title)
   */
  async sendAudioReadyNotification(
    storyId: string,
    storyTitle: string,
    notificationTitle: string
  ): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationTitle,
          body: storyTitle,
          data: { storyId, autoPlay: true },
          sound: true,
        },
        trigger: null, // Send immediately
      });
    } catch (error) {
      console.error('[PushNotification] Failed to send notification:', error);
    }
  },

  /**
   * Setup notification tap handler
   */
  setupNotificationListeners(): () => void {
    // Handle notification tap when app is in foreground or background
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data || {}) as { storyId?: string; autoPlay?: boolean };
      const storyId = typeof data.storyId === 'string' ? data.storyId : undefined;
      
      if (storyId) {
        navigateToStory(storyId, { autoPlay: data.autoPlay === true });
      }
    });

    return () => subscription.remove();
  },
};
