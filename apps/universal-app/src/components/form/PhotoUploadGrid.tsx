import type { PhotoTypeUserUpload } from '@wondertales/shared';
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/theme';
import { uploadPhoto, deletePhoto, UploadPhotoResult } from '@/utils/uploadPhoto';
import { isServerAssetUrl } from '@/utils/assetUrl';

type Photo = UploadPhotoResult & {
  isUploading?: boolean;
};

interface PhotoUploadGridProps {
  photos: Photo[];
  onPhotosChange: (photos: Photo[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
  photoType?: PhotoTypeUserUpload;
  formatUrl?: (url: string) => string | null; // Optional URL formatter for native platforms
}

export const PhotoUploadGrid: React.FC<PhotoUploadGridProps> = ({
  photos,
  onPhotosChange,
  maxPhotos = 5,
  disabled = false,
  photoType = 'character',
  formatUrl,
}) => {
  const [, setUploadingIndex] = useState<number | null>(null);
  const requestPermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant permission to access your photo library.'
        );
        return false;
      }
    }
    return true;
  };

  const pickImage = async () => {
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
        const localUri = result.assets[0].uri;
        
        // Додаємо тимчасове фото з локальним URI
        const tempPhoto: Photo = {
          url: localUri,
          uploadedAt: new Date().toISOString(),
          isUploading: true
        };
        const tempIndex = photos.length;
        onPhotosChange([...photos, tempPhoto]);
        setUploadingIndex(tempIndex);

        try {
          // Завантажуємо на сервер
          const uploadedPhoto = await uploadPhoto(localUri, photoType);
          
          // Замінюємо тимчасове фото на завантажене
          const updatedPhotos = [...photos];
          updatedPhotos[tempIndex] = {
            ...uploadedPhoto,
            isUploading: false
          };
          onPhotosChange(updatedPhotos);
          setUploadingIndex(null);
        } catch (error) {
          // Видаляємо тимчасове фото при помилці
          Alert.alert('Error', 'Failed to upload photo. Please try again.');
          onPhotosChange(photos.filter((_, i) => i !== tempIndex));
          setUploadingIndex(null);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
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
    <View style={styles.container}>
      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <View key={index} style={styles.photoItem}>
            <Image 
              source={{ uri: (formatUrl ? formatUrl(photo.url) : photo.url) || '' }} 
              style={styles.image} 
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
              >
                <Ionicons name="close-circle" size={24} color={theme.colors.status.error} />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Add photo button */}
        {canAddMore && (
          <TouchableOpacity
            onPress={pickImage}
            style={styles.addButton}
          >
            <Ionicons name="add-circle-outline" size={48} color={theme.colors.interactive.primary} />
            <Text style={styles.addText}>Add Photo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Counter */}
      <Text style={styles.counter}>
        {photos.length} / {maxPhotos} photos
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing[4]
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[4]
  },
  photoItem: {
    width: 150,
    marginBottom: theme.spacing[4]
  },
  image: {
    width: 150,
    height: 150,
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.full,
    padding: 2
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
    alignItems: 'center'
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
    backgroundColor: theme.colors.background.secondary
  },
  addText: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary
  },
  counter: {
    marginTop: theme.spacing[3],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    textAlign: 'center'
  }
});
