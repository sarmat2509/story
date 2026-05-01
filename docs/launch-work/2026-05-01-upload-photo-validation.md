# Upload Photo Validation

Date: 2026-05-01

## Scope

- Replaced broad `image/*` upload acceptance with a photo-oriented MIME allowlist.
- Added explicit upload error responses for:
  - unsupported file type
  - files over 10MB
  - malformed multipart uploads
  - files that pass MIME filtering but cannot be decoded as images
- Added a pure MIME policy test.

## Behavior

- Accepted MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/heic`
  - `image/heif`
- Rejected SVG, GIF, text, and octet-stream uploads before preprocessing/storage.
- Invalid image bytes now return `400 INVALID_IMAGE_FILE` instead of a generic server error.

## Verification

- `pnpm --filter wondertales-api exec tsx src/services/__tests__/uploadValidationService.test.ts`
- `pnpm --filter wondertales-api build`
- Live smoke through `http://localhost:8081/api/v1`:
  - registered a temporary parent account
  - uploaded `/etc/hosts` as `text/plain` to `POST /upload/photo`
  - received `400 UNSUPPORTED_PHOTO_TYPE`
  - deleted the temporary account
  - verified no `codex-upload-guard-*` users remained
