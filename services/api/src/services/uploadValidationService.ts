export const ALLOWED_USER_PHOTO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function isAllowedUserPhotoMimeType(mimeType: string): boolean {
  return ALLOWED_USER_PHOTO_MIME_TYPES.has(mimeType.toLowerCase());
}
