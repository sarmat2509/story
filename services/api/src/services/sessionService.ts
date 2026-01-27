import { eq, and, lt, gt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { sessions, users, type Session, type NewSession, type User } from '../db/schema';
import config from '../config';
import { logger } from '../utils/logger';

export interface CreateSessionInput {
  userId: string;
  deviceName?: string;
  deviceType?: 'ios' | 'android' | 'web';
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionData {
  id: string;
  userId: string;
  token: string;
  deviceName: string | null;
  deviceType: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

// Parse session expires duration (e.g., "30d" -> 30 days in ms)
function parseExpiresDuration(duration: string): number {
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

// Create new session
export async function createSession(input: CreateSessionInput): Promise<SessionData> {
  const token = uuidv4();
  const expiresInMs = parseExpiresDuration(config.session.expiresIn);
  const expiresAt = new Date(Date.now() + expiresInMs);
  
  const newSession: NewSession = {
    userId: input.userId,
    token,
    deviceName: input.deviceName || null,
    deviceType: input.deviceType || null,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
    expiresAt,
  };
  
  const [session] = await db.insert(sessions).values(newSession).returning();
  
  return session as SessionData;
}

// Get session by token
export async function getSession(token: string): Promise<SessionData | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);
  
  return (session as SessionData) || null;
}

// Validate session (check existence and expiry)
export async function validateSession(token: string): Promise<boolean> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.token, token),
        gt(sessions.expiresAt, new Date()) // FIX: gt = greater than (valid session)
      )
    )
    .limit(1);
  
  return !!session;
}

// Get session with user (for auth middleware)
export async function getSessionWithUser(
  sessionId: string
): Promise<{ session: Session; user: User } | null> {
  const [result] = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);
  
  return result || null;
}

// Update last active timestamp
export async function updateLastActive(token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessions.token, token));
}

// Delete session (logout)
export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

// Delete all user sessions (force logout all devices)
export async function deleteAllUserSessions(userId: string): Promise<number> {
  const result = await db.delete(sessions).where(eq(sessions.userId, userId));
  return result.rowCount || 0;
}

// Get all active sessions for a user
export async function getUserSessions(userId: string): Promise<SessionData[]> {
  const userSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(sessions.lastActiveAt);
  
  // Filter out expired sessions
  const now = new Date();
  return userSessions.filter((s) => s.expiresAt > now) as SessionData[];
}

// Cleanup expired sessions (cron job)
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return result.rowCount || 0;
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

// Handle process termination
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, stopping cleanup job...');
  stopSessionCleanupJob();
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, stopping cleanup job...');
  stopSessionCleanupJob();
});
