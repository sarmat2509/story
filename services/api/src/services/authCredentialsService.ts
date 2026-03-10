import type { User } from '../db/schema';
import { getUserByEmail, createUser } from './userService';
import { getUserRepository } from '../repositories';
import { getPasswordResetTokenRepository } from '../repositories';
import { hashPassword, verifyPassword } from './passwordService';
import { sendPasswordResetEmail } from './emailService';
import config from '../config';
import { logger } from '../utils/logger';

const RESET_TOKEN_EXPIRY_HOURS = 1;

export async function loginWithPassword(
  email: string,
  password: string
): Promise<User | null> {
  const user = await getUserByEmail(email);
  if (!user) {
    return null;
  }
  if (!user.passwordHash) {
    return null; // OAuth-only user, cannot login with password
  }
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? user : null;
}

export async function register(
  email: string,
  password: string
): Promise<{ user: User; isNewUser: boolean }> {
  const existing = await getUserByEmail(email);
  if (existing) {
    if (existing.passwordHash) {
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }
    // OAuth-only user: add password (account linking)
    const passwordHash = await hashPassword(password);
    const userRepo = getUserRepository();
    const updated = await userRepo.update(existing.id, { passwordHash });
    logger.info({ userId: existing.id }, 'Password linked to OAuth account');
    return { user: updated, isNewUser: false };
  }

  // New user
  const passwordHash = await hashPassword(password);
  const user = await createUser({
    email,
    passwordHash,
    preferredLocale: 'uk',
  });

  const { initializeUserSubscription } = await import('./planService');
  await initializeUserSubscription(user.id, 'free').catch((err) => {
    logger.error({ err, userId: user.id }, 'Failed to initialize subscription for new user');
  });

  return { user, isNewUser: true };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash) {
    // Don't reveal whether email exists - always return success
    return;
  }

  const tokenRepo = getPasswordResetTokenRepository();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const tokenRow = await tokenRepo.create(user.id, expiresAt);

  const frontendUrl = config.web.webAppUrl;
  const resetLink = `${frontendUrl}/auth/reset-password?token=${tokenRow.token}`;

  await sendPasswordResetEmail(user.email, resetLink);
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<User> {
  const tokenRepo = getPasswordResetTokenRepository();
  const tokenRow = await tokenRepo.findByToken(token);
  if (!tokenRow) {
    throw new Error('INVALID_OR_EXPIRED_TOKEN');
  }

  const passwordHash = await hashPassword(newPassword);
  const userRepo = getUserRepository();
  const user = await userRepo.update(tokenRow.userId, { passwordHash });
  await tokenRepo.deleteByToken(token);

  return user;
}
