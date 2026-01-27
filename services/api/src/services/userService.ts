import { eq } from 'drizzle-orm';
import db from '../db';
import { users, oauthIdentities, type User, type NewUser, type OAuthIdentity } from '../db/schema';

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
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user || null;
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user || null;
}

// Create new user
export async function createUser(data: CreateUserInput): Promise<User> {
  const newUser: NewUser = {
    email: data.email,
    displayName: data.displayName || null,
    avatarUrl: data.avatarUrl || null,
    preferredLocale: data.preferredLocale || 'uk',
  };
  
  const [user] = await db.insert(users).values(newUser).returning();
  return user;
}

// Update user
export async function updateUser(id: string, data: UpdateUserInput): Promise<User> {
  const updateData: Partial<NewUser> = {
    ...data,
    updatedAt: new Date(),
  };
  
  const [user] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, id))
    .returning();
  
  return user;
}

// Delete user (cascades to oauth_identities and sessions)
export async function deleteUser(id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

// Get user with OAuth providers
export async function getUserWithOAuth(id: string): Promise<UserWithOAuth | null> {
  const user = await getUserById(id);
  
  if (!user) {
    return null;
  }
  
  const identities = await db
    .select({
      provider: oauthIdentities.provider,
      providerEmail: oauthIdentities.providerEmail,
    })
    .from(oauthIdentities)
    .where(eq(oauthIdentities.userId, id));
  
  return {
    ...user,
    oauthProviders: identities,
  };
}

// Get OAuth identities for user
export async function getUserOAuthIdentities(userId: string): Promise<OAuthIdentity[]> {
  return await db
    .select()
    .from(oauthIdentities)
    .where(eq(oauthIdentities.userId, userId));
}

// Count OAuth identities for user
export async function countUserOAuthIdentities(userId: string): Promise<number> {
  const identities = await getUserOAuthIdentities(userId);
  return identities.length;
}
