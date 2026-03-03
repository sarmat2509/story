import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { usePublishedStories } from '@/api/stories';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';

const ITEMS_PER_PAGE = 24;

export default function PublishedStoriesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { width } = useWindowDimensions();

  const { data, isLoading, error } = usePublishedStories({
    limit: ITEMS_PER_PAGE,
    offset: 0,
  });

  const stories = data?.stories ?? [];
  const numColumns = width < 1024 ? 2 : 4;
  const paddingHorizontal = theme.spacing[4] * 2;
  const gap = theme.spacing[4];
  const cardWidth = (width - paddingHorizontal - gap * (numColumns - 1)) / numColumns;

  const handlePress = useCallback(
    (slug: string) => {
      navigation.navigate('PublishedStory', { slug });
    },
    [navigation]
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorMessage}>{(error as Error).message}</Text>
      </View>
    );
  }

  if (!stories.length) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>📚</Text>
        <Text style={styles.emptyTitle}>{t('library.empty')}</Text>
        <Text style={styles.emptyMessage}>{t('library.create_first')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        key={numColumns}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        renderItem={({ item }) => {
          const coverUrl =
            item.scenes?.[0]?.imageUrl ?? item.scenes?.find((s: any) => s.imageUrl)?.imageUrl ?? null;
          const thumbnail = coverUrl ? formatAssetUrl(coverUrl) : null;

          return (
            <TouchableOpacity
              style={[styles.card, { width: cardWidth }]}
              onPress={() => handlePress(item.publishedSlug)}
              activeOpacity={0.7}
            >
              {thumbnail ? (
                <Image
                  source={{ uri: thumbnail }}
                  style={styles.coverImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderIcon}>📖</Text>
                </View>
              )}
              <View style={styles.cardContent}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.author} numberOfLines={1}>
                  {item.authorDisplayName || 'Anonymous'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
    backgroundColor: theme.colors.background.primary,
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.status.error,
    marginBottom: theme.spacing[2],
  },
  errorMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing[4],
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  emptyMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
  },
  listContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  columnWrapper: {
    gap: theme.spacing[4],
    marginBottom: theme.spacing[4],
  },
  card: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    overflow: 'hidden',
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
  },
  coverImage: {
    aspectRatio: 16 / 9,
    width: '100%',
  },
  placeholder: {
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.background.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
  },
  cardContent: {
    padding: theme.spacing[3],
  },
  title: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[1],
  },
  author: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
});
