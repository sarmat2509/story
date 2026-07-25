import { v4 as uuidv4 } from 'uuid';
import { getSessionRepository } from '../repositories';
import type { Session, User, NewSession } from '../db/schema';
import config from '../config';
import { logger } from '../utils/logger';
import {
  activatePromoAccountOnFirstAuthentication,
  isPromoAccountExpired,
  suspendExpiredPromoAccount,
} from './promoAccountService';

export type SessionMode = 'parent' | 'child';

export interface CreateSessionInput {
  userId: string;
  mode?: SessionMode;
  parentUserId?: string;
  childProfileId?: string;
  scopes?: string[];
  deviceName?: string;
  deviceType?: 'ios' | 'android' | 'web';
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionData {
  id: string;
  userId: string;
  mode: SessionMode;
  parentUserId: string | null;
  childProfileId: string | null;
  scopes: string[];
  token: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

// Parse session duration (e.g., "30d" -> 30 days in ms)
export function parseSessionDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)([dhms])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  
  return value * multipliers[unit];
}

export function getSessionDurationMsForMode(mode: SessionMode): number {
  return parseSessionDurationMs(
    mode === 'child' ? config.session.childExpiresIn : config.session.expiresIn
  );
}

export function getChildSessionIdleTimeoutMs(): number {
  return parseSessionDurationMs(config.session.childIdleTimeout);
}

export function getChildSessionActiveAfter(now = new Date()): Date {
  return new Date(now.getTime() - getChildSessionIdleTimeoutMs());
}

export function isSessionRecordActive(
  session: Pick<SessionData, 'mode' | 'lastActiveAt' | 'expiresAt' | 'revokedAt'>,
  now = new Date()
): boolean {
  if (session.revokedAt) {
    return false;
  }
  if (session.expiresAt <= now) {
    return false;
  }
  if (session.mode === 'child' && session.lastActiveAt <= getChildSessionActiveAfter(now)) {
    return false;
  }
  return true;
}

// Create new session
export async function createSession(input: CreateSessionInput): Promise<SessionData> {
  await activatePromoAccountOnFirstAuthentication(input.userId);
  const token = uuidv4();
  const mode = input.mode || 'parent';
  const expiresInMs = getSessionDurationMsForMode(mode);
  const expiresAt = new Date(Date.now() + expiresInMs);
  
  const newSession: NewSession = {
    userId: input.userId,
    mode,
    parentUserId: input.parentUserId || input.userId,
    childProfileId: input.childProfileId || null,
    scopes: input.scopes || [],
    token,
    deviceName: input.deviceName || null,
    deviceType: input.deviceType || null,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    expiresAt,
  };
  
  const session = await getSessionRepository().create(newSession);
  return session as SessionData;
}

// Get session by token
export async function getSession(token: string): Promise<SessionData | null> {
  const session = await getSessionRepository().findByToken(token);
  return (session as SessionData) || null;
}

// Validate session (check existence and expiry)
export async function validateSession(token: string): Promise<boolean> {
  const session = await getSessionRepository().findValidByToken(token);
  return !!session;
}

// Get session with user (for auth middleware)
export async function getSessionWithUser(
  sessionId: string
): Promise<{ session: Session; user: User } | null> {
  const result = await getSessionRepository().findValidByIdWithUser(sessionId);
  if (!result) {
    return null;
  }

  if (!isSessionRecordActive(result.session as SessionData)) {
    await getSessionRepository().revokeById(sessionId);
    logger.info(
      { sessionId, mode: result.session.mode, userId: result.user.id },
      'Session rejected by idle/expiry policy'
    );
    return null;
  }

  if (isPromoAccountExpired(result.user)) {
    await suspendExpiredPromoAccount(result.user.id);
    logger.info(
      { sessionId, userId: result.user.id },
      'Session rejected because the promo account has expired'
    );
    return null;
  }

  return result;
}

// Update last active timestamp
export async function updateLastActive(token: string): Promise<void> {
  await getSessionRepository().updateLastActive(token);
}

// Delete session (logout)
export async function deleteSession(token: string): Promise<void> {
  await getSessionRepository().deleteByToken(token);
}

// Delete all user sessions (force logout all devices)
export async function deleteAllUserSessions(userId: string): Promise<number> {
  return getSessionRepository().deleteByUserId(userId);
}

// Get all active sessions for a user
export async function getUserSessions(userId: string): Promise<SessionData[]> {
  const userSessions = await getSessionRepository().findByUserId(userId);
  return (userSessions as SessionData[]).filter((session) => isSessionRecordActive(session));
}

// Cleanup expired sessions (cron job)
export async function cleanupExpiredSessions(): Promise<number> {
  return getSessionRepository().deleteExpired();
}

// Cleanup interval ID for proper cleanup
let cleanupIntervalId: NodeJS.Timeout | null = null;

// Schedule cleanup job (run every hour)
export function startSessionCleanupJob(): void {
  // Clear existing interval if any (prevents duplicates on hot reload)
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    logger.warn('Cleared existing session cleanup job');
  }
  
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  
  cleanupIntervalId = setInterval(async () => {
    try {
      const deletedCount = await cleanupExpiredSessions();
      if (deletedCount > 0) {
        logger.info({ deletedCount }, 'Cleaned up expired sessions');
      }
    } catch (error) {
      logger.error({ err: error }, 'Session cleanup job failed');
    }
  }, CLEANUP_INTERVAL);
  
  logger.info({ interval: CLEANUP_INTERVAL }, 'Session cleanup job started');
}

// Stop cleanup job (for graceful shutdown)
export function stopSessionCleanupJob(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.info('Session cleanup job stopped');
  }
}

// Session cleanup is stopped centrally via gracefulShutdown in db/index.ts
