import { getUserRepository } from '../repositories';
import { changePlan, getUserSubscription, initializeUserSubscription } from './planService';
import { getUserById } from './userService';

export async function updateAdminUserSettings(params: {
  userId: string;
  role?: 'user' | 'admin';
  planSlug?: string;
}) {
  const { userId, role, planSlug } = params;

  const existingUser = await getUserById(userId);
  if (!existingUser) {
    return null;
  }

  let updatedUser = existingUser;
  if (role && role !== existingUser.role) {
    updatedUser = await getUserRepository().updateRole(userId, role);
  }

  if (planSlug) {
    const subscription = await getUserSubscription(userId);
    if (subscription) {
      await changePlan(userId, planSlug);
    } else {
      await initializeUserSubscription(userId, planSlug);
    }
  }

  return updatedUser;
}
