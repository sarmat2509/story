import { Platform } from 'react-native';
import apiClient from '@/api/client';

export interface UploadPhotoResult {
  url: string;
  uploadedAt: string;
}

/**
 * Uploads a photo to the server
 * @param uri - Local URI from ImagePicker
 * @param photoType - Type of photo (character, child, profile)
 * @returns Uploaded photo URL and metadata
 */
export async function uploadPhoto(
  uri: string,
  photoType: 'profile' | 'character' | 'child' = 'character'
): Promise<UploadPhotoResult> {
  try {
    // Create FormData
    const formData = new FormData();
    
    if (Platform.OS === 'web') {
      // Web: convert URI to Blob
      const response = await fetch(uri);
      const blob = await response.blob();
      // @ts-ignore - FormData in browser accepts Blob with filename
      formData.append('photo', blob, 'photo.jpg');
    } else {
      // Native: use URI directly
      const filename = uri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';
      
      formData.append('photo', {
        uri,
        name: filename,
        type,
      } as any);
    }
    
    formData.append('photoType', photoType);

    // Send to server
    const response = await apiClient.post<{ status: string; photo: UploadPhotoResult }>(
      '/api/v1/upload/photo',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    // URL comes as /uploads/development/userId/photos/...
    // Convert relative URL to full URL for Zod .url() validation
    let photoUrl = response.data.photo.url;
    
    if (photoUrl.startsWith('/')) {
      if (Platform.OS === 'web') {
        // Web: use browser origin
        if (typeof globalThis !== 'undefined' && (globalThis as any).location) {
          photoUrl = `${(globalThis as any).location.origin}${photoUrl}`;
        }
      } else {
        // Native: use API base URL
        const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
        photoUrl = `${apiBaseUrl}${photoUrl.replace('/uploads/', '/api/v1/assets/')}`;
      }
    }

    return {
      ...response.data.photo,
      url: photoUrl
    };
  } catch (error) {
    console.error('Photo upload failed:', error);
    throw new Error('Failed to upload photo');
  }
}

/**
 * Deletes a previously uploaded photo from the server
 * Best-effort: failures are logged but not thrown to avoid blocking UI
 * @param url - Server URL of the uploaded photo
 */
export async function deletePhoto(url: string): Promise<void> {
  try {
    await apiClient.delete('/api/v1/upload/photo', { data: { url } });
  } catch (error) {
    console.error('Photo deletion failed:', error);
    // Best-effort: don't throw, the photo will be orphaned but won't block the user
  }
}
