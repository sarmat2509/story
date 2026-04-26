import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useAdminVoices, useUpdateAdminVoice } from '@/admin/api/admin';
import { AdminPagination, AdminSearchBar } from '@/admin/components/AdminControls';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { AdminTable } from '@/admin/components/AdminTable';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

const PAGE_SIZE = 30;

export default function AdminVoicesScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error } = useAdminVoices({
    limit: PAGE_SIZE,
    offset,
    search,
    provider: provider.trim() || undefined,
  });
  const updateVoice = useUpdateAdminVoice();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const rows = (data?.items ?? []).map((item) => {
    const rowBusy = updatingId === item.id;
    return [
      item.displayName,
      item.name,
      item.provider,
      <Text key={`${item.id}-prov`} style={styles.vendorVoiceId} selectable>
        {item.providerVoiceId}
      </Text>,
      item.language,
      item.isPremium ? 'yes' : 'no',
      <View key={`${item.id}-active`} style={styles.switchWrap}>
        <Switch
          value={item.isActive}
          onValueChange={async (isActive) => {
            setUpdatingId(item.id);
            try {
              await updateVoice.mutateAsync({ voiceId: item.id, isActive });
            } finally {
              setUpdatingId(null);
            }
          }}
          disabled={rowBusy}
          trackColor={{ false: theme.colors.border.medium, true: theme.colors.interactive.primary }}
        />
        <Text style={styles.switchHint}>{item.isActive ? 'on' : 'off'}</Text>
      </View>,
    ];
  });

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminVoices" title="Admin / Voices" panelStyle={styles.panelWide}>
      <Text style={styles.caption}>
        TTS voice catalog. Inactive rows are not offered in the app. Vendor is the provider slug (for example google,
        elevenlabs, grok).
      </Text>

      <View style={styles.filters}>
        <AdminSearchBar
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setOffset(0);
          }}
          placeholder="Search by name, display name, provider id, or vendor"
        />
        <TextInput
          style={styles.providerInput}
          value={provider}
          onChangeText={(value) => {
            setProvider(value);
            setOffset(0);
          }}
          placeholder="Vendor filter (exact, e.g. grok)"
          placeholderTextColor={theme.colors.text.tertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isLoading ? <AdminLoadingState /> : null}
      {error ? <AdminErrorState message={(error as Error).message} /> : null}
      {!isLoading && !error ? (
        <>
          <AdminTable
            headers={['Display name', 'Name', 'Vendor', 'Vendor voice id', 'Language', 'Premium', 'Active']}
            rows={rows}
            emptyText="No voices found."
          />
          <AdminPagination
            limit={PAGE_SIZE}
            offset={offset}
            total={data?.meta.total ?? 0}
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
  caption: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    lineHeight: 18,
  },
  filters: {
    gap: 10,
  },
  providerInput: {
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
  },
  switchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchHint: {
    fontSize: 12,
    color: theme.colors.text.tertiary,
    textTransform: 'uppercase',
  },
  vendorVoiceId: {
    fontSize: 12,
    fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    color: theme.colors.text.secondary,
  },
});
