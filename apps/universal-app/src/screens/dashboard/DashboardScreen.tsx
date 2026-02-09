import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, FlatList, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { MainDrawerParamList } from '@/types/navigation';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useStories } from '@/api/stories';
import { useChildren } from '@/api/children';
import { StoryCard } from '@/components/StoryCard';
import { theme } from '@/theme';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const { user } = useAuthStore();
  const { data: storiesData, isLoading: storiesLoading, error: storiesError } = useStories();
  const { data: childrenData, isLoading: childrenLoading, error: childrenError } = useChildren();

  const stories = storiesData?.stories || [];
  const children = childrenData || [];
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
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('dashboard.loading')}</Text>
      </View>
    );
  }

  // Show error state
  if (hasError) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('dashboard.error_title')}</Text>
        <Text style={styles.errorMessage}>
          {(storiesError as any)?.message || (childrenError as any)?.message || t('dashboard.error_message')}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            // React Query will auto-retry
            window.location.reload();
          }}
        >
          <Text style={styles.retryButtonText}>{t('dashboard.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          {t('dashboard.welcome_back', { name: user?.displayName || 'User' })}
        </Text>
        <Text style={styles.subtext}>
          {t('dashboard.tagline')}
        </Text>
      </View>

      {/* Stats with integrated actions - 2 columns */}
      <View style={styles.statsSection}>
        {/* Stories Column */}
        <View style={styles.statColumn}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{storiesCount}</Text>
            <Text style={styles.statLabel}>{t('dashboard.stats.stories')}</Text>
          </View>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Wizard')}
          >
            <Text style={styles.actionIcon}>✨</Text>
            <Text style={styles.actionText}>{t('dashboard.actions.create_story')}</Text>
          </TouchableOpacity>
        </View>

        {/* Children Column */}
        <View style={styles.statColumn}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{childrenCount}</Text>
            <Text style={styles.statLabel}>{t('dashboard.stats.children')}</Text>
          </View>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Children')}
          >
            <Text style={styles.actionIcon}>👶</Text>
            <Text style={styles.actionText}>{t('dashboard.actions.add_child')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Stories */}
      {stories.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>{t('dashboard.recent_stories')}</Text>
          <FlatList
            data={stories.slice(0, 6)}
            keyExtractor={(item) => item.id}
            numColumns={numColumns}
            key={`dashboard-grid-${numColumns}`}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={{ width: `${100 / numColumns - 2}%`, marginBottom: theme.spacing[3] }}>
                <StoryCard 
                  story={item}
                  onPress={() => navigation.navigate('Story', { storyId: item.id })}
                  variant="grid"
                />
              </View>
            )}
            contentContainerStyle={{ gap: theme.spacing[4] }}
            columnWrapperStyle={{ gap: theme.spacing[4] }}
          />
        </View>
      )}

      {/* View Library Button */}
      <TouchableOpacity
        style={styles.viewLibraryButton}
        onPress={() => navigation.navigate('Library')}
      >
        <Text style={styles.viewLibraryIcon}>📚</Text>
        <Text style={styles.viewLibraryText}>{t('dashboard.actions.view_library')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: theme.spacing[6],
    minHeight: '100%',
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
    marginBottom: theme.spacing[6],
  },
  retryButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
  },
  retryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
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
    color: theme.colors.text.tertiary,
  },
  statsSection: {
    flexDirection: 'row',
    gap: theme.spacing[4],
    marginBottom: theme.spacing[8],
  },
  statColumn: {
    flex: 1,
  },
  statCard: {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing[5],
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    alignItems: 'center',
    marginBottom: theme.spacing[3],
  },
  statNumber: {
    fontSize: theme.typography.fontSize['4xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.interactive.primary,
    marginBottom: theme.spacing[1],
  },
  statLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[4],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.lg,
  },
  actionIcon: {
    fontSize: theme.typography.fontSize.xl,
    marginRight: theme.spacing[2],
  },
  actionText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
    textAlign: 'center',
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
  viewLibraryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[4],
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.lg,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    marginBottom: theme.spacing[6],
  },
  viewLibraryIcon: {
    fontSize: theme.typography.fontSize.xl,
    marginRight: theme.spacing[3],
  },
  viewLibraryText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  },
});
