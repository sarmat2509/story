import type { PhotoTypeUserUpload } from '@wondertales/shared';
import { isPhotoTypeUserUpload } from '@wondertales/shared';

export type PhotoInputSafetyCode =
  | 'PHOTO_URL_NOT_ALLOWED'
  | 'PHOTO_PATH_INVALID'
  | 'PHOTO_OWNER_MISMATCH'
  | 'PHOTO_TYPE_NOT_ALLOWED';

export type PhotoInputSafetyDecision =
  | { allowed: true; paths: string[] }
  | {
      allowed: false;
      statusCode: 400 | 403;
      code: PhotoInputSafetyCode;
      message: string;
      index: number;
    };

export class PhotoInputSafetyError extends Error {
  readonly statusCode: 400 | 403;
  readonly code: PhotoInputSafetyCode;
  readonly index: number;

  constructor(decision: Exclude<PhotoInputSafetyDecision, { allowed: true }>) {
    super(decision.message);
    this.name = 'PhotoInputSafetyError';
    this.statusCode = decision.statusCode;
    this.code = decision.code;
    this.index = decision.index;
  }
}

export function isPhotoInputSafetyError(error: unknown): error is PhotoInputSafetyError {
  return error instanceof PhotoInputSafetyError;
}

function stripQueryAndHash(value: string): string {
  return value.split('?')[0].split('#')[0];
}

function extractAssetPathFromPhotoUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, 'http://local.invalid');
    const prefix = '/api/v1/assets/';
    const prefixIndex = parsed.pathname.indexOf(prefix);
    if (prefixIndex !== -1) {
      return decodeURIComponent(parsed.pathname.slice(prefixIndex + prefix.length));
    }
  } catch {
    // Fall through to relative-path parsing.
  }

  const withoutQuery = stripQueryAndHash(trimmed);
  const prefix = '/api/v1/assets/';
  if (withoutQuery.startsWith(prefix)) {
    return decodeURIComponent(withoutQuery.slice(prefix.length));
  }

  const relative = withoutQuery.replace(/^\/+/, '');
  if (relative.includes('/photos/')) {
    return decodeURIComponent(relative);
  }

  return null;
}

function isSafeRelativeAssetPath(path: string): boolean {
  if (!path || path.includes('\0')) return false;
  const parts = path.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

export function evaluateUserPhotoInputs(input: {
  photos: unknown[];
  userId: string;
  allowedPhotoTypes: PhotoTypeUserUpload[];
}): PhotoInputSafetyDecision {
  const allowedTypes = new Set(input.allowedPhotoTypes);
  const paths: string[] = [];

  for (let index = 0; index < input.photos.length; index++) {
    const raw = input.photos[index];
    if (typeof raw !== 'string') {
      return {
        allowed: false,
        statusCode: 400,
        code: 'PHOTO_URL_NOT_ALLOWED',
        message: 'Photo must be an uploaded WonderTales asset URL',
        index,
      };
    }

    const path = extractAssetPathFromPhotoUrl(raw);
    if (!path || !isSafeRelativeAssetPath(path)) {
      return {
        allowed: false,
        statusCode: 400,
        code: 'PHOTO_URL_NOT_ALLOWED',
        message: 'Photo must be an uploaded WonderTales asset URL',
        index,
      };
    }

    const parts = path.split('/');
    if (parts.length < 5 || parts[2] !== 'photos') {
      return {
        allowed: false,
        statusCode: 400,
        code: 'PHOTO_PATH_INVALID',
        message: 'Photo URL has an invalid asset path',
        index,
      };
    }

    const [, ownerUserId, , photoType] = parts;
    if (ownerUserId !== input.userId) {
      return {
        allowed: false,
        statusCode: 403,
        code: 'PHOTO_OWNER_MISMATCH',
        message: 'Photo does not belong to the authenticated user',
        index,
      };
    }

    if (!isPhotoTypeUserUpload(photoType) || !allowedTypes.has(photoType)) {
      return {
        allowed: false,
        statusCode: 400,
        code: 'PHOTO_TYPE_NOT_ALLOWED',
        message: 'Photo type is not allowed for this action',
        index,
      };
    }

    paths.push(path);
  }

  return { allowed: true, paths };
}

export function assertUserPhotoInputs(input: {
  photos: unknown[];
  userId: string;
  allowedPhotoTypes: PhotoTypeUserUpload[];
}): string[] {
  const decision = evaluateUserPhotoInputs(input);
  if (decision.allowed === true) {
    return decision.paths;
  }
  throw new PhotoInputSafetyError(decision);
}

export function getReferencePhotoUrls(referencePhotos: unknown): string[] {
  if (!Array.isArray(referencePhotos)) {
    return [];
  }
  return referencePhotos
    .map((photo) =>
      photo && typeof photo === 'object' && typeof (photo as { url?: unknown }).url === 'string'
        ? (photo as { url: string }).url
        : null
    )
    .filter((url): url is string => url != null);
}
