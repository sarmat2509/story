import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import {
  type AdminOutfitCatalogItem,
  type AdminOutfitSearchItem,
  useAdminOutfits,
  useSearchAdminOutfits,
} from '@/admin/api/admin';
import { AdminPagination } from '@/admin/components/AdminControls';
import { AdminLayout } from '@/admin/components/AdminLayout';
import { AdminErrorState, AdminLoadingState } from '@/admin/components/AdminState';
import { theme } from '@/theme';
import type { AdminStackParamList } from '@/types/navigation';

const PAGE_SIZE = 24;
const SEARCH_RESULT_LIMIT = 20;

type OutfitCardItem = AdminOutfitCatalogItem | AdminOutfitSearchItem;

function isSearchItem(item: OutfitCardItem): item is AdminOutfitSearchItem {
  return 'score' in item;
}

function OutfitCard({ item, rank }: { item: OutfitCardItem; rank?: number }) {
  const catalogTags = !isSearchItem(item)
    ? [
        ...new Set([
          ...item.seasonTags,
          ...item.purposeTags,
          ...item.componentTags,
          ...item.footwearTags,
        ]),
      ].slice(0, 8)
    : [];

  return (
    <View style={styles.card}>
      <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
      <View style={styles.cardBody}>
        {isSearchItem(item) ? (
          <View style={styles.scoreRow}>
            <Text style={styles.rank}>#{rank}</Text>
            <Text style={styles.score}>score {item.score.toFixed(6)}</Text>
            <View
              style={[
                styles.thresholdBadge,
                item.meetsThreshold ? styles.thresholdBadgePassed : styles.thresholdBadgeFallback,
              ]}
            >
              <Text
                style={[
                  styles.thresholdBadgeText,
                  item.meetsThreshold
                    ? styles.thresholdBadgeTextPassed
                    : styles.thresholdBadgeTextFallback,
                ]}
              >
                {item.meetsThreshold ? 'above threshold' : 'fallback'}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.description} selectable>
          {item.description}
        </Text>

        {catalogTags.length > 0 ? (
          <View style={styles.tags}>
            {catalogTags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.meta} selectable>
          {item.storagePath}
        </Text>
        <Text style={styles.meta}>{item.catalogSource || 'generated / no catalog source'}</Text>
      </View>
    </View>
  );
}

export default function AdminOutfitsScreen() {
  const navigation = useNavigation<NavigationProp<AdminStackParamList>>();
  const [description, setDescription] = useState('');
  const [offset, setOffset] = useState(0);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const catalog = useAdminOutfits({ limit: PAGE_SIZE, offset });
  const search = useSearchAdminOutfits();

  const runSearch = async () => {
    const value = description.trim();
    if (!value || search.isPending) return;
    setShowSearchResults(true);
    try {
      await search.mutateAsync({ description: value, limit: SEARCH_RESULT_LIMIT });
    } catch {
      // React Query exposes the error below through search.error.
    }
  };

  const clearSearch = () => {
    setDescription('');
    setShowSearchResults(false);
    search.reset();
  };

  const searchItems = search.data?.items ?? [];
  const catalogItems = catalog.data?.items ?? [];

  return (
    <AdminLayout
      navigation={navigation}
      activeRoute="AdminOutfits"
      title="Admin / Outfits"
      panelStyle={styles.panelWide}
    >
      <Text style={styles.caption}>
        Search uses the production outfit embedding, inferred catalog filters, and cosine similarity
        ranking. It searches the reusable planned catalog and shows top matches even when they fall
        below the runtime threshold.
      </Text>

      <View style={styles.searchPanel}>
        <Text style={styles.fieldLabel}>Outfit description</Text>
        <TextInput
          style={styles.descriptionInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the complete outfit, footwear, and worn accessories..."
          placeholderTextColor={theme.colors.text.tertiary}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect={false}
        />
        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (!description.trim() || search.isPending) && styles.buttonDisabled,
            ]}
            disabled={!description.trim() || search.isPending}
            onPress={() => void runSearch()}
          >
            {search.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.text.inverse} />
            ) : null}
            <Text style={styles.primaryButtonText}>
              {search.isPending ? 'Searching…' : 'Find similar outfits'}
            </Text>
          </TouchableOpacity>
          {showSearchResults || description ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={clearSearch}>
              <Text style={styles.secondaryButtonText}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {showSearchResults ? (
        <View style={styles.resultsSection}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>Similarity results</Text>
            {search.data ? (
              <Text style={styles.resultMeta}>
                {searchItems.length} matches · runtime threshold {search.data.threshold.toFixed(2)}
              </Text>
            ) : null}
          </View>
          {search.error ? <AdminErrorState message={(search.error as Error).message} /> : null}
          {!search.isPending && !search.error && search.data ? (
            <View style={styles.grid}>
              {searchItems.map((item, index) => (
                <OutfitCard key={item.id} item={item} rank={index + 1} />
              ))}
              {searchItems.length === 0 ? (
                <Text style={styles.emptyText}>No reusable planned outfits found.</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.resultsSection}>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionTitle}>All outfits</Text>
            <Text style={styles.resultMeta}>{catalog.data?.meta.total ?? 0} total</Text>
          </View>
          {catalog.isLoading ? <AdminLoadingState /> : null}
          {catalog.error ? <AdminErrorState message={(catalog.error as Error).message} /> : null}
          {!catalog.isLoading && !catalog.error ? (
            <>
              <View style={styles.grid}>
                {catalogItems.map((item) => (
                  <OutfitCard key={item.id} item={item} />
                ))}
                {catalogItems.length === 0 ? (
                  <Text style={styles.emptyText}>No outfits found.</Text>
                ) : null}
              </View>
              <AdminPagination
                limit={PAGE_SIZE}
                offset={offset}
                total={catalog.data?.meta.total ?? 0}
                onChange={setOffset}
              />
            </>
          ) : null}
        </View>
      )}
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  panelWide: {
    minWidth: 0,
  },
  caption: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text.secondary,
  },
  searchPanel: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 14,
    backgroundColor: theme.colors.background.secondary,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  descriptionInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: theme.colors.border.medium,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.background.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.primary,
  },
  primaryButtonText: {
    color: theme.colors.text.inverse,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: theme.colors.interactive.secondary,
  },
  secondaryButtonText: {
    color: theme.colors.text.primary,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  resultsSection: {
    gap: 14,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  resultMeta: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 14,
  },
  card: {
    width: 280,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: theme.colors.border.light,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.primary,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: theme.colors.background.secondary,
  },
  cardBody: {
    padding: 14,
    gap: 9,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  rank: {
    fontWeight: '800',
    color: theme.colors.text.primary,
  },
  score: {
    fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 12,
    color: theme.colors.text.primary,
  },
  thresholdBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  thresholdBadgePassed: {
    backgroundColor: theme.colors.success[50],
  },
  thresholdBadgeFallback: {
    backgroundColor: theme.colors.warning[50],
  },
  thresholdBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  thresholdBadgeTextPassed: {
    color: theme.colors.success[600],
  },
  thresholdBadgeTextFallback: {
    color: theme.colors.warning[600],
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text.primary,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.background.secondary,
  },
  tagText: {
    fontSize: 10,
    color: theme.colors.text.secondary,
  },
  meta: {
    fontSize: 10,
    lineHeight: 14,
    color: theme.colors.text.tertiary,
  },
  emptyText: {
    paddingVertical: 20,
    color: theme.colors.text.secondary,
  },
});
