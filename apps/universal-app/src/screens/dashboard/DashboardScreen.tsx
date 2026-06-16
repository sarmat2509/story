import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from '@/components/AppLinearGradient';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useStories } from '@/api/stories';
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

/** Page background — follows active palette (not hardcoded lavender). */
const DASHBOARD_BG_GRADIENT = modernGradients.page;
export default function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const { user, sessionMode, activeChild } = useAuthStore();
  const isChildSession = sessionMode === 'child';
  const enterKey = useScreenEnter();
  const {
    data: storiesData,
    isLoading: storiesLoading,
    error: storiesError,
    refetch: refetchStories,
  } = useStories();
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
  const isLoading = storiesLoading || (!isChildSession && childrenLoading);
  const hasError = storiesError || (!isChildSession && childrenError);
  const greetingName = isChildSession ? activeChild?.name : user?.displayName;

  // Responsive columns: 1 on mobile, 2 on tablet, 3 on desktop
  const { width } = useWindowDimensions();
  const isCompact = width < 760;
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
            <View style={[styles.heroPanel, isCompact && styles.heroPanelCompact]}>
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>{t('navigation.dashboard')}</Text>
                <Text style={styles.greeting}>
                  {t('dashboard.welcome_back', { name: greetingName || 'User' })}
                </Text>
                <Text style={styles.subtext}>{t('dashboard.tagline')}</Text>
                <View style={styles.statPills}>
                  <View style={styles.statPill}>
                    <Text style={styles.statPillValue}>{storiesCount}</Text>
                    <Text style={styles.statPillLabel}>{t('dashboard.stats.stories')}</Text>
                  </View>
                  {!isChildSession ? (
                    <View style={styles.statPill}>
                      <Text style={styles.statPillValue}>{childrenCount}</Text>
                      <Text style={styles.statPillLabel}>{t('dashboard.stats.children')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={[styles.heroActions, isCompact && styles.heroActionsCompact]}>
                <AppButton
                  label={t('dashboard.actions.create_story')}
                  onPress={() => navigation.navigate('Wizard')}
                  accessibilityLabel={t('dashboard.actions.create_story')}
                  leading={
                    <Ionicons
                      name="sparkles-outline"
                      size={22}
                      color={theme.colors.text.inverse}
                    />
                  }
                  style={styles.primaryHeroAction}
                />
                {!isChildSession ? (
                  <AppButton
                    label={
                      canCreateMoreChildren
                        ? t('dashboard.actions.add_child')
                        : t('dashboard.actions.view_profiles')
                    }
                    onPress={() => navigation.navigate('Children')}
                    accessibilityLabel={
                      canCreateMoreChildren
                        ? t('dashboard.actions.add_child')
                        : t('dashboard.actions.view_profiles')
                    }
                    variant="secondary"
                    leading={
                      <Ionicons
                        name={canCreateMoreChildren ? 'person-add-outline' : 'people-outline'}
                        size={22}
                        color={theme.colors.text.primary}
                      />
                    }
                    style={styles.secondaryHeroAction}
                  />
                ) : null}
              </View>
            </View>
          </AnimatedSection>

          {/* Recent Stories */}
          {stories.length > 0 && (
            <AnimatedSection delay={160} trigger={enterKey}>
              <View style={styles.recentSection}>
                <Text style={styles.sectionTitle}>{t('dashboard.recent_stories')}</Text>
                <View
                  style={[
                    styles.recentStoriesGrid,
                    Platform.OS === 'web' &&
                      ({ gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any),
                  ]}
                >
                  {stories.slice(0, 6).map((item) => (
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

          {/* View Library Button */}
          <AnimatedSection delay={260} trigger={enterKey}>
            <AppButton
              label={t('dashboard.actions.view_library')}
              onPress={() => navigation.navigate('Library')}
              accessibilityLabel={t('dashboard.actions.view_library')}
              leading={
                <Ionicons name="library-outline" size={22} color={theme.colors.text.inverse} />
              }
              style={styles.dashboardActionSpacingBelow}
            />
          </AnimatedSection>
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
    padding: theme.spacing[6],
    minHeight: '100%',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
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
  heroPanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: theme.spacing[6],
    padding: theme.spacing[6],
    marginBottom: theme.spacing[8],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surface,
    ...modernShadows.raised,
  },
  heroPanelCompact: {
    flexDirection: 'column',
    gap: theme.spacing[5],
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  heroActions: {
    width: 360,
    maxWidth: '100%',
    justifyContent: 'center',
    gap: theme.spacing[3],
  },
  heroActionsCompact: {
    width: '100%',
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
    marginBottom: theme.spacing[3],
  },
  greeting: {
    fontSize: theme.typography.fontSize['3xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
  },
  subtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
  },
  statPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[4],
    marginTop: theme.spacing[5],
  },
  statPill: {
    minWidth: 104,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: modernColors.border,
    backgroundColor: modernColors.surfaceMuted,
  },
  statPillValue: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary[700],
  },
  statPillLabel: {
    marginTop: 2,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  primaryHeroAction: {
    alignSelf: 'stretch',
  },
  secondaryHeroAction: {
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[4],
  },
  recentSection: {
    marginBottom: theme.spacing[6],
  },
  recentStoriesGrid: Platform.select({
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
  dashboardActionSpacingBelow: {
    marginBottom: theme.spacing[6],
  },
});
