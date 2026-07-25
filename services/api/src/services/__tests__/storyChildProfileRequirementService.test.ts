import assert from 'node:assert/strict';
import { clearRepositoryTestOverrides, installRepositoryTestOverrides } from '../../repositories';
import {
  assertParentStoryChildProfile,
  isStoryChildProfileRequirementError,
} from '../storyChildProfileRequirementService';

const userId = 'a1111111-1111-4111-8111-111111111111';
const childProfileId = 'a2222222-2222-4222-8222-222222222222';

async function main() {
  installRepositoryTestOverrides({
    childProfile: {
      findById: async (id: string, ownerId: string) =>
        id === childProfileId && ownerId === userId
          ? { id: childProfileId, userId, isActive: true }
          : null,
    } as any,
  });

  try {
    await assert.rejects(
      () => assertParentStoryChildProfile(userId, undefined),
      (error: unknown) =>
        isStoryChildProfileRequirementError(error) && error.code === 'CHILD_PROFILE_REQUIRED'
    );
    await assert.rejects(
      () => assertParentStoryChildProfile(userId, 'a3333333-3333-4333-8333-333333333333'),
      (error: unknown) =>
        isStoryChildProfileRequirementError(error) && error.code === 'CHILD_PROFILE_NOT_FOUND'
    );
    await assert.doesNotReject(() => assertParentStoryChildProfile(userId, childProfileId));
  } finally {
    clearRepositoryTestOverrides();
  }

  console.log('story child profile requirement service tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
