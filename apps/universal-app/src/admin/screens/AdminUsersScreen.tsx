import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import {
  useAdminUsers,
  useDeleteAdminUser,
  useUpdateAdminUser,
  type AdminUserListItem,
} from '@/admin/api/admin';
import { AdminSearchBar, AdminPagination } from '@/admin/components/AdminControls';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { AdminTable } from '@/admin/components/AdminTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePlans } from '@/api/plans';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

const PAGE_SIZE = 20;

export default function AdminUsersScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [draftRole, setDraftRole] = useState<'user' | 'admin'>('user');
  const [draftStatus, setDraftStatus] = useState<'active' | 'suspended'>('active');
  const [draftSuspendedReason, setDraftSuspendedReason] = useState('');
  const [draftPlanSlug, setDraftPlanSlug] = useState<string | null>(null);
  const [draftStoriesUsedCurrentPeriod, setDraftStoriesUsedCurrentPeriod] = useState('0');
  const [draftGraphicNovelsUsedCurrentPeriod, setDraftGraphicNovelsUsedCurrentPeriod] = useState('0');
  const [draftAudioStoriesUsedCurrentPeriod, setDraftAudioStoriesUsedCurrentPeriod] = useState('0');
  const [userToDelete, setUserToDelete] = useState<AdminUserListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { data, isLoading, error } = useAdminUsers({ limit: PAGE_SIZE, offset, search });
  const { data: plans } = usePlans();
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();

  const rows = (data?.items ?? []).map((item) => [
    item.id,
    item.email,
    item.role,
    item.status,
    item.planName ?? item.planSlug ?? 'No plan',
    item.storiesUsedCurrentPeriod,
    item.graphicNovelsUsedCurrentPeriod,
    item.audioStoriesUsedCurrentPeriod,
    new Date(item.createdAt).toLocaleString(),
    <View key={`${item.id}-actions`} style={styles.rowActions}>
      <TouchableOpacity
        style={styles.editButton}
        onPress={() => {
          setSelectedUser(item);
          setDraftRole(item.role);
          setDraftStatus(item.status);
          setDraftSuspendedReason(item.suspendedReason ?? '');
          setDraftPlanSlug(item.planSlug);
          setDraftStoriesUsedCurrentPeriod(String(item.storiesUsedCurrentPeriod));
          setDraftGraphicNovelsUsedCurrentPeriod(String(item.graphicNovelsUsedCurrentPeriod));
          setDraftAudioStoriesUsedCurrentPeriod(String(item.audioStoriesUsedCurrentPeriod));
        }}
      >
        <Text style={styles.editButtonText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.deleteButton, deleteUser.isPending && styles.buttonDisabled]}
        disabled={deleteUser.isPending}
        onPress={() => {
          setDeleteError(null);
          setUserToDelete(item);
        }}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>,
  ]);

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminUsers" title="Admin / Users">
      <AdminSearchBar
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setOffset(0);
        }}
        placeholder="Search by email"
      />

      {isLoading ? <AdminLoadingState /> : null}
      {error ? <AdminErrorState message={(error as Error).message} /> : null}
      {!isLoading && !error ? (
        <>
          {deleteError ? <AdminErrorState message={deleteError} /> : null}
          <AdminTable
            minColumnWidth={140}
            columnWidths={{ 2: 100, 3: 100, 5: 78, 6: 78, 7: 78 }}
            headers={[
              'ID',
              'Email',
              'Role',
              'Status',
              'Plan',
              'Stories',
              'Comics',
              'Audio',
              'Created',
              'Actions',
            ]}
            rows={rows}
            emptyText="No users found."
          />
          {selectedUser ? (
            <View style={styles.editorPanel}>
              <Text style={styles.editorTitle}>Edit user</Text>
              <Text style={styles.editorMeta}>{selectedUser.email}</Text>
              <Text style={styles.editorHint}>
                Usage values apply to the current billing period
                {selectedUser.currentPeriodEnd
                  ? ` (ends ${new Date(selectedUser.currentPeriodEnd).toLocaleString()})`
                  : ''}
                .
              </Text>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Role</Text>
                <View style={styles.optionsRow}>
                  {(['user', 'admin'] as const).map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[styles.optionChip, draftRole === role && styles.optionChipActive]}
                      onPress={() => setDraftRole(role)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          draftRole === role && styles.optionChipTextActive,
                        ]}
                      >
                        {role}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Account status</Text>
                <View style={styles.optionsRow}>
                  {(['active', 'suspended'] as const).map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[styles.optionChip, draftStatus === status && styles.optionChipActive]}
                      onPress={() => setDraftStatus(status)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          draftStatus === status && styles.optionChipTextActive,
                        ]}
                      >
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {draftStatus === 'suspended' ? (
                  <TextInput
                    style={[styles.input, styles.reasonInput]}
                    value={draftSuspendedReason}
                    onChangeText={setDraftSuspendedReason}
                    placeholder="Reason shown in admin audit context"
                    placeholderTextColor={theme.colors.text.tertiary}
                    multiline
                  />
                ) : null}
              </View>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Plan</Text>
                <View style={styles.optionsRow}>
                  {(plans ?? []).map((plan) => (
                    <TouchableOpacity
                      key={plan.slug}
                      style={[
                        styles.optionChip,
                        draftPlanSlug === plan.slug && styles.optionChipActive,
                      ]}
                      onPress={() => setDraftPlanSlug(plan.slug)}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          draftPlanSlug === plan.slug && styles.optionChipTextActive,
                        ]}
                      >
                        {plan.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Stories used this period</Text>
                <TextInput
                  style={styles.input}
                  value={draftStoriesUsedCurrentPeriod}
                  onChangeText={setDraftStoriesUsedCurrentPeriod}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={theme.colors.text.tertiary}
                />
              </View>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Comics used this period</Text>
                <TextInput
                  style={styles.input}
                  value={draftGraphicNovelsUsedCurrentPeriod}
                  onChangeText={setDraftGraphicNovelsUsedCurrentPeriod}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={theme.colors.text.tertiary}
                />
              </View>

              <View style={styles.group}>
                <Text style={styles.groupLabel}>Audio stories used this period</Text>
                <TextInput
                  style={styles.input}
                  value={draftAudioStoriesUsedCurrentPeriod}
                  onChangeText={setDraftAudioStoriesUsedCurrentPeriod}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={theme.colors.text.tertiary}
                />
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setSelectedUser(null)}
                  disabled={updateUser.isPending}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={async () => {
                    const parsedStoriesUsedCurrentPeriod = Number.parseInt(
                      draftStoriesUsedCurrentPeriod,
                      10
                    );
                    const parsedAudioStoriesUsedCurrentPeriod = Number.parseInt(
                      draftAudioStoriesUsedCurrentPeriod,
                      10
                    );
                    const parsedGraphicNovelsUsedCurrentPeriod = Number.parseInt(
                      draftGraphicNovelsUsedCurrentPeriod,
                      10
                    );
                    await updateUser.mutateAsync({
                      userId: selectedUser.id,
                      role: draftRole,
                      status: draftStatus,
                      suspendedReason:
                        draftStatus === 'suspended' ? draftSuspendedReason.trim() || null : null,
                      planSlug: draftPlanSlug ?? undefined,
                      storiesUsedCurrentPeriod: Number.isFinite(parsedStoriesUsedCurrentPeriod)
                        ? Math.max(0, parsedStoriesUsedCurrentPeriod)
                        : 0,
                      graphicNovelsUsedCurrentPeriod: Number.isFinite(
                        parsedGraphicNovelsUsedCurrentPeriod
                      )
                        ? Math.max(0, parsedGraphicNovelsUsedCurrentPeriod)
                        : 0,
                      audioStoriesUsedCurrentPeriod: Number.isFinite(
                        parsedAudioStoriesUsedCurrentPeriod
                      )
                        ? Math.max(0, parsedAudioStoriesUsedCurrentPeriod)
                        : 0,
                    });
                    setSelectedUser(null);
                  }}
                  disabled={updateUser.isPending}
                >
                  <Text style={styles.primaryButtonText}>
                    {updateUser.isPending ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <AdminPagination
            limit={PAGE_SIZE}
            offset={offset}
            total={data?.meta.total ?? 0}
            onChange={setOffset}
          />
          <ConfirmDialog
            visible={Boolean(userToDelete)}
            title="Delete user"
            message={`Delete ${userToDelete?.email ?? ''}? This permanently deletes the account and all associated data.`}
            confirmText={deleteUser.isPending ? 'Deleting...' : 'Delete'}
            cancelText="Cancel"
            onConfirm={async () => {
              if (!userToDelete || deleteUser.isPending) return;
              try {
                await deleteUser.mutateAsync(userToDelete.id);
                if (selectedUser?.id === userToDelete.id) setSelectedUser(null);
                setUserToDelete(null);
              } catch (mutationError) {
                setDeleteError(
                  mutationError instanceof Error ? mutationError.message : 'Failed to delete user.'
                );
              }
            }}
            onCancel={() => {
              if (!deleteUser.isPending) setUserToDelete(null);
            }}
            variant="danger"
          />
        </>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.interactive.secondary,
  },
  editButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  deleteButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.status.error,
  },
  deleteButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  editorPanel: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    backgroundColor: theme.colors.background.secondary,
  },
  editorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  editorMeta: {
    color: theme.colors.text.secondary,
  },
  editorHint: {
    color: theme.colors.text.secondary,
    lineHeight: 20,
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
  },
  reasonInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
  },
  optionChipActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.primary[50],
  },
  optionChipText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: theme.colors.interactive.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.secondary,
  },
  secondaryButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '700',
  },
});
