import React, { useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAdminStories } from '@/admin/api/admin';
import { AdminSearchBar, AdminPagination } from '@/admin/components/AdminControls';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { AdminTable } from '@/admin/components/AdminTable';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

const PAGE_SIZE = 20;

export default function AdminStoriesScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error } = useAdminStories({ limit: PAGE_SIZE, offset, search });

  const rows = (data?.items ?? []).map((item) => [
    item.id,
    item.title,
    item.userId,
    new Date(item.createdAt).toLocaleString(),
    <TouchableOpacity
      key={`${item.id}-scenes`}
      style={styles.linkButton}
      onPress={() => navigation.navigate('AdminScenesStory', { storyId: item.id })}
    >
      <Text style={styles.linkButtonText}>Open story</Text>
    </TouchableOpacity>,
  ]);

  return (
    <AdminLayout navigation={navigation} activeRoute="AdminStories" title="Admin / Stories">
      <AdminSearchBar
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setOffset(0);
        }}
        placeholder="Search by story title or id"
      />

      {isLoading ? <AdminLoadingState /> : null}
      {error ? <AdminErrorState message={(error as Error).message} /> : null}
      {!isLoading && !error ? (
        <>
          <AdminTable
            headers={['ID', 'Title', 'User', 'Created', 'Story']}
            rows={rows}
            emptyText="No stories found."
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
  linkButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.interactive.primary,
  },
  linkButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '600',
  },
});
