import { config } from '../config';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface UploadAssetParams {
  data: Buffer | string; // Buffer or base64 string
  mimeType: string;
  userId: string;
  storyId: string;
  sceneId?: string;
  assetType: 'image' | 'audio' | 'video';
}

interface AssetStorageResult {
  storagePath: string;
  storageUrl: string | null;
  signedUrl: string | null;
  signedUrlExpiresAt: Date | null;
  fileSizeBytes: number;
}

/**
 * Asset Storage Service
 * Handles storage of generated assets (images, audio, video)
 * Supports S3 (production) and local filesystem (development)
 */
export class AssetStorageService {
  private readonly provider: 'aws' | 'local';
  private readonly localUploadDir: string;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  
  constructor() {
    // Determine provider based on config
    this.provider = config.storage.bucket && config.storage.accessKey ? 'aws' : 'local';
    this.localUploadDir = path.join(process.cwd(), 'uploads');
    
    logger.info({ provider: this.provider }, 'Asset storage service initialized');
  }
  
  /**
   * Ensure storage is initialized before use
   * Prevents race condition with async constructor
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    
    if (!this.initPromise) {
      this.initPromise = this.initializeStorage().then(() => {
        this.initialized = true;
      });
    }
    
    await this.initPromise;
  }
  
  private async initializeStorage(): Promise<void> {
    if (this.provider === 'local') {
      try {
        await fs.mkdir(this.localUploadDir, { recursive: true });
        logger.info({ path: this.localUploadDir }, 'Local storage directory created');
      } catch (error) {
        logger.error({ error }, 'Failed to create local storage directory');
        throw error;
      }
    }
  }
  
  /**
   * Upload an asset to storage
   */
  async uploadAsset(params: UploadAssetParams): Promise<AssetStorageResult> {
    await this.ensureInitialized();
    
    const { data, mimeType, userId, storyId, sceneId, assetType } = params;
    
    // Convert base64 to buffer if needed
    const buffer = typeof data === 'string' 
      ? Buffer.from(data, 'base64')
      : data;
    
    // Validate file size
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size ${buffer.length} exceeds maximum allowed size ${MAX_FILE_SIZE}`);
    }
    
    // Validate MIME type
    await this.validateMimeType(buffer, mimeType);
    
    // Generate storage path
    const storagePath = this.generateStoragePath(userId, storyId, sceneId, assetType, mimeType);
    
    if (this.provider === 'local') {
      return await this.uploadToLocal(storagePath, buffer, mimeType);
    } else {
      return await this.uploadToS3(storagePath, buffer, mimeType);
    }
  }
  
  /**
   * Validate that declared MIME type matches actual file content
   * Prevents malicious file uploads disguised as images/audio
   */
  private async validateMimeType(buffer: Buffer, declaredMimeType: string): Promise<void> {
    const allowedMimeTypes = [
      'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
      'audio/mpeg', 'audio/mp3', 'audio/wav', 
      'video/mp4'
    ];
    
    if (!allowedMimeTypes.includes(declaredMimeType)) {
      throw new Error(`MIME type ${declaredMimeType} is not allowed`);
    }
    
    // Check magic bytes for common formats
    const magicBytes = buffer.slice(0, 12);
    
    // PNG: 89 50 4E 47
    if (declaredMimeType.startsWith('image/png')) {
      if (!(magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && 
            magicBytes[2] === 0x4E && magicBytes[3] === 0x47)) {
        throw new Error('File content does not match declared PNG MIME type');
      }
    }
    
    // JPEG: FF D8 FF
    if (declaredMimeType.includes('jpeg') || declaredMimeType.includes('jpg')) {
      if (!(magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF)) {
        throw new Error('File content does not match declared JPEG MIME type');
      }
    }
    
    // WebP: RIFF ... WEBP
    if (declaredMimeType.includes('webp')) {
      const riff = magicBytes[0] === 0x52 && magicBytes[1] === 0x49 && 
                   magicBytes[2] === 0x46 && magicBytes[3] === 0x46;
      const webp = magicBytes[8] === 0x57 && magicBytes[9] === 0x45 && 
                   magicBytes[10] === 0x42 && magicBytes[11] === 0x50;
      if (!(riff && webp)) {
        throw new Error('File content does not match declared WebP MIME type');
      }
    }
    
    // MP3: FF FB or FF F3 or FF F2 or ID3
    if (declaredMimeType.includes('mpeg') || declaredMimeType.includes('mp3')) {
      const isMP3 = (magicBytes[0] === 0xFF && (magicBytes[1] & 0xE0) === 0xE0) ||
                    (magicBytes[0] === 0x49 && magicBytes[1] === 0x44 && magicBytes[2] === 0x33);
      if (!isMP3) {
        throw new Error('File content does not match declared MP3 MIME type');
      }
    }
  }
  
  /**
   * Generate a signed URL for accessing an asset
   */
  async generateSignedUrl(storagePath: string, expiresInHours: number = 24): Promise<{ signedUrl: string; expiresAt: Date }> {
    await this.ensureInitialized();
    
    if (this.provider === 'local') {
      return this.generateLocalUrl(storagePath, expiresInHours);
    } else {
      return this.generateS3SignedUrl(storagePath, expiresInHours);
    }
  }
  
  /**
   * Delete an asset from storage
   */
  async deleteAsset(storagePath: string): Promise<void> {
    await this.ensureInitialized();
    
    if (this.provider === 'local') {
      await this.deleteFromLocal(storagePath);
    } else {
      await this.deleteFromS3(storagePath);
    }
  }
  
  // ==========================================
  // PRIVATE METHODS - Local Storage
  // ==========================================
  
  private async uploadToLocal(storagePath: string, buffer: Buffer, mimeType: string): Promise<AssetStorageResult> {
    const fullPath = path.join(this.localUploadDir, storagePath);
    const directory = path.dirname(fullPath);
    
    // Ensure directory exists
    await fs.mkdir(directory, { recursive: true });
    
    // Write file
    await fs.writeFile(fullPath, buffer);
    
    logger.info({ path: storagePath, size: buffer.length }, 'Asset uploaded to local storage');
    
    // For local dev, use HTTP endpoint instead of file:// URLs
    // Note: This requires an assets endpoint to be implemented
    const storageUrl = this.provider === 'local' 
      ? `/api/v1/assets/${storagePath}`
      : fullPath;
    
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    return {
      storagePath,
      storageUrl,
      signedUrl: storageUrl,
      signedUrlExpiresAt: expiresAt,
      fileSizeBytes: buffer.length,
    };
  }
  
  private generateLocalUrl(storagePath: string, expiresInHours: number): { signedUrl: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    
    return {
      signedUrl: `/api/v1/assets/${storagePath}`,
      expiresAt,
    };
  }
  
  private async deleteFromLocal(storagePath: string): Promise<void> {
    const fullPath = path.join(this.localUploadDir, storagePath);
    
    try {
      await fs.unlink(fullPath);
      logger.info({ path: storagePath }, 'Asset deleted from local storage');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error({ error, path: storagePath }, 'Failed to delete asset from local storage');
        throw error;
      }
      // File doesn't exist, ignore
    }
  }
  
  // ==========================================
  // PRIVATE METHODS - S3 Storage
  // ==========================================
  
  private async uploadToS3(storagePath: string, buffer: Buffer, mimeType: string): Promise<AssetStorageResult> {
    // TODO: Implement S3 upload using AWS SDK
    // For now, throw error as S3 is not yet implemented
    throw new Error('S3 storage not yet implemented. Use local storage for MVP.');
    
    // Future implementation:
    // const s3 = new S3Client({ region: config.storage.region });
    // await s3.send(new PutObjectCommand({
    //   Bucket: config.storage.bucket,
    //   Key: storagePath,
    //   Body: buffer,
    //   ContentType: mimeType,
    // }));
  }
  
  private generateS3SignedUrl(storagePath: string, expiresInHours: number): { signedUrl: string; expiresAt: Date } {
    // TODO: Implement S3 signed URL generation
    throw new Error('S3 storage not yet implemented');
    
    // Future implementation:
    // const command = new GetObjectCommand({
    //   Bucket: config.storage.bucket,
    //   Key: storagePath,
    // });
    // const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInHours * 3600 });
  }
  
  private async deleteFromS3(storagePath: string): Promise<void> {
    // TODO: Implement S3 delete
    throw new Error('S3 storage not yet implemented');
    
    // Future implementation:
    // await s3.send(new DeleteObjectCommand({
    //   Bucket: config.storage.bucket,
    //   Key: storagePath,
    // }));
  }
  
  // ==========================================
  // HELPER METHODS
  // ==========================================
  
  /**
   * Sanitize path component to prevent path traversal attacks
   */
  private sanitizePath(input: string): string {
    // Remove any path traversal attempts, special characters, and whitespace
    return input.replace(/[\.\/\\:\*\?"<>\|\s]/g, '_');
  }
  
  private generateStoragePath(
    userId: string, 
    storyId: string, 
    sceneId: string | undefined, 
    assetType: string,
    mimeType: string
  ): string {
    const extension = this.getExtensionFromMimeType(mimeType);
    
    // Sanitize all path components to prevent path traversal
    const safeUserId = this.sanitizePath(userId);
    const safeStoryId = this.sanitizePath(storyId);
    const safeSceneId = sceneId ? this.sanitizePath(sceneId) : crypto.randomUUID();
    const safeAssetType = this.sanitizePath(assetType);
    
    const filename = sceneId 
      ? `${safeSceneId}${extension}`
      : `${crypto.randomUUID()}${extension}`;
    
    const env = config.nodeEnv;
    
    // Structure: {environment}/{userId}/{storyId}/{assetType}/{filename}
    return `${env}/${safeUserId}/${safeStoryId}/${safeAssetType}/${filename}`;
  }
  
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'video/mp4': '.mp4',
    };
    
    return mimeToExt[mimeType] || '.bin';
  }
}

// Singleton instance
let assetStorageServiceInstance: AssetStorageService | null = null;

export function getAssetStorageService(): AssetStorageService {
  if (!assetStorageServiceInstance) {
    assetStorageServiceInstance = new AssetStorageService();
  }
  return assetStorageServiceInstance;
}

export default getAssetStorageService;
