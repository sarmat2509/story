import { getUserRepository, getOAuthRepository } from '../repositories';
import type { User, OAuthIdentity } from '../db/schema';

export interface CreateUserInput {
  email: string;
  displayName?: string;
  avatarUrl?: string;
  preferredLocale?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  avatarUrl?: string;
  preferredLocale?: string;
}

export interface UserWithOAuth extends User {
  oauthProviders: Array<{
    provider: string;
    providerEmail: string | null;
  }>;
}

// Get user by ID
export async function getUserById(id: string): Promise<User | null> {
  return getUserRepository().findById(id);
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  return getUserRepository().findByEmail(email);
}

// Create new user
export async function createUser(data: CreateUserInput): Promise<User> {
  return getUserRepository().create(data);
}

// Update user
export async function updateUser(id: string, data: UpdateUserInput): Promise<User> {
  return getUserRepository().update(id, data);
}

// Delete user (cascades to oauth_identities and sessions)
export async function deleteUser(id: string): Promise<void> {
  return getUserRepository().delete(id);
}

// Get user with OAuth providers
export async function getUserWithOAuth(id: string): Promise<UserWithOAuth | null> {
  const user = await getUserById(id);

  if (!user) {
    return null;
  }

  const identities = await getOAuthRepository().findProvidersByUserId(id);

  return {
    ...user,
    oauthProviders: identities,
  };
}

// Get OAuth identities for user
export async function getUserOAuthIdentities(userId: string): Promise<OAuthIdentity[]> {
  return getOAuthRepository().findByUserId(userId);
}

// Count OAuth identities for user
export async function countUserOAuthIdentities(userId: string): Promise<number> {
  const identities = await getUserOAuthIdentities(userId);
  return identities.length;
}
