import assert from 'node:assert/strict';
import {
  buildChildDataDeletionRequestMessage,
  DEFAULT_CHILD_DATA_DELETION_SCOPES,
} from '../childDataDeletionRequest';

const message = buildChildDataDeletionRequestMessage({
  childId: 'child-123',
  childName: '  Alice   Example  ',
  scopes: DEFAULT_CHILD_DATA_DELETION_SCOPES,
  details: ' Please delete all linked data. \n\n Include any audio. ',
});

assert.match(message, /^\[child_data_deletion_request\]/);
assert.match(message, /child_profile_id=child-123/);
assert.match(message, /child_display_name=Alice Example/);
assert.match(message, /requested_scopes=profile,reference_photos,stories,audio,full_review/);
assert.match(message, /adult_note=Please delete all linked data\.\nInclude any audio\./);
assert.ok(message.length <= 2000);

const fallbackScopeMessage = buildChildDataDeletionRequestMessage({
  childId: '',
  childName: '',
  scopes: [],
  details: 'x'.repeat(3000),
});

assert.match(fallbackScopeMessage, /child_profile_id=unknown/);
assert.match(fallbackScopeMessage, /child_display_name=unknown/);
assert.match(fallbackScopeMessage, /requested_scopes=full_review/);
assert.equal(fallbackScopeMessage.length, 2000);

console.log('childDataDeletionRequest tests passed');
