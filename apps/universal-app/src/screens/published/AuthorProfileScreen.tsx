import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { usePublicAuthor } from '@/api/stories';
import { PublishedStoryCard } from '@/components/PublishedStoryCard';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { theme } from '@/theme';
import { formatAssetUrl } from '@/utils/assetUrl';
import type { MainDrawerParamList } from '@/types/navigation';

const ITEMS_PER_PAGE = 24;
const cardDelay = (i: number) => Math.min(240 + i * 35, 500);

type RouteProps = RouteProp<MainDrawerParamList, 'AuthorProfile'>;

export default function AuthorProfileScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const authorId = route.params?.authorId;
  const [currentPage, setCurrentPage] = useState(1);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const enterKey = useScreenEnter();

  const offset = useMemo(() => (currentPage - 1) * ITEMS_PER_PAGE, [currentPage]);
  const { data, isLoading, error } = usePublicAuthor(authorId, { limit: ITEMS_PER_PAGE, offset });

  const author = data?.author;
  const stories = data?.stories ?? [];
  const totalStories = data?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalStories / ITEMS_PER_PAGE));
  const avatarUrl = formatAssetUrl(author?.avatarUrl) ?? author?.avatarUrl ?? null;
  const authorInitial = author?.displayName?.trim().charAt(0)?.toUpperCase() || 'A';

  const numColumns = useMemo(() => (width < 1024 ? 2 : 4), [width]);
  const gridCardWidth = useMemo(() => {
    const paddingHorizontal = theme.spacing[4] * 2;
    const gap = theme.spacing[4];
    return (width - paddingHorizontal - gap * (numColumns - 1)) / numColumns;
  }, [width, numColumns]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: author?.displayName ?? 'Author',
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [author?.displayName, navigation]);

  const handleStoryPress = useCallback(
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

  if (!authorId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorMessage}>{t('profile.author_not_found')}</Text>
      </View>
    );
  }

  if (error || !author) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorMessage}>
          {error ? (error as Error).message : t('profile.author_not_found')}
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <AnimatedSection delay={0} trigger={enterKey}>
          <View style={styles.hero}>
            <View style={styles.avatarShell}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <Text style={styles.avatarFallback}>{authorInitial}</Text>
              )}
            </View>
            <View style={styles.heroText}>
              <Text style={styles.authorName}>{author.displayName}</Text>
              <Text style={styles.storyCount}>
                {t('profile.author_story_count', { count: totalStories })}
              </Text>
              {author.aboutMe ? <Text style={styles.aboutMe}>{author.aboutMe}</Text> : null}
            </View>
          </View>
        </AnimatedSection>

        <AnimatedSection delay={140} trigger={enterKey} style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('profile.author_published_stories')}</Text>
          {totalPages > 1 ? (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[
                  styles.paginationButton,
                  currentPage === 1 && styles.paginationButtonDisabled,
                ]}
                onPress={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                <Ionicons name="chevron-back" size={20} color={theme.colors.text.primary} />
              </TouchableOpacity>
              <Text style={styles.paginationText}>
                {t('library.page')} {currentPage} {t('library.of')} {totalPages}
              </Text>
              <TouchableOpacity
                style={[
                  styles.paginationButton,
                  currentPage === totalPages && styles.paginationButtonDisabled,
                ]}
                onPress={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                <Ionicons name="chevron-forward" size={20} color={theme.colors.text.primary} />
              </TouchableOpacity>
            </View>
          ) : null}
        </AnimatedSection>

        {!stories.length ? (
          <AnimatedSection delay={240} trigger={enterKey}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{t('profile.author_no_stories')}</Text>
            </View>
          </AnimatedSection>
        ) : (
          <View
            style={[
              styles.gridContainer,
              Platform.OS === 'web' &&
                ({ gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any),
            ]}
          >
            {stories.map((story, index) => {
              const card = (
                <PublishedStoryCard story={story} onPress={handleStoryPress} variant="grid" />
              );
              return Platform.OS === 'web' ? (
                <AnimatedSection key={story.id} delay={cardDelay(index)} trigger={enterKey}>
                  {card}
                </AnimatedSection>
              ) : (
                <AnimatedSection
                  key={story.id}
                  delay={cardDelay(index)}
                  trigger={enterKey}
                  style={{ width: gridCardWidth }}
                >
                  {card}
                </AnimatedSection>
              );
            })}
          </View>
        )}
      </ScrollView>
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="other"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  content: {
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[8],
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
  hero: {
    flexDirection: 'row',
    gap: theme.spacing[4],
    alignItems: 'flex-start',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.xl,
    padding: theme.spacing[5],
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    marginBottom: theme.spacing[5],
  },
  avatarShell: {
    width: 84,
    height: 84,
    borderRadius: theme.borders.radius.full,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.secondary,
  },
  heroText: {
    flex: 1,
    gap: theme.spacing[2],
  },
  authorName: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  storyCount: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  aboutMe: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: 22,
    color: theme.colors.text.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing[4],
    gap: theme.spacing[3],
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  paginationButton: {
    padding: theme.spacing[2],
    borderRadius: theme.borders.radius.md,
    backgroundColor: theme.colors.background.secondary,
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  },
  emptyState: {
    paddingVertical: theme.spacing[8],
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.text.tertiary,
  },
  gridContainer: Platform.select({
    web: {
      display: 'grid' as any,
      gap: theme.spacing[4],
    },
    default: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: theme.spacing[4],
    },
  }),
});
