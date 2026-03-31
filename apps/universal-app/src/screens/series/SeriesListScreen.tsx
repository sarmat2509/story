import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSeriesList } from '@/api/stories';
import { FeedbackModal } from '@/components/FeedbackModal';
import { FeedbackHeaderButton } from '@/components/FeedbackHeaderButton';
import { theme } from '@/theme';
import { SeriesCard } from '@/components/SeriesCard';
import type { MainDrawerParamList } from '@/types/navigation';

export default function SeriesListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<MainDrawerParamList>>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const { data: series, isLoading, error } = useSeriesList();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <FeedbackHeaderButton onPress={() => setShowFeedbackModal(true)} />
      ),
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['series-list'] });
    }, [queryClient])
  );

  const numColumns = width < 1024 ? 2 : 4;
  const cardWidth = (width - theme.spacing[4] * 2 - theme.spacing[4] * (numColumns - 1)) / numColumns;

  const handleSeriesPress = useCallback(
    (seriesId: string) => {
      navigation.navigate('SeriesDetail', { seriesId });
    },
    [navigation]
  );

  const handleGoToLibrary = useCallback(() => {
    navigation.navigate('Library');
  }, [navigation]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.interactive.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    const is403 = (error as { response?: { status?: number } })?.response?.status === 403;
    if (is403) {
      return (
        <View style={styles.centerContainer}>
          <Text style={styles.upgradeTitle}>{t('story_viewer.series_locked_title')}</Text>
          <Text style={styles.upgradeDescription}>{t('story_viewer.series_locked_description')}</Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => navigation.navigate('Plans' as never)}
          >
            <Ionicons name="lock-closed" size={24} color="#fff" />
            <Text style={styles.upgradeButtonText}>{t('story_viewer.upgrade_to_unlock')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('common.error')}</Text>
        <Text style={styles.errorMessage}>{(error as Error).message}</Text>
      </View>
    );
  }

  if (!series || series.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyTitle}>{t('series.empty_title')}</Text>
        <Text style={styles.emptySubtext}>{t('series.empty_subtext')}</Text>
        <TouchableOpacity style={styles.libraryButton} onPress={handleGoToLibrary}>
          <Text style={styles.libraryButtonText}>{t('series.go_to_library')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
    <ScrollView contentContainerStyle={styles.grid} style={styles.container}>
      <View
        style={[
          styles.gridContainer,
          Platform.OS === 'web' && { gridTemplateColumns: `repeat(${numColumns}, 1fr)` } as any,
        ]}
      >
        {series.map((s) =>
          Platform.OS === 'web' ? (
            <SeriesCard key={s.id} series={s} onPress={handleSeriesPress} cardWidth={cardWidth} />
          ) : (
            <View key={s.id} style={{ width: cardWidth }}>
              <SeriesCard series={s} onPress={handleSeriesPress} cardWidth={cardWidth} />
            </View>
          )
        )}
      </View>
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
  grid: {
    padding: theme.spacing[4],
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
  emptyTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  libraryButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
  },
  libraryButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  upgradeTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[2],
  },
  upgradeDescription: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[6],
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
  },
  upgradeButtonText: {
    color: theme.colors.text.inverse,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
  },
});
