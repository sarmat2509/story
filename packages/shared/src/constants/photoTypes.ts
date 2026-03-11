/**
 * Photo type constants - single source of truth for user photos and turnaround sheets.
 * Used by API (storage, validation), universal-app (upload), and routes.
 */

/** User-uploadable photo types (profile, character, child reference photos) */
export const PHOTO_TYPES_USER_UPLOAD = [
  'profile',
  'character',
  'child',
] as const;

/** System-generated turnaround sheet types (AI-generated from reference photos) */
export const PHOTO_TYPES_TURNAROUND = [
  'character_turnaround',
  'child_turnaround',
  'character_front',
  'child_front',
] as const;

/** All photo types (user upload + system-generated) */
export const PHOTO_TYPES_ALL = [
  ...PHOTO_TYPES_USER_UPLOAD,
  ...PHOTO_TYPES_TURNAROUND,
] as const;

export type PhotoTypeUserUpload = (typeof PHOTO_TYPES_USER_UPLOAD)[number];
export type PhotoTypeTurnaround = (typeof PHOTO_TYPES_TURNAROUND)[number];
export type PhotoType = (typeof PHOTO_TYPES_ALL)[number];

/** Type guard: is value a valid user-uploadable photo type */
export function isPhotoTypeUserUpload(value: string): value is PhotoTypeUserUpload {
  return PHOTO_TYPES_USER_UPLOAD.includes(value as PhotoTypeUserUpload);
}

/** Type guard: is value a valid photo type (all) */
export function isPhotoType(value: string): value is PhotoType {
  return PHOTO_TYPES_ALL.includes(value as PhotoType);
}
