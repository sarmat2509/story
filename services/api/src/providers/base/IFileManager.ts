/**
 * Provider-agnostic File Manager Interface
 * Abstracts file upload/delete operations for AI providers that support
 * persistent file references (e.g., Google Files API).
 *
 * This avoids re-sending large inline base64 payloads on every request.
 * Uploaded files can be referenced by URI in subsequent generation calls.
 */

/**
 * Represents a file that has been uploaded to a provider's file storage.
 */
export interface UploadedFile {
  /** Provider URI for referencing this file in API calls */
  uri: string;
  /** Provider-internal file name/ID (e.g. "files/abc123") */
  name: string;
  /** MIME type of the uploaded file */
  mimeType: string;
  /** Optional human-readable display name */
  displayName?: string;
}

/**
 * IFileManager — provider-agnostic interface for file upload/delete.
 *
 * Implementations may include in-memory caching to avoid re-uploading
 * the same file across multiple generation requests.
 */
export interface IFileManager {
  /**
   * Upload a file buffer to the provider's file storage.
   * @param buffer   - Raw file data
   * @param mimeType - MIME type (e.g. 'image/jpeg')
   * @param displayName - Optional human-readable name for the file
   * @param cacheKey - Optional key for in-memory cache (e.g. storage path).
   *                   When provided, the implementation should check its cache
   *                   before uploading and return the cached entry if still valid.
   * @returns Uploaded file metadata including the URI for referencing
   */
  upload(
    buffer: Buffer,
    mimeType: string,
    displayName?: string,
    cacheKey?: string,
  ): Promise<UploadedFile>;

  /**
   * Delete a previously uploaded file from the provider's storage.
   * Also removes the file from any internal cache.
   * @param fileName - Provider-internal file name (e.g. "files/abc123")
   */
  delete(fileName: string): Promise<void>;
}
