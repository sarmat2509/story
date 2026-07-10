import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import {
  type AdminDiscountCode,
  type AdminDiscountCodeInput,
  useAdminDiscountCodes,
  useAdminDiscountOptions,
  useCreateAdminDiscountCode,
  useUpdateAdminDiscountCode,
} from '@/admin/api/admin';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { AdminTable } from '@/admin/components/AdminTable';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

type DiscountKind = 'subscription' | 'bundle';

function parseEmails(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;\n]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function mutationMessage(error: unknown): string | null {
  if (!error) return null;
  const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  return apiMessage ?? (error instanceof Error ? error.message : 'Request failed');
}

export default function AdminDiscountCodesScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const codes = useAdminDiscountCodes();
  const options = useAdminDiscountOptions();
  const createCode = useCreateAdminDiscountCode();
  const updateCode = useUpdateAdminDiscountCode();
  const [editing, setEditing] = useState<AdminDiscountCode | 'new' | null>(null);
  const [kind, setKind] = useState<DiscountKind>('subscription');
  const [percentOff, setPercentOff] = useState('20');
  const [durationMonths, setDurationMonths] = useState('3');
  const [forever, setForever] = useState(false);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [assignedEmails, setAssignedEmails] = useState('');

  const resetEditor = () => {
    setEditing(null);
    createCode.reset();
    updateCode.reset();
  };

  const beginCreate = () => {
    setEditing('new');
    setKind('subscription');
    setPercentOff('20');
    setDurationMonths('3');
    setForever(false);
    setScopeId(null);
    setIsActive(true);
    setAssignedEmails('');
    createCode.reset();
    updateCode.reset();
  };

  const beginEdit = (item: AdminDiscountCode) => {
    setEditing(item);
    setKind(item.kind);
    setPercentOff(String(item.percentOff));
    setDurationMonths(String(item.durationMonths ?? 3));
    setForever(item.kind === 'subscription' && item.durationMonths == null);
    setScopeId(item.kind === 'subscription' ? item.planId : item.bundleId);
    setIsActive(item.isActive);
    setAssignedEmails(item.assignments.map((assignment) => assignment.email).join('\n'));
    createCode.reset();
    updateCode.reset();
  };

  const save = async () => {
    const input: AdminDiscountCodeInput = {
      kind,
      percentOff: Math.max(1, Math.min(100, Number.parseInt(percentOff, 10) || 1)),
      durationMonths:
        kind === 'subscription' && !forever
          ? Math.max(1, Number.parseInt(durationMonths, 10) || 1)
          : null,
      planId: kind === 'subscription' ? scopeId : null,
      bundleId: kind === 'bundle' ? scopeId : null,
      isActive,
      assignedUserEmails: parseEmails(assignedEmails),
    };
    try {
      if (editing === 'new') {
        await createCode.mutateAsync(input);
      } else if (editing) {
        await updateCode.mutateAsync({ id: editing.id, input });
      }
      resetEditor();
    } catch {
      // Mutation state renders the server validation or delivery error in the editor.
    }
  };

  const saving = createCode.isPending || updateCode.isPending;
  const saveError = mutationMessage(createCode.error ?? updateCode.error);
  const scopeOptions =
    kind === 'subscription' ? (options.data?.plans ?? []) : (options.data?.bundles ?? []);
  const rows = (codes.data ?? []).map((item) => [
    item.code,
    item.kind,
    `${item.percentOff}%`,
    item.kind === 'bundle'
      ? 'One purchase'
      : item.durationMonths
        ? `${item.durationMonths} billing periods`
        : 'Forever',
    item.planName ??
      item.bundleName ??
      (item.kind === 'subscription' ? 'All plans' : 'All bundles'),
    item.assignments.length > 0
      ? item.assignments.map((assignment) => assignment.email).join(', ')
      : 'Public',
    item.isActive ? 'Active' : 'Disabled',
    <TouchableOpacity
      key={`${item.id}-edit`}
      style={styles.editButton}
      onPress={() => beginEdit(item)}
    >
      <Text style={styles.editButtonText}>Edit</Text>
    </TouchableOpacity>,
  ]);

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminDiscountCodes" title="Admin / Discounts">
      <View style={styles.toolbar}>
        <Text style={styles.description}>
          Codes without assigned accounts are public. Once accounts are assigned, only those
          accounts can use the code.
        </Text>
        <AppButton label="Create code" onPress={beginCreate} size="sm" />
      </View>

      {codes.isLoading || options.isLoading ? <AdminLoadingState /> : null}
      {codes.error || options.error ? (
        <AdminErrorState message={((codes.error ?? options.error) as Error).message} />
      ) : null}
      {!codes.isLoading && !codes.error ? (
        <AdminTable
          headers={['Code', 'Type', 'Discount', 'Duration', 'Scope', 'Accounts', 'Status', 'Edit']}
          rows={rows}
          emptyText="No discount codes yet."
        />
      ) : null}

      {editing ? (
        <View style={styles.editor}>
          <Text style={styles.editorTitle}>
            {editing === 'new' ? 'Create discount code' : `Edit ${editing.code}`}
          </Text>

          <View style={styles.group}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chips}>
              {(['subscription', 'bundle'] as const).map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.chip, kind === value && styles.chipActive]}
                  onPress={() => {
                    setKind(value);
                    setScopeId(null);
                    if (value === 'bundle') setForever(false);
                  }}
                >
                  <Text style={[styles.chipText, kind === value && styles.chipTextActive]}>
                    {value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>Percentage off</Text>
            <TextInput
              style={styles.input}
              value={percentOff}
              onChangeText={setPercentOff}
              keyboardType="number-pad"
              placeholder="20"
            />
          </View>

          {kind === 'subscription' ? (
            <View style={styles.group}>
              <View style={styles.switchRow}>
                <Text style={styles.label}>Lifetime discount</Text>
                <Switch value={forever} onValueChange={setForever} />
              </View>
              {!forever ? (
                <TextInput
                  style={styles.input}
                  value={durationMonths}
                  onChangeText={setDurationMonths}
                  keyboardType="number-pad"
                  placeholder="Billing periods"
                />
              ) : null}
            </View>
          ) : null}

          <View style={styles.group}>
            <Text style={styles.label}>
              {kind === 'subscription' ? 'Plan scope' : 'Bundle scope'}
            </Text>
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, scopeId === null && styles.chipActive]}
                onPress={() => setScopeId(null)}
              >
                <Text style={[styles.chipText, scopeId === null && styles.chipTextActive]}>
                  All
                </Text>
              </TouchableOpacity>
              {scopeOptions.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.chip, scopeId === option.id && styles.chipActive]}
                  onPress={() => setScopeId(option.id)}
                >
                  <Text style={[styles.chipText, scopeId === option.id && styles.chipTextActive]}>
                    {option.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.label}>Assigned account emails (one per line)</Text>
            <Text style={styles.hint}>Leave empty to make the code public.</Text>
            <TextInput
              style={[styles.input, styles.emailInput]}
              value={assignedEmails}
              onChangeText={setAssignedEmails}
              placeholder="blogger@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Active</Text>
            <Switch value={isActive} onValueChange={setIsActive} />
          </View>
          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
          <View style={styles.actions}>
            <AppButton label="Cancel" onPress={resetEditor} variant="secondary" disabled={saving} />
            <AppButton
              label={saving ? 'Saving…' : 'Save'}
              onPress={save}
              loading={saving}
              disabled={saving}
            />
          </View>
        </View>
      ) : null}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  description: { flex: 1, color: theme.colors.text.secondary, lineHeight: 20 },
  editButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.interactive.secondary,
  },
  editButtonText: { color: theme.colors.text.primary, fontWeight: '600' },
  editor: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 12,
    padding: 18,
    gap: 18,
    backgroundColor: theme.colors.background.primary,
  },
  editorTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text.primary },
  group: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text.primary },
  hint: { fontSize: 12, color: theme.colors.text.tertiary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  chipText: { color: theme.colors.text.secondary, fontWeight: '600' },
  chipTextActive: { color: theme.colors.text.inverse },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.secondary,
  },
  emailInput: { minHeight: 100, textAlignVertical: 'top' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  error: { color: theme.colors.status.error, fontSize: 13 },
});
