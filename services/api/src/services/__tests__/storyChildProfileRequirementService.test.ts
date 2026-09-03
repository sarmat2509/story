import assert from 'node:assert/strict';
import { clearRepositoryTestOverrides, installRepositoryTestOverrides } from '../../repositories';
import {
  assertParentStoryChildProfile,
  assertSelectedChildCharactersHaveTurnarounds,
  isStoryChildProfileRequirementError,
} from '../storyChildProfileRequirementService';

const userId = 'a1111111-1111-4111-8111-111111111111';
const childProfileId = 'a2222222-2222-4222-8222-222222222222';
const childCharacterId = 'a4444444-4444-4444-8444-444444444444';
const otherCharacterId = 'a5555555-5555-4555-8555-555555555555';

async function main() {
  installRepositoryTestOverrides({
    childProfile: {
      findById: async (id: string, ownerId: string) =>
        id === childProfileId && ownerId === userId
          ? { id: childProfileId, userId, isActive: true, turnaroundSheet: { url: '/model.png' } }
          : null,
    } as any,
    character: {
      findByIds: async (_ownerId: string, ids: string[]) =>
        ids.includes(childCharacterId)
          ? [{ id: childCharacterId, childProfileId, turnaroundSheet: { url: '/model.png' } }]
          : [],
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
    await assert.doesNotReject(() =>
      assertSelectedChildCharactersHaveTurnarounds(userId, undefined)
    );
    await assert.doesNotReject(() => assertSelectedChildCharactersHaveTurnarounds(userId, []));
    await assert.doesNotReject(() =>
      assertSelectedChildCharactersHaveTurnarounds(userId, [childCharacterId])
    );
    installRepositoryTestOverrides({
      character: {
        findByIds: async () => [{ id: childCharacterId, childProfileId, turnaroundSheet: null }],
      } as any,
    });
    await assert.rejects(
      () => assertSelectedChildCharactersHaveTurnarounds(userId, [childCharacterId]),
      (error: unknown) =>
        isStoryChildProfileRequirementError(error) &&
        error.code === 'CHILD_TURNAROUND_REQUIRED' &&
        error.childProfileId === childProfileId
    );
    installRepositoryTestOverrides({
      character: {
        findByIds: async () => [
          { id: otherCharacterId, childProfileId: null, turnaroundSheet: null },
        ],
      } as any,
    });
    await assert.doesNotReject(() =>
      assertSelectedChildCharactersHaveTurnarounds(userId, [otherCharacterId])
    );
  } finally {
    clearRepositoryTestOverrides();
  }

  console.log('story child profile requirement service tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
