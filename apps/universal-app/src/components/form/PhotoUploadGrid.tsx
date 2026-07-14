import type { PhotoTypeUserUpload } from '@wondertales/shared';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { theme } from '@/theme';
import { uploadPhoto, deletePhoto, UploadPhotoResult } from '@/utils/uploadPhoto';
import { isServerAssetUrl } from '@/utils/assetUrl';
import { confirmImageRights } from '@/utils/imageRightsConsent';
import { getLocalizedApiError } from '@/utils/localizedApiError';

type Photo = UploadPhotoResult & {
  isUploading?: boolean;
};

const PHOTO_HEIGHT = 150;
const MIN_PHOTO_WIDTH = 72;
const MAX_PHOTO_WIDTH = 260;

function getPhotoWidth(aspectRatio?: number): number {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return PHOTO_HEIGHT;
  }

  return Math.max(
    MIN_PHOTO_WIDTH,
    Math.min(MAX_PHOTO_WIDTH, Math.round(PHOTO_HEIGHT * aspectRatio))
  );
}

interface PhotoUploadGridProps {
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
  photoType?: PhotoTypeUserUpload;
  childDataConsentAccepted?: boolean;
  imageRightsConsentMode?: 'per-upload-prompt' | 'story-submit';
  formatUrl?: (url: string) => string | null; // Optional URL formatter for native platforms
}

export const PhotoUploadGrid: React.FC<PhotoUploadGridProps> = ({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  disabled = false,
  photoType = 'character',
  childDataConsentAccepted = false,
  imageRightsConsentMode = 'per-upload-prompt',
  formatUrl,
}) => {
  const { t } = useTranslation();
  const [, setUploadingIndex] = useState<number | null>(null);
  const [photoAspectRatios, setPhotoAspectRatios] = useState<Record<string, number>>({});

  useEffect(() => {
    let isCancelled = false;

    photos.forEach((photo) => {
      if (photoAspectRatios[photo.url]) return;
      const resolvedUrl = (formatUrl ? formatUrl(photo.url) : photo.url) || photo.url;
      if (!resolvedUrl) return;

      Image.getSize(
        resolvedUrl,
        (width, height) => {
          if (isCancelled || !width || !height) return;
          const nextAspectRatio = width / height;
          setPhotoAspectRatios((current) =>
            current[photo.url] === nextAspectRatio
              ? current
              : { ...current, [photo.url]: nextAspectRatio }
          );
        },
        () => undefined
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [formatUrl, photoAspectRatios, photos]);

  const requestPermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('photo_upload.permission_title'), t('photo_upload.permission_message'));
        return false;
      }
    }
    return true;
  };

  const pickImage = async () => {
    const imageRights =
      photoType === 'feedback'
        ? null
        : imageRightsConsentMode === 'story-submit'
          ? { imageRightsAccepted: true as const, noPublicFiguresAccepted: true as const }
          : await confirmImageRights(t);
    if (photoType !== 'feedback' && !imageRights) return;

    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const localUri = asset.uri;

        // Додаємо тимчасове фото з локальним URI
        const tempPhoto: Photo = {
          url: localUri,
          uploadedAt: new Date().toISOString(),
          isUploading: true,
        };
        const tempIndex = photos.length;
        onPhotosChange([...photos, tempPhoto]);
        setUploadingIndex(tempIndex);

        try {
          // Завантажуємо на сервер
          const uploadedPhoto = await uploadPhoto(
            {
              uri: localUri,
              file: asset.file,
              fileName: asset.fileName,
              mimeType: asset.mimeType,
            },
            photoType,
            {
              childDataConsentAccepted:
                photoType === 'child' ? childDataConsentAccepted : undefined,
              imageRightsAccepted: imageRights?.imageRightsAccepted,
              noPublicFiguresAccepted: imageRights?.noPublicFiguresAccepted,
            }
          );

          // Замінюємо тимчасове фото на завантажене
          const updatedPhotos = [...photos];
          updatedPhotos[tempIndex] = {
            ...uploadedPhoto,
            isUploading: false,
          };
          onPhotosChange(updatedPhotos);
          setUploadingIndex(null);
        } catch (error) {
          // Видаляємо тимчасове фото при помилці
          const message = getLocalizedApiError(t, error, 'photo_upload.upload_error_message');
          Alert.alert(t('photo_upload.upload_error_title'), message);
          onPhotosChange(photos.filter((_, i) => i !== tempIndex));
          setUploadingIndex(null);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('photo_upload.pick_error_title'), t('photo_upload.pick_error_message'));
    }
  };

  const removePhoto = async (index: number) => {
    const photo = photos[index];
    // Delete from server if already uploaded (best-effort, don't block UI)
    if (!photo.isUploading && isServerAssetUrl(photo.url)) {
      deletePhoto(photo.url);
    }
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  const canAddMore = photos.length < maxPhotos && !disabled;

  return (
    <View style={styles.container} testID="photo-upload-grid">
      <View style={styles.grid}>
        {photos.map((photo, index) => {
          const photoWidth = getPhotoWidth(photoAspectRatios[photo.url]);
          return (
            <View
              key={index}
              style={[styles.photoItem, { width: photoWidth }]}
              testID={`photo-upload-item-${index}`}
            >
              <Image
                source={{ uri: (formatUrl ? formatUrl(photo.url) : photo.url) || '' }}
                style={[styles.image, { width: photoWidth }]}
                resizeMode="contain"
                testID={`photo-upload-image-${index}`}
                onLoad={(event) => {
                  const source = event.nativeEvent.source;
                  if (!source?.width || !source?.height) return;
                  const nextAspectRatio = source.width / source.height;
                  setPhotoAspectRatios((current) =>
                    current[photo.url] === nextAspectRatio
                      ? current
                      : { ...current, [photo.url]: nextAspectRatio }
                  );
                }}
              />

              {/* Upload spinner */}
              {photo.isUploading && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
                </View>
              )}

              {/* Remove button */}
              {!photo.isUploading && (
                <TouchableOpacity
                  onPress={() => removePhoto(index)}
                  style={styles.removeButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  testID={`photo-upload-remove-${index}`}
                >
                  <Ionicons name="close-circle" size={24} color={theme.colors.status.error} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Add photo button */}
        {canAddMore && (
          <TouchableOpacity onPress={pickImage} style={styles.addButton} testID="photo-upload-add">
            <Ionicons
              name="add-circle-outline"
              size={48}
              color={theme.colors.interactive.primary}
            />
            <Text style={styles.addText}>{t('photo_upload.add_photo')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Counter */}
      <Text style={styles.counter}>
        {t('photo_upload.counter', { count: photos.length, max: maxPhotos })}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing[4],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[4],
    alignItems: 'flex-start',
  },
  photoItem: {
    marginBottom: theme.spacing[4],
    alignSelf: 'flex-start',
  },
  image: {
    height: PHOTO_HEIGHT,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.full,
    padding: 2,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: theme.borders.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 150,
    height: 150,
    borderRadius: theme.borders.radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.border.medium,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
  },
  addText: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  counter: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
});
