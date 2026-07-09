import type { PhotoTypeUserUpload } from '@wondertales/shared';
import { Platform } from 'react-native';
import apiClient from '@/api/client';

export interface UploadPhotoResult {
  url: string;
  storagePath?: string;
  uploadedAt: string;
  isUploading?: boolean;
}

export type UploadPhotoSource =
  | string
  | {
      uri: string;
      file?: Blob;
      fileName?: string | null;
      mimeType?: string | null;
    };

function getUploadSource(source: UploadPhotoSource): {
  uri: string;
  file?: Blob;
  fileName?: string | null;
  mimeType?: string | null;
} {
  return typeof source === 'string' ? { uri: source } : source;
}

function getBlobFileName(file: Blob | undefined): string | undefined {
  if (!file || !('name' in file)) return undefined;
  const name = (file as Blob & { name?: unknown }).name;
  return typeof name === 'string' && name.trim() ? name : undefined;
}

function inferMimeType(filename: string): string {
  const match = /\.(\w+)$/.exec(filename);
  return match ? `image/${match[1]}` : 'image/jpeg';
}

/**
 * Uploads a photo to the server
 * @param source - Local URI or ImagePicker asset
 * @param photoType - Type of photo (character, child, profile)
 * @returns Uploaded photo URL and metadata
 */
export async function uploadPhoto(
  source: UploadPhotoSource,
  photoType: PhotoTypeUserUpload = 'character',
  options: {
    childDataConsentAccepted?: boolean;
    imageRightsAccepted?: boolean;
    noPublicFiguresAccepted?: boolean;
  } = {}
): Promise<UploadPhotoResult> {
  try {
    const uploadSource = getUploadSource(source);
    const uri = uploadSource.uri;
    // Create FormData
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const fileName = uploadSource.fileName || getBlobFileName(uploadSource.file) || 'photo.jpg';
      const mimeType = uploadSource.mimeType || uploadSource.file?.type || inferMimeType(fileName);
      const blob =
        uploadSource.file ??
        (await (async () => {
          const response = await fetch(uri);
          return response.blob();
        })());
      const uploadBlob = blob.type ? blob : blob.slice(0, blob.size, mimeType);
      // @ts-ignore - FormData in browser accepts Blob with filename
      formData.append('photo', uploadBlob, fileName);
    } else {
      // Native: use URI directly
      const filename = uploadSource.fileName || uri.split('/').pop() || 'photo.jpg';
      const type = uploadSource.mimeType || inferMimeType(filename);

      formData.append('photo', {
        uri,
        name: filename,
        type,
      } as any);
    }

    formData.append('photoType', photoType);
    if (options.childDataConsentAccepted) {
      formData.append('childDataConsentAccepted', 'true');
    }
    if (options.imageRightsAccepted) {
      formData.append('imageRightsAccepted', 'true');
    }
    if (options.noPublicFiguresAccepted) {
      formData.append('noPublicFiguresAccepted', 'true');
    }

    // Send to server (do NOT set Content-Type — fetch sets multipart/form-data with boundary automatically)
    const response = await apiClient.post<{ status: string; photo: UploadPhotoResult }>(
      '/api/v1/upload/photo',
      formData
    );

    // API returns relative path: /api/v1/assets/... or /api/v1/assets/...?token=...
    // Keep relative - display layer (formatAssetUrl) resolves to current origin
    let photoUrl = response.data.photo.url;
    if (photoUrl.startsWith('/uploads/')) {
      photoUrl = photoUrl.replace('/uploads/', '/api/v1/assets/');
    }

    return {
      ...response.data.photo,
      url: photoUrl,
      storagePath: response.data.photo.storagePath,
    };
  } catch (error) {
    console.error('Photo upload failed:', error);
    throw error;
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
