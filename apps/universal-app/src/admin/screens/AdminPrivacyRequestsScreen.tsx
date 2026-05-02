import React, { useMemo, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  useBuildAdminDataPrivacyExport,
  useAdminDataPrivacyRequests,
  useUpdateAdminDataPrivacyRequest,
  type AdminDataPrivacyRequestItem,
  type AdminDataPrivacyRequestStatus,
  type AdminDataPrivacyRequestType,
} from '@/admin/api/admin';
import { AdminPagination, AdminSearchBar } from '@/admin/components/AdminControls';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

const PAGE_SIZE = 20;

const TYPE_OPTIONS: Array<{ label: string; value: '' | AdminDataPrivacyRequestType }> = [
  { label: 'All types', value: '' },
  { label: 'Export', value: 'export' },
  { label: 'Deletion', value: 'deletion' },
];

const STATUS_OPTIONS: Array<{ label: string; value: '' | AdminDataPrivacyRequestStatus }> = [
  { label: 'All statuses', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'In review', value: 'in_review' },
  { label: 'Fulfilled', value: 'fulfilled' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Canceled', value: 'canceled' },
];

const REVIEW_STATUS_OPTIONS: AdminDataPrivacyRequestStatus[] = [
  'open',
  'in_review',
  'fulfilled',
  'rejected',
  'canceled',
];

const EXPORT_DELIVERY_CHECKLIST = [
  'Verify the requester controls the account before sending files.',
  'Download the JSON only from this admin screen; do not paste raw data into tickets.',
  'Send through the verified support mailbox and record delivery method/date in admin notes.',
  'Mark fulfilled only after delivery is complete.',
];

function formatStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function getStatusMeta(status: string) {
  switch (status) {
    case 'fulfilled':
      return { color: theme.colors.success[600], backgroundColor: theme.colors.success[50] };
    case 'rejected':
    case 'canceled':
      return { color: theme.colors.error[700], backgroundColor: theme.colors.error[50] };
    case 'in_review':
      return { color: theme.colors.warning[600], backgroundColor: theme.colors.warning[50] };
    default:
      return { color: theme.colors.interactive.primary, backgroundColor: theme.colors.primary[50] };
  }
}

function downloadJsonFile(filename: string, payload: unknown) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function PrivacyRequestCard({
  item,
  isSelected,
  onSelect,
}: {
  item: AdminDataPrivacyRequestItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const statusMeta = getStatusMeta(item.status);
  const createdAt = new Date(item.createdAt).toLocaleString();
  const reviewedAt = item.reviewedAt ? new Date(item.reviewedAt).toLocaleString() : null;

  return (
    <View style={[styles.card, isSelected && styles.cardSelected]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{item.requesterEmail ?? 'Unknown requester'}</Text>
          <Text style={styles.cardMeta}>{createdAt}</Text>
        </View>
        <View style={styles.badges}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{item.requestType}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusMeta.backgroundColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>
              {formatStatus(item.status)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.detailGrid}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Request ID</Text>
          <Text style={styles.detailValue} numberOfLines={1}>{item.id}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>User ID</Text>
          <Text style={styles.detailValue} numberOfLines={1}>{item.userId ?? 'Detached'}</Text>
        </View>
        {reviewedAt ? (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Reviewed</Text>
            <Text style={styles.detailValue}>{reviewedAt}</Text>
          </View>
        ) : null}
      </View>

      {item.message ? (
        <View style={styles.messageBlock}>
          <Text style={styles.detailLabel}>Message</Text>
          <Text style={styles.messageText}>{item.message}</Text>
        </View>
      ) : null}

      {item.adminNotes ? (
        <View style={styles.messageBlock}>
          <Text style={styles.detailLabel}>Admin notes</Text>
          <Text style={styles.messageText}>{item.adminNotes}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.reviewButton} onPress={onSelect}>
        <Text style={styles.reviewButtonText}>{isSelected ? 'Selected' : 'Review'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AdminPrivacyRequestsScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [requestType, setRequestType] = useState<'' | AdminDataPrivacyRequestType>('');
  const [status, setStatus] = useState<'' | AdminDataPrivacyRequestStatus>('');
  const [selectedRequest, setSelectedRequest] = useState<AdminDataPrivacyRequestItem | null>(null);
  const [draftStatus, setDraftStatus] = useState<AdminDataPrivacyRequestStatus>('open');
  const [draftNotes, setDraftNotes] = useState('');
  const query = useAdminDataPrivacyRequests({
    limit: PAGE_SIZE,
    offset,
    search,
    requestType: requestType || undefined,
    status: status || undefined,
  });
  const updateRequest = useUpdateAdminDataPrivacyRequest();
  const buildExport = useBuildAdminDataPrivacyExport();
  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);

  const selectRequest = (item: AdminDataPrivacyRequestItem) => {
    setSelectedRequest(item);
    setDraftStatus(
      REVIEW_STATUS_OPTIONS.includes(item.status as AdminDataPrivacyRequestStatus)
        ? (item.status as AdminDataPrivacyRequestStatus)
        : 'open'
    );
    setDraftNotes(item.adminNotes ?? '');
  };

  return (
    <AdminLayout
      navigation={navigation}
      activeRoute="AdminPrivacyRequests"
      title="Admin / Privacy Requests"
      panelStyle={styles.panelWide}
    >
      <AdminSearchBar
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setOffset(0);
        }}
        placeholder="Search by requester email, message, or admin notes"
      />

      <View style={styles.filtersBlock}>
        <View style={styles.filterGroup}>
          {TYPE_OPTIONS.map((option) => {
            const isActive = requestType === option.value;
            return (
              <TouchableOpacity
                key={option.value || 'all-types'}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => {
                  setRequestType(option.value);
                  setOffset(0);
                }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.filterGroup}>
          {STATUS_OPTIONS.map((option) => {
            const isActive = status === option.value;
            return (
              <TouchableOpacity
                key={option.value || 'all-statuses'}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => {
                  setStatus(option.value);
                  setOffset(0);
                }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {query.isLoading ? <AdminLoadingState /> : null}
      {query.error ? <AdminErrorState message={(query.error as Error).message} /> : null}

      {!query.isLoading && !query.error ? (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText}>{query.data?.meta.total ?? 0} privacy requests</Text>
          </View>

          {selectedRequest ? (
            <View style={styles.editorPanel}>
              <View style={styles.editorHeader}>
                <View>
                  <Text style={styles.editorTitle}>Review request</Text>
                  <Text style={styles.editorMeta}>{selectedRequest.requesterEmail ?? selectedRequest.id}</Text>
                </View>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setSelectedRequest(null)}>
                  <Text style={styles.secondaryButtonText}>Close</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Status</Text>
                <View style={styles.filterGroup}>
                  {REVIEW_STATUS_OPTIONS.map((option) => {
                    const isActive = draftStatus === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[styles.filterChip, isActive && styles.filterChipActive]}
                        onPress={() => setDraftStatus(option)}
                      >
                        <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                          {formatStatus(option)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Admin notes</Text>
                <TextInput
                  style={styles.notesInput}
                  value={draftNotes}
                  onChangeText={setDraftNotes}
                  multiline
                  numberOfLines={4}
                  placeholder="Internal support note"
                  placeholderTextColor={theme.colors.text.tertiary}
                  textAlignVertical="top"
                />
              </View>

              {updateRequest.error ? (
                <Text style={styles.errorText}>{(updateRequest.error as Error).message}</Text>
              ) : null}
              {buildExport.error ? (
                <Text style={styles.errorText}>{(buildExport.error as Error).message}</Text>
              ) : null}

              {selectedRequest.requestType === 'export' ? (
                <View style={styles.deliveryChecklist}>
                  <Text style={styles.deliveryTitle}>Export delivery checklist</Text>
                  {EXPORT_DELIVERY_CHECKLIST.map((step) => (
                    <Text key={step} style={styles.deliveryStep}>- {step}</Text>
                  ))}
                </View>
              ) : null}

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.primaryButton, updateRequest.isPending && styles.buttonDisabled]}
                  disabled={updateRequest.isPending}
                  onPress={async () => {
                    const updated = await updateRequest.mutateAsync({
                      requestId: selectedRequest.id,
                      status: draftStatus,
                      adminNotes: draftNotes,
                    });
                    setSelectedRequest(updated);
                  }}
                >
                  <Text style={styles.primaryButtonText}>
                    {updateRequest.isPending ? 'Saving...' : 'Save review'}
                  </Text>
                </TouchableOpacity>

                {selectedRequest.requestType === 'export' ? (
                  <TouchableOpacity
                    style={[styles.secondaryButton, buildExport.isPending && styles.buttonDisabled]}
                    disabled={buildExport.isPending}
                    onPress={async () => {
                      const payload = await buildExport.mutateAsync({ requestId: selectedRequest.id });
                      const date = new Date().toISOString().slice(0, 10);
                      downloadJsonFile(
                        `wondertales-user-export-${selectedRequest.id}-${date}.json`,
                        payload.export
                      );
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {buildExport.isPending ? 'Generating...' : 'Download export JSON'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No privacy requests found.</Text>
            </View>
          ) : (
            <View style={styles.cardsList}>
              {items.map((item) => (
                <PrivacyRequestCard
                  key={item.id}
                  item={item}
                  isSelected={selectedRequest?.id === item.id}
                  onSelect={() => selectRequest(item)}
                />
              ))}
            </View>
          )}

          <AdminPagination
            limit={PAGE_SIZE}
            offset={offset}
            total={query.data?.meta.total ?? 0}
            onChange={setOffset}
          />
        </>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  panelWide: {
    minWidth: 0,
  },
  filtersBlock: {
    gap: 10,
  },
  filterGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
  },
  filterChipActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  filterChipText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  filterChipTextActive: {
    color: theme.colors.interactive.primary,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryText: {
    color: theme.colors.text.secondary,
    fontSize: 13,
  },
  cardsList: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 8,
    padding: 14,
    gap: 12,
    backgroundColor: theme.colors.background.primary,
  },
  cardSelected: {
    borderColor: theme.colors.interactive.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTitle: {
    color: theme.colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  cardMeta: {
    color: theme.colors.text.secondary,
    fontSize: 12,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  typeBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.background.secondary,
  },
  typeBadgeText: {
    color: theme.colors.text.secondary,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailItem: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
    gap: 4,
  },
  detailLabel: {
    color: theme.colors.text.tertiary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: theme.colors.text.primary,
    fontSize: 13,
  },
  messageBlock: {
    gap: 6,
  },
  messageText: {
    color: theme.colors.text.primary,
    lineHeight: 20,
  },
  reviewButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: theme.colors.interactive.secondary,
  },
  reviewButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '700',
  },
  editorPanel: {
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 8,
    padding: 16,
    gap: 14,
    backgroundColor: theme.colors.background.secondary,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  editorTitle: {
    color: theme.colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  editorMeta: {
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    color: theme.colors.text.primary,
    fontWeight: '700',
  },
  notesInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  deliveryChecklist: {
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.warning[500],
    borderRadius: 8,
    backgroundColor: theme.colors.warning[50],
    padding: 12,
  },
  deliveryTitle: {
    color: theme.colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  deliveryStep: {
    color: theme.colors.text.secondary,
    fontSize: 12,
    lineHeight: 17,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.interactive.secondary,
  },
  secondaryButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: theme.colors.status.error,
  },
  emptyState: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 8,
    padding: 18,
  },
  emptyText: {
    color: theme.colors.text.secondary,
  },
});
