import assert from 'node:assert/strict';
import {
  buildPublicAuthorView,
  resolvePublicAuthorDisplayName,
} from '../publicAuthorView';

const author = {
  id: '78f2adf1-6e58-48f7-96d9-cd3df88152a9',
  email: 'parent@example.test',
  role: 'admin',
  displayName: 'Legal Account Name',
  pseudonym: 'Story Pen Name',
  aboutMe: 'Writes bedtime quests.',
  avatarUrl: '/api/v1/assets/public-avatar.png',
  stripeCustomerId: 'cus_secret',
  privateStoryCount: 42,
  unlistedStoryCount: 3,
  childProfiles: [{ name: 'Private child name' }],
};

const publicView = buildPublicAuthorView(author);

assert.deepEqual(Object.keys(publicView).sort(), ['aboutMe', 'avatarUrl', 'displayName', 'id']);
assert.deepEqual(publicView, {
  id: author.id,
  displayName: 'Story Pen Name',
  aboutMe: 'Writes bedtime quests.',
  avatarUrl: '/api/v1/assets/public-avatar.png',
});

assert.equal((publicView as Record<string, unknown>).email, undefined);
assert.equal((publicView as Record<string, unknown>).role, undefined);
assert.equal((publicView as Record<string, unknown>).stripeCustomerId, undefined);
assert.equal((publicView as Record<string, unknown>).privateStoryCount, undefined);
assert.equal((publicView as Record<string, unknown>).unlistedStoryCount, undefined);
assert.equal((publicView as Record<string, unknown>).childProfiles, undefined);

assert.equal(
  resolvePublicAuthorDisplayName({ pseudonym: '  ', displayName: ' Profile Name ' }),
  'Profile Name',
  'blank pseudonyms fall back to trimmed display names'
);
assert.equal(resolvePublicAuthorDisplayName(null), 'Anonymous');

console.log('publicAuthorView tests passed');
