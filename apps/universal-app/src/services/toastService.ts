import Toast from 'react-native-toast-message';

interface ToastOptions {
  visibilityTime?: number;
  onPress?: () => void;
  actionText?: string;
}

export const toastService = {
  success: (title: string, message?: string, options?: ToastOptions) => {
    Toast.show({
      type: 'success',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: options?.visibilityTime || 4000,
      autoHide: true,
      topOffset: 60,
      onPress: options?.onPress,
      props: {
        actionText: options?.actionText,
      },
    });
  },

  error: (title: string, message?: string, options?: ToastOptions) => {
    Toast.show({
      type: 'error',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: options?.visibilityTime || 4000,
      autoHide: true,
      topOffset: 60,
      onPress: options?.onPress,
    });
  },

  info: (title: string, message?: string, options?: ToastOptions) => {
    Toast.show({
      type: 'info',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: options?.visibilityTime || 4000,
      autoHide: true,
      topOffset: 60,
      onPress: options?.onPress,
    });
  },
};
