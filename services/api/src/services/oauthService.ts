import { eq, and } from 'drizzle-orm';
import db from '../db';
import { oauthIdentities, type User, type OAuthIdentity, type NewOAuthIdentity } from '../db/schema';
import { getUserByEmail, createUser } from './userService';
import { encryptToken, decryptToken } from '../utils/encryption';

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export interface AppleProfile {
  sub: string; // Apple user ID
  email?: string;
  name?: {
    firstName?: string;
    lastName?: string;
  };
}

export interface OAuthResult {
  user: User;
  isNewUser: boolean;
  isNewIdentity: boolean;
}

// Generic OAuth profile (normalized)
interface NormalizedOAuthProfile {
  providerId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

// Generic OAuth tokens
interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// Find existing OAuth identity
async function findOAuthIdentity(
  provider: 'google' | 'apple',
  providerId: string
): Promise<any | null> {
  const [identity] = await db
    .select()
    .from(oauthIdentities)
    .where(
      and(
        eq(oauthIdentities.provider, provider),
        eq(oauthIdentities.providerUserId, providerId)
      )
    )
    .limit(1);
  
  return identity || null;
}

// Update OAuth tokens for existing identity
async function updateOAuthTokens(
  identityId: string,
  tokens: OAuthTokens,
  rawUserInfo: any
): Promise<void> {
  await db
    .update(oauthIdentities)
    .set({
      accessToken: encryptToken(tokens.accessToken)!,
      refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken)! : undefined,
      tokenExpiresAt: tokens.expiresAt || undefined,
      rawUserInfo,
      updatedAt: new Date(),
    })
    .where(eq(oauthIdentities.id, identityId));
}

// Get user by identity's userId
async function getUserByIdentityUserId(userId: string): Promise<User | null> {
  const [user] = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.id, userId),
    limit: 1,
  });
  
  return user || null;
}

// Link or create user for OAuth profile
async function linkOrCreateUser(profile: NormalizedOAuthProfile): Promise<{ user: User; isNew: boolean }> {
  // Try to find existing user by email
  let user = await getUserByEmail(profile.email);
  
  if (user) {
    return { user, isNew: false };
  }
  
  // Create new user
  user = await createUser({
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    preferredLocale: 'uk',
  });
  
  return { user, isNew: true };
}

// Create new OAuth identity
async function createOAuthIdentity(
  userId: string,
  provider: 'google' | 'apple',
  profile: NormalizedOAuthProfile,
  tokens: OAuthTokens,
  rawUserInfo: any
): Promise<void> {
  const newIdentity: NewOAuthIdentity = {
    userId,
    provider,
    providerUserId: profile.providerId,
    providerEmail: profile.email,
    accessToken: encryptToken(tokens.accessToken)!,
    refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken)! : null,
    tokenExpiresAt: tokens.expiresAt || null,
    rawUserInfo,
  };
  
  await db.insert(oauthIdentities).values(newIdentity);
}

// Generic OAuth handler (orchestrates sub-functions)
async function handleOAuthCallback(
  provider: 'google' | 'apple',
  profile: NormalizedOAuthProfile,
  tokens: OAuthTokens,
  rawUserInfo: any
): Promise<OAuthResult> {
  // 1. Try to find existing OAuth identity
  const existingIdentity = await findOAuthIdentity(provider, profile.providerId);
  
  if (existingIdentity) {
    // Update tokens for existing identity
    await updateOAuthTokens(existingIdentity.id, tokens, rawUserInfo);
    
    // Get user
    const user = await getUserByIdentityUserId(existingIdentity.userId);
    
    return {
      user: user!,
      isNewUser: false,
      isNewIdentity: false,
    };
  }
  
  // 2. Link or create user
  const { user, isNew: isNewUser } = await linkOrCreateUser(profile);
  
  // 3. Create OAuth identity
  await createOAuthIdentity(user.id, provider, profile, tokens, rawUserInfo);
  
  // 4. Initialize subscription for new users
  if (isNewUser) {
    const { initializeUserSubscription } = await import('./planService');
    await initializeUserSubscription(user.id, 'free').catch((err) => {
      // Log but don't fail OAuth if subscription init fails
      logger.error({ err, userId: user.id }, 'Failed to initialize subscription for new user');
    });
  }
  
  return {
    user,
    isNewUser,
    isNewIdentity: true,
  };
}

// Handle Google OAuth callback with account linking
export async function handleGoogleCallback(
  profile: GoogleProfile,
  accessToken: string,
  refreshToken?: string
): Promise<OAuthResult> {
  const normalizedProfile: NormalizedOAuthProfile = {
    providerId: profile.id,
    email: profile.email,
    displayName: profile.name,
    avatarUrl: profile.picture,
  };
  
  const tokens: OAuthTokens = {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
  };
  
  return handleOAuthCallback('google', normalizedProfile, tokens, profile);
}

// Handle Apple OAuth callback with account linking
export async function handleAppleCallback(
  profile: AppleProfile,
  idToken: string
): Promise<OAuthResult> {
  const displayName = profile.name
    ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim()
    : undefined;
  
  const normalizedProfile: NormalizedOAuthProfile = {
    providerId: profile.sub,
    email: profile.email || `apple_${profile.sub}@privaterelay.appleid.com`,
    displayName: displayName || 'Apple User',
    avatarUrl: undefined,
  };
  
  const tokens: OAuthTokens = {
    accessToken: idToken,
    refreshToken: undefined,
    expiresAt: undefined, // Apple tokens don't expire like Google
  };
  
  return handleOAuthCallback('apple', normalizedProfile, tokens, profile);
}

// Link OAuth provider to existing user
export async function linkOAuthProvider(
  userId: string,
  provider: 'google' | 'apple',
  providerUserId: string,
  providerEmail: string | null,
  accessToken: string,
  refreshToken: string | null,
  rawUserInfo: any
): Promise<OAuthIdentity> {
  // Check if this provider is already linked
  const [existing] = await db
    .select()
    .from(oauthIdentities)
    .where(
      and(
        eq(oauthIdentities.provider, provider),
        eq(oauthIdentities.providerUserId, providerUserId)
      )
    )
    .limit(1);
  
  if (existing) {
    throw new Error('This OAuth provider is already linked to another account');
  }
  
  const newIdentity: NewOAuthIdentity = {
    userId,
    provider,
    providerUserId,
    providerEmail,
    accessToken: encryptToken(accessToken)!,
    refreshToken: refreshToken ? encryptToken(refreshToken)! : null,
    tokenExpiresAt: provider === 'google' ? new Date(Date.now() + 3600 * 1000) : null,
    rawUserInfo,
  };
  
  const [identity] = await db.insert(oauthIdentities).values(newIdentity).returning();
  return identity;
}

// Unlink OAuth provider from user
export async function unlinkOAuthProvider(
  userId: string,
  provider: 'google' | 'apple'
): Promise<void> {
  // Check if user has other OAuth providers
  const identities = await db
    .select()
    .from(oauthIdentities)
    .where(eq(oauthIdentities.userId, userId));
  
  if (identities.length <= 1) {
    throw new Error('Cannot unlink the only authentication method');
  }
  
  await db
    .delete(oauthIdentities)
    .where(
      and(
        eq(oauthIdentities.userId, userId),
        eq(oauthIdentities.provider, provider)
      )
    );
}
