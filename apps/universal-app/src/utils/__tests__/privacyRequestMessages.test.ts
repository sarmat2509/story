import assert from 'node:assert/strict';
import { buildAccountDataPrivacyRequestMessage } from '../privacyRequestMessages';

assert.equal(
  buildAccountDataPrivacyRequestMessage({ requestType: 'export' }),
  '[account_data_export_request]\nsubmitted_from=profile_privacy_panel'
);

assert.equal(
  buildAccountDataPrivacyRequestMessage({
    requestType: 'deletion',
    submittedFrom: ' profile   screen ',
  }),
  '[account_data_deletion_request]\nsubmitted_from=profile screen'
);

console.log('privacyRequestMessages tests passed');
