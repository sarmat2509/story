import type { PrivacyRequestType } from '@/api/privacyRequests';

interface BuildAccountDataPrivacyRequestMessageInput {
  requestType: PrivacyRequestType;
  submittedFrom?: string;
}

export function buildAccountDataPrivacyRequestMessage({
  requestType,
  submittedFrom = 'profile_privacy_panel',
}: BuildAccountDataPrivacyRequestMessageInput): string {
  const marker =
    requestType === 'export' ? 'account_data_export_request' : 'account_data_deletion_request';

  return [
    `[${marker}]`,
    `submitted_from=${submittedFrom.replace(/\s+/g, ' ').trim() || 'profile_privacy_panel'}`,
  ].join('\n');
}
