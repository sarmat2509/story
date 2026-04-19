import React, { useCallback, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, FlatList, useWindowDimensions, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useStories } from '@/api/stories';
import { useChildren } from '@/api/children';
import { navigateToStory } from '@/navigation/navigationRef';
import { StoryCard } from '@/components/StoryCard';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { GradientButton } from '@/components/GradientButton';
import { GlassCard } from '@/components/GlassCard';
import { AnimatedSection } from '@/components/AnimatedSection';
import { InteractiveSurface } from '@/components/InteractiveSurface';
import { useScreenEnter } from '@/hooks/useScreenEnter';
import { theme } from '@/theme';
import { hexAlpha } from '@/theme/colorAlpha';

/** Page background — follows active palette (not hardcoded lavender). */
const DASHBOARD_BG_GRADIENT: [string, string] = [
  theme.colors.background.secondary,
  theme.colors.primary[50],
];

const BOKEH_ONE_COLOR = hexAlpha(theme.colors.primary[400], 0.26);
const BOKEH_TWO_COLOR = hexAlpha(theme.colors.primary[300], 0.22);
const VIEW_LIBRARY_SHADOW = hexAlpha(theme.colors.primary[900], 0.28);

export default function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
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
      headerRight: () => (
        <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />
      ),
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
  } = useChildren();

  const stories = storiesData?.stories || [];
  const children = childrenData?.children ?? [];
  const canCreateMoreChildren = childrenData?.canCreateMore ?? true;
  const storiesCount = Number(storiesData?.pagination?.total) || 0;
  const childrenCount = children.length;
  const isLoading = storiesLoading || childrenLoading;
  const hasError = storiesError || childrenError;

  // Responsive columns: 2 on mobile, 3 on desktop
  const { width } = useWindowDimensions();
  const numColumns = width < 768 ? 2 : 3;

  // Show loading state
  if (isLoading) {
    return (
      <LinearGradient
        colors={DASHBOARD_BG_GRADIENT}
        style={styles.centerContainer}
      >
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('dashboard.loading')}</Text>
      </LinearGradient>
    );
  }

  // Show error state
  if (hasError) {
    return (
      <LinearGradient
        colors={DASHBOARD_BG_GRADIENT}
        style={styles.centerContainer}
      >
        <Text style={styles.errorTitle}>{t('dashboard.error_title')}</Text>
        <Text style={styles.errorMessage}>
          {(storiesError as any)?.message || (childrenError as any)?.message || t('dashboard.error_message')}
        </Text>
        <GradientButton
          label={t('dashboard.retry')}
          onPress={() => {
            refetchStories();
            refetchChildren();
          }}
          style={styles.retryButton}
        />
      </LinearGradient>
    );
  }

  return (
    <>
    <LinearGradient
      colors={DASHBOARD_BG_GRADIENT}
      style={styles.gradientBackground}
    >
      <View pointerEvents="none" style={styles.bokehOne} />
      <View pointerEvents="none" style={styles.bokehTwo} />
      <ScrollView contentContainerStyle={styles.content}>
        <AnimatedSection delay={0} trigger={enterKey}>
          <View style={styles.header}>
            <Text style={styles.greeting}>
              {t('dashboard.welcome_back', { name: user?.displayName || 'User' })}
            </Text>
            <Text style={styles.subtext}>
              {t('dashboard.tagline')}
            </Text>
          </View>
        </AnimatedSection>

        {/* Stats with integrated actions - 2 columns */}
        <AnimatedSection delay={120} trigger={enterKey}>
        <View style={styles.statsSection}>
          {/* Stories Column */}
          <View style={styles.statColumn}>
            <GlassCard style={styles.statCard}>
              <Text style={styles.statNumber}>{storiesCount}</Text>
              <Text style={styles.statLabel}>{t('dashboard.stats.stories')}</Text>
            </GlassCard>
            <GradientButton
              label={t('dashboard.actions.create_story')}
              onPress={() => navigation.navigate('Wizard')}
              leading={
                <Ionicons
                  name="sparkles"
                  size={18}
                  color={theme.colors.text.inverse}
                />
              }
            />
          </View>

          {/* Children Column */}
          <View style={styles.statColumn}>
            <GlassCard style={styles.statCard}>
              <Text style={styles.statNumber}>{childrenCount}</Text>
              <Text style={styles.statLabel}>{t('dashboard.stats.children')}</Text>
            </GlassCard>
            <GradientButton
              label={canCreateMoreChildren ? t('dashboard.actions.add_child') : t('dashboard.actions.view_profiles')}
              onPress={() => navigation.navigate('Children')}
              leading={
                <Ionicons
                  name={canCreateMoreChildren ? 'person-add' : 'people'}
                  size={18}
                  color={theme.colors.text.inverse}
                />
              }
            />
          </View>
        </View>
        </AnimatedSection>

        {/* Recent Stories */}
        {stories.length > 0 && (
          <AnimatedSection delay={240} trigger={enterKey}>
            <View style={styles.recentSection}>
              <Text style={styles.sectionTitle}>{t('dashboard.recent_stories')}</Text>
              <FlatList
                data={stories.slice(0, 6)}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                key={`dashboard-grid-${numColumns}`}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.gridCell}>
                    <StoryCard
                      story={item}
                      onPress={() => navigateToStory(item.id)}
                      variant="grid"
                    />
                  </View>
                )}
                contentContainerStyle={styles.gridContent}
                columnWrapperStyle={styles.gridRow}
              />
            </View>
          </AnimatedSection>
        )}

        {/* View Library Button */}
        <AnimatedSection delay={360} trigger={enterKey}>
          <InteractiveSurface
            style={styles.viewLibraryButton}
            onPress={() => navigation.navigate('Library')}
            accessibilityLabel={t('dashboard.actions.view_library')}
          >
            <Ionicons
              name="library-outline"
              size={22}
              color={theme.colors.primary[700]}
              style={styles.viewLibraryIcon}
            />
            <Text style={styles.viewLibraryText}>{t('dashboard.actions.view_library')}</Text>
          </InteractiveSurface>
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
  bokehOne: {
    position: 'absolute',
    top: -160,
    right: -140,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: BOKEH_ONE_COLOR,
    ...Platform.select({
      web: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filter: 'blur(80px)' as any,
      },
      default: {},
    }),
  },
  bokehTwo: {
    position: 'absolute',
    bottom: -180,
    left: -140,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: BOKEH_TWO_COLOR,
    ...Platform.select({
      web: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filter: 'blur(90px)' as any,
      },
      default: {},
    }),
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
  retryButton: {
    minWidth: 200,
  },
  header: {
    marginBottom: theme.spacing[8],
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
  statsSection: {
    flexDirection: 'row',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[8],
  },
  statColumn: {
    flex: 1,
    gap: theme.spacing[3],
  },
  statCard: {
    padding: theme.spacing[5],
    alignItems: 'center',
  },
  statNumber: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.primary[700],
    marginBottom: theme.spacing[1],
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeight.medium,
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
  gridContent: {
    gap: theme.spacing[4],
  },
  gridRow: {
    gap: theme.spacing[4],
  },
  gridCell: {
    flex: 1,
  },
  viewLibraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[4],
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: theme.borders.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    marginBottom: theme.spacing[6],
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.primary[900],
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 3 },
      web: {
        boxShadow: `0 18px 34px -20px ${VIEW_LIBRARY_SHADOW}` as unknown as string,
      },
    }),
  },
  viewLibraryIcon: {
    marginRight: theme.spacing[3],
  },
  viewLibraryText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.primary[700],
  },
});
