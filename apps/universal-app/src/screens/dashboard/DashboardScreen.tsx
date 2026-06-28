import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Pressable,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from '@/components/AppLinearGradient';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useStories, useStoryQuizCandidate } from '@/api/stories';
import { useChildren } from '@/api/children';
import { navigateToStory } from '@/navigation/navigationRef';
import { StoryCard } from '@/components/StoryCard';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { AnimatedSection } from '@/components/AnimatedSection';
import { AppButton } from '@/components/AppButton';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { theme } from '@/theme';
import { modernColors, modernGradients, modernShadows } from '@/theme/modernTheme';
import { formatAssetUrl } from '@/utils/assetUrl';

type ExtendedPressableState = {
  pressed: boolean;
  hovered?: boolean;
};

/** Page background — follows active palette (not hardcoded lavender). */
const DASHBOARD_BG_GRADIENT = modernGradients.page;

function getStoryCover(story: {
  coverThumbnailUrl?: string | null;
  coverImageUrl?: string | null;
  scenes?: Array<{ image?: { url?: string } }>;
}) {
  return formatAssetUrl(
    story.coverThumbnailUrl ||
      story.coverImageUrl ||
      story.scenes?.find((scene) => scene.image?.url)?.image?.url ||
      null
  );
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const { user, sessionMode, activeChild } = useAuthStore();
  const isChildSession = sessionMode === 'child';
  const childQuizEnabled =
    !isChildSession || activeChild?.childMode?.childModeSettings?.quizGenerationEnabled !== false;
  const enterKey = useScreenEnter();
  const {
    data: storiesData,
    isLoading: storiesLoading,
    error: storiesError,
    refetch: refetchStories,
  } = useStories();
  const { data: quizCandidate } = useStoryQuizCandidate(isChildSession && childQuizEnabled);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />,
    });
  }, [navigation]);

  // Invalidate stories cache when screen gains focus (e.g. after creating a story)
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['stories'] });
    }, [queryClient])
  );
  const {
    data: childrenData,
    isLoading: childrenLoading,
    error: childrenError,
    refetch: refetchChildren,
  } = useChildren(!isChildSession);

  const stories = storiesData?.stories || [];
  const children = childrenData?.children ?? [];
  const canCreateMoreChildren = childrenData?.canCreateMore ?? true;
  const storiesCount = Number(storiesData?.pagination?.total) || 0;
  const childrenCount = children.length;
  const featuredStory = stories[0];
  const featuredCover = featuredStory ? getStoryCover(featuredStory) : null;
  const shelfStories = stories.slice(featuredStory ? 1 : 0, featuredStory ? 7 : 6);
  const isLoading = storiesLoading || (!isChildSession && childrenLoading);
  const hasError = storiesError || (!isChildSession && childrenError);
  const greetingName = isChildSession ? activeChild?.name : user?.displayName;

  // Responsive columns: 1 on mobile, 2 on tablet, 3 on desktop
  const { width } = useWindowDimensions();
  const isWideHero = width >= 1120;
  const numColumns = width < 640 ? 1 : width < 1024 ? 2 : 3;
  const gridCellStyle =
    numColumns === 1
      ? styles.gridCellFull
      : numColumns === 2
        ? styles.gridCellHalf
        : styles.gridCellThird;

  // Show loading state
  if (isLoading) {
    return (
      <LinearGradient colors={DASHBOARD_BG_GRADIENT} style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('dashboard.loading')}</Text>
      </LinearGradient>
    );
  }

  // Show error state
  if (hasError) {
    return (
      <LinearGradient colors={DASHBOARD_BG_GRADIENT} style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('dashboard.error_title')}</Text>
        <Text style={styles.errorMessage}>
          {(storiesError as any)?.message ||
            (childrenError as any)?.message ||
            t('dashboard.error_message')}
        </Text>
        <AppButton
          label={t('dashboard.retry')}
          onPress={() => {
            refetchStories();
            if (!isChildSession) {
              refetchChildren();
            }
          }}
          style={styles.retryAction}
        />
      </LinearGradient>
    );
  }

  return (
    <>
      <LinearGradient colors={DASHBOARD_BG_GRADIENT} style={styles.gradientBackground}>
        <ScrollView contentContainerStyle={styles.content}>
          <AnimatedSection delay={0} trigger={enterKey}>
            <View style={[styles.topSection, !isWideHero && styles.topSectionCompact]}>
              <View style={styles.heroColumn}>
                <View style={styles.heroBadgeRow}>
                  <Text style={styles.eyebrow}>
                    {t('dashboard.story_corner', { defaultValue: 'Story corner' })}
                  </Text>
                  {featuredStory ? (
                    <View style={styles.liveBadge}>
                      <View style={styles.liveBadgeDot} />
                      <Text style={styles.liveBadgeText}>
                        {t('dashboard.featured_story_badge', { defaultValue: 'Continue reading' })}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.greeting}>
                  {t('dashboard.welcome_back', { name: greetingName || 'User' })}
                </Text>
                <Text style={styles.subtext}>
                  {featuredStory
                    ? t('dashboard.hero_context_resume', {
                        defaultValue:
                          'Your family shelf is ready. Jump back into the latest story or start a new one while the inspiration is fresh.',
                      })
                    : t('dashboard.hero_context_start', {
                        defaultValue:
                          'Start a fresh bedtime adventure and build a little library your family will want to come back to.',
                      })}
                </Text>
                <View style={styles.inlineMetrics}>
                  <View style={styles.inlineMetric}>
                    <Text style={styles.inlineMetricValue}>{storiesCount}</Text>
                    <Text style={styles.inlineMetricLabel}>{t('dashboard.stats.stories')}</Text>
                  </View>
                  {!isChildSession ? (
                    <View style={styles.inlineMetric}>
                      <Text style={styles.inlineMetricValue}>{childrenCount}</Text>
                      <Text style={styles.inlineMetricLabel}>{t('dashboard.stats.children')}</Text>
                    </View>
                  ) : null}
                </View>
                {!isChildSession ? (
                  <Pressable
                    onPress={() => navigation.navigate('Children')}
                    style={styles.inlineProfilesAction}
                  >
                    <Ionicons
                      name={canCreateMoreChildren ? 'person-add-outline' : 'people-outline'}
                      size={18}
                      color={theme.colors.primary[700]}
                    />
                    <Text style={styles.inlineProfilesActionText}>
                      {canCreateMoreChildren
                        ? t('dashboard.actions.add_child')
                        : t('dashboard.actions.view_profiles')}
                    </Text>
                  </Pressable>
                ) : null}
                <AppButton
                  label={t('dashboard.actions.create_story')}
                  onPress={() => navigation.navigate('Wizard')}
                  accessibilityLabel={t('dashboard.actions.create_story')}
                  leading={
                    <Ionicons
                      name="sparkles-outline"
                      size={20}
                      color={theme.colors.text.inverse}
                    />
                  }
                  style={styles.primaryHeroAction}
                  size="md"
                />
              </View>

              <View style={styles.featuredColumn}>
                {featuredStory ? (
                  <Pressable
                    onPress={() => navigateToStory(featuredStory.id)}
                    style={({ hovered, pressed }: ExtendedPressableState) => [
                      styles.featuredCard,
                      hovered && Platform.OS === 'web' ? styles.featuredCardHover : null,
                      pressed ? styles.featuredCardPressed : null,
                    ]}
                  >
                    {featuredCover ? (
                      <Image
                        source={{ uri: featuredCover }}
                        style={styles.featuredCover}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.featuredPlaceholder}>
                        <Ionicons
                          name="sparkles-outline"
                          size={28}
                          color={theme.colors.primary[600]}
                        />
                      </View>
                    )}
                    <LinearGradient
                      colors={['rgba(13, 10, 29, 0.05)', 'rgba(13, 10, 29, 0.72)']}
                      locations={[0.18, 1]}
                      style={styles.featuredOverlay}
                    />
                    <View style={styles.featuredContent}>
                      <View style={styles.featuredPill}>
                        <Text style={styles.featuredPillText}>
                          {t('dashboard.latest_story', { defaultValue: 'Latest story' })}
                        </Text>
                      </View>
                      <Text style={styles.featuredTitle} numberOfLines={2}>
                        {featuredStory.title}
                      </Text>
                      <Text style={styles.featuredDescription} numberOfLines={2}>
                        {t('dashboard.featured_story_description', {
                          defaultValue:
                            'Open the latest chapter and keep the evening story ritual moving.',
                        })}
                      </Text>
                      <View style={styles.featuredActionRow}>
                        <View style={styles.featuredAction}>
                          <Text style={styles.featuredActionText}>
                            {t('dashboard.continue_reading', { defaultValue: 'Continue reading' })}
                          </Text>
                          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                        </View>
                      </View>
                    </View>
                  </Pressable>
                ) : (
                  <View style={styles.featuredEmptyCard}>
                    <View style={styles.featuredEmptyBadge}>
                      <Ionicons
                        name="book-outline"
                        size={18}
                        color={modernColors.accentWarm}
                      />
                      <Text style={styles.featuredEmptyBadgeText}>
                        {t('dashboard.first_story_badge', { defaultValue: 'First story' })}
                      </Text>
                    </View>
                    <Text style={styles.featuredEmptyTitle}>
                      {t('dashboard.first_story_title', { defaultValue: 'Nothing on the shelf yet' })}
                    </Text>
                    <Text style={styles.featuredEmptyDescription}>
                      {t('dashboard.first_story_description', {
                        defaultValue:
                          'Create your first story and this space will turn into a family reading shortcut.',
                      })}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </AnimatedSection>

          {isChildSession && childQuizEnabled && quizCandidate ? (
            <AnimatedSection delay={90} trigger={enterKey}>
              <Pressable
                onPress={() =>
                  navigation.navigate('Story', {
                    storyId: quizCandidate.storyId,
                    scrollToQuiz: true,
                  })
                }
                style={({ hovered, pressed }: ExtendedPressableState) => [
                  styles.quizBanner,
                  hovered && Platform.OS === 'web' ? styles.quizBannerHover : null,
                  pressed ? styles.quizBannerPressed : null,
                ]}
              >
                <View style={styles.quizBannerIcon}>
                  <Ionicons name="gift-outline" size={21} color={theme.colors.text.inverse} />
                </View>
                <View style={styles.quizBannerCopy}>
                  <Text style={styles.quizBannerTitle}>
                    {t('dashboard.quiz_banner.title', {
                      defaultValue: 'Earn a new map piece for your world',
                    })}
                  </Text>
                  <Text style={styles.quizBannerText} numberOfLines={1}>
                    {t('dashboard.quiz_banner.body', {
                      title: quizCandidate.title,
                      defaultValue: 'Take a story quiz and open a prize in "{{title}}".',
                    })}
                  </Text>
                </View>
                <View style={styles.quizBannerAction}>
                  <Text style={styles.quizBannerActionText}>
                    {t('dashboard.quiz_banner.cta', { defaultValue: 'Go to quiz' })}
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={theme.colors.primary[700]}
                  />
                </View>
              </Pressable>
            </AnimatedSection>
          ) : null}

          {shelfStories.length > 0 && (
            <AnimatedSection delay={160} trigger={enterKey}>
              <View style={styles.shelfSection}>
                <View style={styles.shelfHeader}>
                  <View style={styles.shelfHeaderCopy}>
                    <Text style={styles.sectionTitle}>{t('dashboard.recent_stories')}</Text>
                    <Text style={styles.sectionHint}>
                      {t('dashboard.recent_stories_hint', {
                        defaultValue: 'A curated shelf of the stories your family opened most recently.',
                      })}
                    </Text>
                  </View>
                  <AppButton
                    label={t('dashboard.actions.view_library')}
                    onPress={() => navigation.navigate('Library')}
                    accessibilityLabel={t('dashboard.actions.view_library')}
                    variant="secondary"
                    size="md"
                    style={styles.libraryAction}
                  />
                </View>
                <View
                  style={[
                    styles.shelfGrid,
                    Platform.OS === 'web' &&
                      ({ gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any),
                  ]}
                >
                  {shelfStories.map((item) => (
                    <View key={item.id} style={[styles.gridCell, gridCellStyle]}>
                      <StoryCard
                        story={item}
                        onPress={() => navigateToStory(item.id)}
                        variant="grid"
                      />
                    </View>
                  ))}
                </View>
              </View>
            </AnimatedSection>
          )}

          {!featuredStory ? (
            <AnimatedSection delay={220} trigger={enterKey}>
              <AppButton
                label={t('dashboard.actions.view_library')}
                onPress={() => navigation.navigate('Library')}
                accessibilityLabel={t('dashboard.actions.view_library')}
                variant="secondary"
                size="md"
                style={styles.emptyLibraryAction}
              />
            </AnimatedSection>
          ) : null}
        </ScrollView>
      </LinearGradient>
      <FeedbackModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        initialReportedScreen="dashboard"
      />
    </>
  );
}

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[8],
    minHeight: '100%',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[8],
  },
  loadingText: {
    marginTop: theme.spacing[4],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  errorTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.status.error,
    marginBottom: theme.spacing[2],
  },
  errorMessage: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  retryAction: {
    minWidth: 200,
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing[8],
    marginBottom: theme.spacing[10],
  },
  topSectionCompact: {
    flexDirection: 'column',
    gap: theme.spacing[6],
  },
  quizBanner: {
    minHeight: 76,
    marginTop: -theme.spacing[4],
    marginBottom: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[5],
    borderRadius: 18,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing[4],
    ...modernShadows.card,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
      } as any,
      default: {},
    }),
  },
  quizBannerHover: Platform.select({
    web: {
      transform: 'translateY(-2px)',
    } as any,
    default: {},
  }),
  quizBannerPressed: {
    opacity: 0.94,
  },
  quizBannerIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.interactive.primary,
  },
  quizBannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  quizBannerTitle: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: 22,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  quizBannerText: {
    marginTop: 2,
    fontSize: theme.typography.fontSize.sm,
    lineHeight: 19,
    color: theme.colors.text.secondary,
  },
  quizBannerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: modernColors.accentWash,
  },
  quizBannerActionText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
  },
  heroColumn: {
    flex: 1,
    minWidth: 0,
    padding: theme.spacing[8],
    borderRadius: 32,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceRaised,
    ...modernShadows.raised,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing[3],
    marginBottom: theme.spacing[5],
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: modernColors.accentWarmSoft,
  },
  liveBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: modernColors.accentWarm,
  },
  liveBadgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#AE4B24',
  },
  eyebrow: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: modernColors.accentWash,
    color: theme.colors.primary[700],
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  greeting: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    lineHeight: 28,
    maxWidth: 520,
  },
  inlineMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[5],
    marginTop: theme.spacing[6],
  },
  inlineMetric: {
    minWidth: 96,
  },
  inlineMetricValue: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary[700],
  },
  inlineMetricLabel: {
    marginTop: theme.spacing[1],
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  inlineProfilesAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: modernColors.surfaceMuted,
  },
  inlineProfilesActionText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
  },
  primaryHeroAction: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing[6],
  },
  featuredColumn: {
    width: 420,
    maxWidth: '100%',
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  featuredCard: {
    position: 'relative',
    flex: 1,
    minHeight: 360,
    overflow: 'hidden',
    borderRadius: 34,
    backgroundColor: modernColors.surfaceRaised,
    ...modernShadows.raised,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
      } as any,
      default: {},
    }),
  },
  featuredCardHover: Platform.select({
    web: {
      transform: 'translateY(-4px)',
    } as any,
    default: {},
  }),
  featuredCardPressed: {
    opacity: 0.96,
  },
  featuredCover: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: theme.spacing[6],
  },
  featuredPill: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  featuredPillText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
  },
  featuredTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    lineHeight: 36,
    fontWeight: theme.typography.fontWeight.bold,
    color: '#FFFFFF',
  },
  featuredDescription: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.base,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.88)',
    maxWidth: 320,
  },
  featuredActionRow: {
    marginTop: theme.spacing[5],
  },
  featuredAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
  },
  featuredActionText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#FFFFFF',
  },
  featuredPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: modernColors.accentMintSoft,
  },
  featuredEmptyCard: {
    flex: 1,
    minHeight: 360,
    padding: theme.spacing[8],
    borderRadius: 34,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceRaised,
    justifyContent: 'center',
    ...modernShadows.card,
  },
  featuredEmptyBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    marginBottom: theme.spacing[5],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borders.radius.full,
    backgroundColor: modernColors.accentWarmSoft,
  },
  featuredEmptyBadgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: '#AE4B24',
  },
  featuredEmptyTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[3],
  },
  featuredEmptyDescription: {
    fontSize: theme.typography.fontSize.base,
    lineHeight: 26,
    color: theme.colors.text.secondary,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  },
  sectionHint: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  shelfSection: {
    marginBottom: theme.spacing[8],
  },
  shelfHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[5],
  },
  shelfHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  libraryAction: {
    alignSelf: 'flex-start',
  },
  shelfGrid: Platform.select({
    web: {
      display: 'grid' as any,
      gap: theme.spacing[5],
    },
    default: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: theme.spacing[5],
    },
  }),
  gridCell: {
    flex: 1,
    minWidth: 0,
  },
  gridCellFull: {
    flexBasis: '100%',
  },
  gridCellHalf: {
    flexBasis: '47%',
  },
  gridCellThird: {
    flexBasis: '30%',
  },
  emptyLibraryAction: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing[8],
  },
});
