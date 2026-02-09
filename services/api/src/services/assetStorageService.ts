import sharp from 'sharp';
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

interface UploadUserPhotoParams {
  buffer: Buffer;
  mimeType: string;
  userId: string;
  photoType: 'profile' | 'character' | 'child';
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
   * Preprocess user photo before storage.
   * Auto-orients, resizes if too large, conditionally enhances exposure, converts to JPEG.
   * Returns optimized buffer ready for storage and Gemini Vision analysis.
   */
  async preprocessImage(buffer: Buffer): Promise<Buffer> {
    try {
      const stats = await sharp(buffer).stats();
      const meanBrightness = stats.channels.reduce((sum, c) => sum + c.mean, 0) / stats.channels.length;
      const metadata = await sharp(buffer).metadata();

      logger.info({ 
        originalSize: buffer.length, 
        width: metadata.width, 
        height: metadata.height, 
        format: metadata.format,
        meanBrightness: Math.round(meanBrightness) 
      }, 'Preprocessing image');

      let pipeline = sharp(buffer).rotate(); // Auto-orient from EXIF
      let resized = false;
      let enhancement = 'none';

      // Resize if too large (max 2048px on longest side)
      const MAX_DIMENSION = 2048;
      if ((metadata.width && metadata.width > MAX_DIMENSION) || (metadata.height && metadata.height > MAX_DIMENSION)) {
        pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
        resized = true;
      }

      // Conditional exposure enhancement
      if (meanBrightness < 80) {
        pipeline = pipeline.gamma(1.8).normalize().sharpen({ sigma: 0.8 });
        enhancement = 'dark (gamma+normalize+sharpen)';
      } else if (meanBrightness < 140) {
        pipeline = pipeline.normalize();
        enhancement = 'medium (normalize)';
      }

      const result = await pipeline.jpeg({ quality: 85 }).toBuffer();
      
      logger.info({ 
        originalSize: buffer.length, 
        processedSize: result.length, 
        brightness: Math.round(meanBrightness),
        resized, 
        enhancement,
        compressionRatio: `${Math.round((1 - result.length / buffer.length) * 100)}%`
      }, 'Image preprocessed');
      
      return result;
    } catch (error) {
      // If preprocessing fails, return original buffer
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Image preprocessing failed, using original');
      return buffer;
    }
  }

  /**
   * Upload user photo (not story-related)
   */
  async uploadUserPhoto(params: UploadUserPhotoParams): Promise<AssetStorageResult> {
    await this.ensureInitialized();
    
    const { buffer, mimeType, userId, photoType } = params;
    
    // Validate file size
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size ${buffer.length} exceeds maximum allowed size ${MAX_FILE_SIZE}`);
    }
    
    // Validate MIME type
    await this.validateMimeType(buffer, mimeType);
    
    // Generate storage path for user photos
    const extension = this.getExtensionFromMimeType(mimeType);
    const timestamp = Date.now();
    const safeUserId = this.sanitizePath(userId);
    const env = config.nodeEnv;
    
    // Structure: {environment}/{userId}/photos/{photoType}/{timestamp}{ext}
    const storagePath = `${env}/${safeUserId}/photos/${photoType}/${timestamp}${extension}`;
    
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
  
  /**
   * Get asset buffer by storage path (for reference images without asset ID)
   * 
   * @param storagePath - Storage path (e.g., "development/.../image.png")
   * @returns Buffer containing the asset data
   * @throws Error if file doesn't exist
   */
  async getAssetByPath(storagePath: string): Promise<Buffer> {
    await this.ensureInitialized();
    
    // Read from appropriate storage
    if (this.provider === 'local') {
      const filePath = path.join(this.localUploadDir, storagePath);
      
      try {
        const buffer = await fs.readFile(filePath);
        logger.debug({ storagePath, size: buffer.length }, 'Asset buffer loaded from local storage by path');
        return buffer;
      } catch (error) {
        logger.error({ storagePath, filePath, error }, 'Failed to read asset from local storage');
        throw new Error(`Asset file not found: ${filePath}`);
      }
    } else {
      // S3 storage
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      
      const s3Client = new S3Client({
        region: config.storage.region || 'us-east-1',
        credentials: {
          accessKeyId: config.storage.accessKey || '',
          secretAccessKey: config.storage.secretKey || '',
        },
      });

      try {
        const command = new GetObjectCommand({
          Bucket: config.storage.bucket!,
          Key: storagePath,
        });

        const response = await s3Client.send(command);
        const chunks: Uint8Array[] = [];
        
        if (response.Body) {
          // @ts-ignore - Body is a stream
          for await (const chunk of response.Body) {
            chunks.push(chunk);
          }
        }
        
        const buffer = Buffer.concat(chunks);
        logger.debug({ storagePath, size: buffer.length }, 'Asset buffer loaded from S3 by path');
        return buffer;
      } catch (error) {
        logger.error({ storagePath, error }, 'Failed to read asset from S3');
        throw new Error(`Asset file not found in S3: ${storagePath}`);
      }
    }
  }

  /**
   * Get asset buffer from storage (for cache retrieval and audio concatenation)
   * 
   * Retrieves the raw Buffer data for an asset from storage. Used primarily
   * for loading cached scene group audio and FFmpeg concatenation.
   * 
   * @param assetId - Asset UUID from assets table
   * @returns Buffer containing the asset data
   * @throws Error if asset not found or file doesn't exist
   */
  async getAssetBuffer(assetId: string): Promise<Buffer> {
    await this.ensureInitialized();
    
    const { assets } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');
    const { db } = await import('../db');
    
    // Get asset metadata from database
    const [asset] = await db
      .select()
      .from(assets)
      .where(eq(assets.id, assetId))
      .limit(1);

    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // Read from appropriate storage
    if (this.provider === 'local') {
      const filePath = path.join(this.localUploadDir, asset.storagePath);
      
      try {
        const buffer = await fs.readFile(filePath);
        logger.debug({ assetId, storagePath: asset.storagePath, size: buffer.length }, 'Asset buffer loaded from local storage');
        return buffer;
      } catch (error) {
        logger.error({ assetId, filePath, error }, 'Failed to read asset from local storage');
        throw new Error(`Asset file not found: ${filePath}`);
      }
    } else {
      // S3 storage
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      
      const s3Client = new S3Client({
        region: config.storage.region || 'us-east-1',
        credentials: {
          accessKeyId: config.storage.accessKey || '',
          secretAccessKey: config.storage.secretKey || '',
        },
      });

      try {
        const command = new GetObjectCommand({
          Bucket: config.storage.bucket!,
          Key: asset.storagePath,
        });
        
        const response = await s3Client.send(command);
        
        if (!response.Body) {
          throw new Error('Empty response body from S3');
        }
        
        // Convert stream to buffer
        const chunks: Buffer[] = [];
        for await (const chunk of response.Body as any) {
          chunks.push(Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        
        logger.debug({ assetId, storagePath: asset.storagePath, size: buffer.length }, 'Asset buffer loaded from S3');
        return buffer;
      } catch (error) {
        logger.error({ assetId, storagePath: asset.storagePath, error }, 'Failed to read asset from S3');
        throw new Error(`Failed to retrieve asset from S3: ${assetId}`);
      }
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
    
    // For local dev, generate API endpoint URL
    // Frontend will call: http://localhost:8081/api/v1/assets/development/...
    // which proxies to API server: http://localhost:3000/api/v1/assets/development/...
    const storageUrl = `/api/v1/assets/${storagePath}`;
    
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
    const expiresTimestamp = expiresAt.getTime();
    
    // Generate HMAC signature
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET || 'dev-secret-key';
    const token = crypto
      .createHmac('sha256', secret)
      .update(`${storagePath}:${expiresTimestamp}`)
      .digest('hex');
    
    return {
      signedUrl: `/api/v1/assets/${storagePath}?token=${token}&expires=${expiresTimestamp}`,
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
  
  /**
   * Upload voice sample audio
   * Stores sample in voice-samples/{language}/{voiceId}.mp3
   */
  async uploadVoiceSample(params: {
    audioBuffer: Buffer;
    language: string;
    voiceId: string;
  }): Promise<AssetStorageResult> {
    await this.ensureInitialized();
    
    const filename = `${params.voiceId}.mp3`;
    const storagePath = `voice-samples/${params.language}/${filename}`;
    
    logger.info({ 
      language: params.language, 
      voiceId: params.voiceId,
      storagePath,
      bufferSize: params.audioBuffer.length 
    }, 'Uploading voice sample');
    
    // Use private upload methods directly with custom storage path
    if (this.provider === 'local') {
      return await this.uploadToLocal(storagePath, params.audioBuffer, 'audio/mpeg');
    } else {
      return await this.uploadToS3(storagePath, params.audioBuffer, 'audio/mpeg');
    }
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
