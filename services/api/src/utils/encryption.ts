import crypto from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  
  // Key should be 32 bytes (64 hex characters) for AES-256
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  
  return Buffer.from(key, 'hex');
}

// Encrypt sensitive data (OAuth tokens, etc.)
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return '';
  }
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    logger.error({ err: error }, 'Encryption failed');
    throw new Error('Failed to encrypt data');
  }
}

// Decrypt sensitive data
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    return '';
  }
  
  try {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [ivHex, authTagHex, encrypted] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error({ err: error }, 'Decryption failed');
    throw new Error('Failed to decrypt data');
  }
}

// Generate encryption key (for setup)
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Encrypt OAuth token
export function encryptToken(token: string | null): string | null {
  if (!token) {
    return null;
  }
  return encrypt(token);
}

// Decrypt OAuth token
export function decryptToken(encryptedToken: string | null): string | null {
  if (!encryptedToken) {
    return null;
  }
  return decrypt(encryptedToken);
}
