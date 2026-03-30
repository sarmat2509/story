import React, { useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAdminStories, useUpdateAdminStory } from '@/admin/api/admin';
import { AdminSearchBar, AdminPagination } from '@/admin/components/AdminControls';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { AdminTable } from '@/admin/components/AdminTable';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

const PAGE_SIZE = 20;
const PUBLISHED_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'draft', label: 'Private' },
] as const;

export default function AdminStoriesScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [publishedStatus, setPublishedStatus] = useState<(typeof PUBLISHED_FILTERS)[number]['value']>('all');
  const { data, isLoading, error } = useAdminStories({ limit: PAGE_SIZE, offset, search, publishedStatus });
  const updateStoryMutation = useUpdateAdminStory();

  const rows = (data?.items ?? []).map((item) => [
    item.id,
    item.title,
    item.userId,
    item.isPublished ? (item.visibility === 'public' ? 'Published for all' : 'Unlisted') : 'Private',
    <View key={`${item.id}-homepage`} style={styles.homePageCell}>
      <TouchableOpacity
        style={[
          styles.toggleButton,
          item.showOnHomePage ? styles.toggleButtonActive : styles.toggleButtonInactive,
          (!item.isPublished || item.visibility !== 'public' || !item.publishedSlug || updateStoryMutation.isPending) && styles.toggleButtonDisabled,
        ]}
        disabled={!item.isPublished || item.visibility !== 'public' || !item.publishedSlug || updateStoryMutation.isPending}
        onPress={() => updateStoryMutation.mutate({
          storyId: item.id,
          showOnHomePage: !item.showOnHomePage,
        })}
      >
        <Text
          style={[
            styles.toggleButtonText,
            item.showOnHomePage ? styles.toggleButtonTextActive : styles.toggleButtonTextInactive,
          ]}
        >
          {item.showOnHomePage ? 'On HP' : 'Off HP'}
        </Text>
      </TouchableOpacity>
      {!item.isPublished || item.visibility !== 'public' || !item.publishedSlug ? (
        <Text style={styles.helperText}>Only public stories with a valid slug</Text>
      ) : null}
      {updateStoryMutation.isPending ? <ActivityIndicator size="small" color={theme.colors.interactive.primary} /> : null}
    </View>,
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
      <View style={styles.filterRow}>
        {PUBLISHED_FILTERS.map((filter) => {
          const isActive = publishedStatus === filter.value;
          return (
            <TouchableOpacity
              key={filter.value}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => {
                setPublishedStatus(filter.value);
                setOffset(0);
              }}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? <AdminLoadingState /> : null}
      {error ? <AdminErrorState message={(error as Error).message} /> : null}
      {!isLoading && !error ? (
        <>
          <AdminTable
            headers={['ID', 'Title', 'User', 'Status', 'HP', 'Created', 'Story']}
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
  homePageCell: {
    gap: 6,
    alignItems: 'flex-start',
  },
  toggleButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.interactive.primary,
    borderColor: theme.colors.interactive.primary,
  },
  toggleButtonInactive: {
    backgroundColor: theme.colors.background.primary,
    borderColor: theme.colors.border.medium,
  },
  toggleButtonDisabled: {
    opacity: 0.5,
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toggleButtonTextActive: {
    color: theme.colors.text.inverse,
  },
  toggleButtonTextInactive: {
    color: theme.colors.text.primary,
  },
  helperText: {
    fontSize: 11,
    color: theme.colors.text.secondary,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    backgroundColor: theme.colors.background.primary,
  },
  filterChipActive: {
    borderColor: theme.colors.interactive.primary,
    backgroundColor: theme.colors.interactive.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  filterChipTextActive: {
    color: theme.colors.text.inverse,
  },
});
