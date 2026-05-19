export const CHILD_DATA_DELETION_SCOPE_KEYS = [
  'profile',
  'reference_photos',
  'stories',
  'audio',
  'full_review',
] as const;

export type ChildDataDeletionScope = (typeof CHILD_DATA_DELETION_SCOPE_KEYS)[number];

export const DEFAULT_CHILD_DATA_DELETION_SCOPES: readonly ChildDataDeletionScope[] = [
  'profile',
  'reference_photos',
  'stories',
  'audio',
  'full_review',
];

const MAX_PRIVACY_REQUEST_MESSAGE_LENGTH = 2000;

interface BuildChildDataDeletionRequestMessageInput {
  childId: string;
  childName: string;
  scopes: readonly ChildDataDeletionScope[];
  details?: string;
  submittedFrom?: string;
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeDetails(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function buildChildDataDeletionRequestMessage({
  childId,
  childName,
  scopes,
  details,
  submittedFrom = 'children_screen',
}: BuildChildDataDeletionRequestMessageInput): string {
  const normalizedScopes = scopes.length > 0 ? scopes : ['full_review'];
  const normalizedDetails = normalizeDetails(details ?? '');
  const prefix = [
    '[child_data_deletion_request]',
    `child_profile_id=${normalizeSingleLine(childId) || 'unknown'}`,
    `child_display_name=${normalizeSingleLine(childName) || 'unknown'}`,
    `requested_scopes=${normalizedScopes.join(',')}`,
    `submitted_from=${normalizeSingleLine(submittedFrom) || 'children_screen'}`,
    'adult_note=',
  ].join('\n');

  const detailBudget = Math.max(MAX_PRIVACY_REQUEST_MESSAGE_LENGTH - prefix.length, 0);
  const trimmedDetails = normalizedDetails.slice(0, detailBudget).trim();
  const message = `${prefix}${trimmedDetails || 'None provided'}`;

  return message.slice(0, MAX_PRIVACY_REQUEST_MESSAGE_LENGTH);
}
