import { Alert, Platform } from 'react-native';
import type { TFunction } from 'i18next';

export type ImageRightsConfirmation = {
  imageRightsAccepted: true;
  noPublicFiguresAccepted: true;
};

export function confirmImageRights(t: TFunction): Promise<ImageRightsConfirmation | null> {
  const title = t('image_rights.title');
  const message = [
    t('image_rights.rights_statement'),
    t('image_rights.child_statement'),
    t('image_rights.public_figures_statement'),
  ].join('\n\n');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(
      window.confirm(`${title}\n\n${message}`)
        ? { imageRightsAccepted: true, noPublicFiguresAccepted: true }
        : null
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: () => resolve(null),
      },
      {
        text: t('image_rights.confirm'),
        style: 'default',
        onPress: () => resolve({ imageRightsAccepted: true, noPublicFiguresAccepted: true }),
      },
    ]);
  });
}
