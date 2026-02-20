/**
 * GeminiFileManager — Google Files API implementation of IFileManager.
 *
 * Uploads files to Google's Files API and caches the results in memory
 * so the same turnaround sheet is not re-uploaded across multiple story
 * generations within the same process lifetime.
 *
 * Files uploaded to Google Files API have a 48-hour TTL and auto-expire.
 * We use a 47-hour safety margin to avoid using stale URIs.
 */

import type { GoogleGenAI } from '@google/genai';
import type { IFileManager, UploadedFile } from '../../base/IFileManager';
import { logger } from '../../../utils/logger';

/** Maximum age (ms) before we consider a cached file potentially expired. 47 hours. */
const CACHE_TTL_MS = 47 * 60 * 60 * 1000;

interface CacheEntry {
  file: UploadedFile;
  uploadedAt: number;
}

export class GeminiFileManager implements IFileManager {
  private cache = new Map<string, CacheEntry>();

  constructor(private client: GoogleGenAI) {}

  /**
   * Upload a buffer to Google Files API.
   * If a cacheKey is provided and a valid cached entry exists, the cached
   * UploadedFile is returned without re-uploading.
   */
  async upload(
    buffer: Buffer,
    mimeType: string,
    displayName?: string,
    cacheKey?: string,
  ): Promise<UploadedFile> {
    // --- Check cache ---
    if (cacheKey && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      const age = Date.now() - cached.uploadedAt;

      if (age < CACHE_TTL_MS) {
        try {
          const existing = await this.client.files.get({ name: cached.file.name });
          if (existing.state === 'ACTIVE') {
            logger.debug({
              cacheKey,
              fileName: cached.file.name,
              ageMinutes: Math.round(age / 60_000),
            }, 'GeminiFileManager: cache hit — reusing uploaded file');
            return cached.file;
          }
          logger.info({ cacheKey, state: existing.state }, 'GeminiFileManager: cached file not ACTIVE, re-uploading');
        } catch (err) {
          // File may have been deleted or expired — re-upload below
          logger.info({ cacheKey, error: err }, 'GeminiFileManager: cached file check failed, re-uploading');
        }
      } else {
        logger.debug({ cacheKey, ageHours: (age / 3_600_000).toFixed(1) }, 'GeminiFileManager: cache entry expired');
      }
      this.cache.delete(cacheKey);
    }

    // --- Upload ---
    logger.info({
      mimeType,
      displayName,
      bufferSize: buffer.length,
      cacheKey: cacheKey || undefined,
    }, 'GeminiFileManager: uploading file to Google Files API');

    const blob = new Blob([buffer], { type: mimeType });

    const uploaded = await this.client.files.upload({
      file: blob,
      config: {
        mimeType,
        displayName: displayName || undefined,
      },
    });

    if (!uploaded.uri || !uploaded.name) {
      throw new Error(
        `GeminiFileManager: upload returned incomplete file object (uri=${uploaded.uri}, name=${uploaded.name})`,
      );
    }

    // For images the file should be ACTIVE immediately, but poll just in case
    if (uploaded.state && uploaded.state !== 'ACTIVE') {
      await this.waitForActive(uploaded.name);
    }

    const result: UploadedFile = {
      uri: uploaded.uri,
      name: uploaded.name,
      mimeType: uploaded.mimeType || mimeType,
      displayName: uploaded.displayName || displayName,
    };

    // --- Update cache ---
    if (cacheKey) {
      this.cache.set(cacheKey, { file: result, uploadedAt: Date.now() });
    }

    logger.info({
      fileName: result.name,
      uri: result.uri,
      cacheKey: cacheKey || undefined,
    }, 'GeminiFileManager: file uploaded successfully');

    return result;
  }

  /**
   * Delete a file from Google Files API and remove from cache.
   */
  async delete(fileName: string): Promise<void> {
    try {
      await this.client.files.delete({ name: fileName });
      logger.debug({ fileName }, 'GeminiFileManager: file deleted');
    } catch (err) {
      // Not critical — files auto-expire after 48h
      logger.warn({ fileName, error: err }, 'GeminiFileManager: failed to delete file (non-critical)');
    }

    // Remove from cache (find by fileName)
    for (const [key, entry] of this.cache.entries()) {
      if (entry.file.name === fileName) {
        this.cache.delete(key);
        break;
      }
    }
  }

  /**
   * Poll until the file reaches ACTIVE state (needed for video/large files).
   * Images should be ACTIVE immediately, so this is a safety fallback.
   */
  private async waitForActive(fileName: string, maxWaitMs = 30_000): Promise<void> {
    const start = Date.now();
    let delayMs = 1000;

    while (Date.now() - start < maxWaitMs) {
      const file = await this.client.files.get({ name: fileName });
      if (file.state === 'ACTIVE') return;
      if (file.state === 'FAILED') {
        throw new Error(`GeminiFileManager: file processing failed (name=${fileName})`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, 5000); // exponential backoff, cap at 5s
    }

    throw new Error(`GeminiFileManager: file did not become ACTIVE within ${maxWaitMs}ms (name=${fileName})`);
  }
}
