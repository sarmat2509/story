import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  useScheduleStatus,
  useGenerateContinuation,
  useScheduleContinuation,
  useUnscheduleContinuation,
  useStoryStatus,
} from '@/api/stories';
import { navigateToStory } from '@/navigation/navigationRef';
import { toastService } from '@/services/toastService';
import { theme } from '@/theme';
import { APP_CONFIG } from '@/config/constants';
import { GenerationProgressModal } from '@/components/GenerationProgressModal';
import { AppButton } from '@/components/AppButton';
import i18n from '@/config/i18n';
import { getLocalizedApiError } from '@/utils/localizedApiError';

interface SeriesInfo {
  totalParts: number;
  baseTitle?: string;
}

interface Props {
  storyId: string;
  seriesInfo?: SeriesInfo | null;
  userPlan?: string | null;
  onNavigateToPlans: () => void;
  /** When true, renders compact card-style layout for grid placement */
  variant?: 'default' | 'card';
}

export function ContinueSeriesSection({
  storyId,
  seriesInfo: _seriesInfo,
  userPlan,
  onNavigateToPlans,
  variant = 'default',
}: Props) {
  const { t } = useTranslation();
  const [selectedCadence, setSelectedCadence] = useState<
    'daily' | 'every_2_days' | 'twice_weekly' | 'weekly'
  >('daily');
  const [cadenceDropdownOpen, setCadenceDropdownOpen] = useState(false);
  const [continuationRequestId, setContinuationRequestId] = useState<string | null>(null);

  const { data: scheduleData } = useScheduleStatus(storyId);
  const generateContinuation = useGenerateContinuation();
  const scheduleContinuation = useScheduleContinuation();
  const unscheduleContinuation = useUnscheduleContinuation();
  const { data: continuationStatus } = useStoryStatus(
    continuationRequestId || '',
    !!continuationRequestId
  );

  const hasSeriesAccess = userPlan === 'golden' || userPlan === 'fairyworld';
  const hasSchedule =
    scheduleData &&
    typeof scheduleData === 'object' &&
    'cadence' in scheduleData &&
    'nextRunAt' in scheduleData;
  const inProgressOnly =
    scheduleData &&
    typeof scheduleData === 'object' &&
    'inProgress' in scheduleData &&
    (scheduleData as { inProgress?: boolean }).inProgress &&
    !hasSchedule;

  const cadenceOptions = [
    { value: 'daily' as const, key: 'schedule_cadence_daily' },
    { value: 'every_2_days' as const, key: 'schedule_cadence_every_2_days' },
    { value: 'twice_weekly' as const, key: 'schedule_cadence_twice_weekly' },
    { value: 'weekly' as const, key: 'schedule_cadence_weekly' },
  ] as const;

  const handleContinue = useCallback(async () => {
    if (generateContinuation.isPending) return;
    try {
      const result = await generateContinuation.mutateAsync(storyId);
      setContinuationRequestId(result.id);
    } catch (error: unknown) {
      toastService.error(
        t('story_viewer.continuation_error'),
        getLocalizedApiError(t, error, 'story_viewer.audio_error_default')
      );
    }
  }, [storyId, generateContinuation, t]);

  const handleCloseContinuationModal = useCallback(() => {
    const newStoryId = continuationStatus?.storyId;
    setContinuationRequestId(null);
    if (newStoryId) {
      navigateToStory(newStoryId);
    }
  }, [continuationStatus]);

  const containerStyle =
    variant === 'card' ? styles.continueContainerCard : styles.continueContainer;
  const titleStyle = variant === 'card' ? styles.continueTitleCard : styles.continueTitle;
  const actionStyle = variant === 'card' ? styles.continueActionCard : styles.continueAction;

  if (!hasSeriesAccess) {
    return (
      <View style={containerStyle}>
        <Text style={titleStyle}>{t('story_viewer.series_locked_title')}</Text>
        <Text style={styles.continueDescription}>
          {t('story_viewer.series_locked_description')}
        </Text>
        <AppButton
          label={t('story_viewer.upgrade_to_unlock')}
          onPress={onNavigateToPlans}
          leading={<Ionicons name="lock-closed" size={22} color={theme.colors.text.inverse} />}
          style={actionStyle}
          size={variant === 'card' ? 'md' : 'lg'}
        />
      </View>
    );
  }

  return (
    <>
      <View style={containerStyle}>
        <Text style={titleStyle}>{t('story_viewer.enjoyed_story')}</Text>
        <AppButton
          label={t('story_viewer.continue_story')}
          onPress={handleContinue}
          disabled={generateContinuation.isPending}
          loading={generateContinuation.isPending}
          leading={<Ionicons name="play-forward" size={22} color={theme.colors.text.inverse} />}
          style={actionStyle}
          size={variant === 'card' ? 'md' : 'lg'}
        />

        {scheduleData !== undefined && !inProgressOnly && (
          <View style={styles.scheduleBlock}>
            <View style={styles.scheduleOrRow}>
              <View style={styles.scheduleOrLine} />
              <Text style={styles.scheduleOrText}>{t('story_viewer.schedule_or')}</Text>
              <View style={styles.scheduleOrLine} />
            </View>
            {hasSchedule ? (
              <>
                <Text style={styles.schedulePlannedText}>
                  {t('story_viewer.schedule_planned_on', {
                    date: new Date(
                      (scheduleData as { nextRunAt: string }).nextRunAt
                    ).toLocaleDateString(i18n.language || APP_CONFIG.defaultLanguage, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  })}
                </Text>
                <TouchableOpacity
                  style={styles.scheduleCancelButton}
                  onPress={() =>
                    unscheduleContinuation.mutate(storyId, {
                      onError: (err: unknown) =>
                        toastService.error(
                          getLocalizedApiError(t, err, 'story_viewer.audio_error_default')
                        ),
                    })
                  }
                  disabled={unscheduleContinuation.isPending}
                >
                  {unscheduleContinuation.isPending ? (
                    <ActivityIndicator size="small" color={theme.colors.interactive.primary} />
                  ) : (
                    <Text style={styles.scheduleCancelText}>
                      {t('story_viewer.schedule_cancel')}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.scheduleSectionTitle}>
                  {t('story_viewer.schedule_section_title')}
                </Text>
                <View style={styles.scheduleFormRow}>
                  <View style={styles.cadenceDropdownWrapper}>
                    <TouchableOpacity
                      style={styles.cadenceDropdownButton}
                      onPress={() => setCadenceDropdownOpen((prev) => !prev)}
                    >
                      <Text style={styles.cadenceDropdownText} numberOfLines={1}>
                        {t(`story_viewer.schedule_cadence_${selectedCadence}`)}
                      </Text>
                      <Ionicons
                        name={cadenceDropdownOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={theme.colors.text.tertiary}
                      />
                    </TouchableOpacity>
                    {cadenceDropdownOpen && (
                      <View style={styles.cadenceDropdownMenu}>
                        {cadenceOptions.map((opt) => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[
                              styles.cadenceDropdownItem,
                              selectedCadence === opt.value && styles.cadenceDropdownItemActive,
                            ]}
                            onPress={() => {
                              setSelectedCadence(opt.value);
                              setCadenceDropdownOpen(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.cadenceDropdownItemText,
                                selectedCadence === opt.value &&
                                  styles.cadenceDropdownItemTextActive,
                              ]}
                            >
                              {t(`story_viewer.${opt.key}`)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  <AppButton
                    label={t('story_viewer.schedule_button')}
                    onPress={() =>
                      scheduleContinuation.mutate(
                        { storyId, cadence: selectedCadence },
                        {
                          onError: (err: unknown) =>
                            toastService.error(
                              getLocalizedApiError(t, err, 'story_viewer.audio_error_default')
                            ),
                        }
                      )
                    }
                    disabled={scheduleContinuation.isPending}
                    loading={scheduleContinuation.isPending}
                    variant="secondary"
                    size="md"
                    style={styles.scheduleSubmitAction}
                    leading={
                      <Ionicons name="timer-outline" size={20} color={theme.colors.text.primary} />
                    }
                  />
                </View>
              </>
            )}
          </View>
        )}
        {inProgressOnly && (
          <Text style={styles.scheduleInProgressText}>
            {t('story_viewer.schedule_cancel_in_progress')}
          </Text>
        )}
      </View>

      <GenerationProgressModal
        visible={!!continuationRequestId}
        requestId={continuationRequestId ?? undefined}
        status={continuationStatus?.status ?? 'pending'}
        progress={continuationStatus?.progress ?? 0}
        progressData={continuationStatus?.progressData}
        errorMessage={continuationStatus?.errorMessage ?? undefined}
        onClose={handleCloseContinuationModal}
        onRetry={continuationStatus?.status === 'failed' ? handleContinue : undefined}
        allowManualClose={continuationStatus?.status === 'completed'}
      />
    </>
  );
}

const styles = StyleSheet.create({
  continueContainer: {
    marginTop: theme.spacing[12],
    marginBottom: theme.spacing[12],
    paddingHorizontal: theme.spacing[6],
    alignItems: 'center',
  },
  continueContainerCard: {
    padding: theme.spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borders.radius.lg,
    backgroundColor: theme.colors.background.secondary,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    alignSelf: 'stretch',
  },
  continueTitle: {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[2],
    textAlign: 'center',
  },
  continueTitleCard: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing[3],
    textAlign: 'center',
  },
  continueDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
  },
  continueAction: {
    minWidth: 280,
  },
  continueActionCard: {
    width: '100%',
  },
  scheduleBlock: {
    marginTop: theme.spacing[6],
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  scheduleOrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: theme.spacing[3],
  },
  scheduleOrLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border.light,
  },
  scheduleOrText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
  },
  schedulePlannedText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  scheduleCancelButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  scheduleCancelText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  scheduleSectionTitle: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  scheduleFormRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[3],
    flexWrap: 'wrap',
  },
  cadenceDropdownWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  cadenceDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    minWidth: 180,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.medium,
  },
  cadenceDropdownText: {
    flex: 1,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    textAlign: 'left',
  },
  cadenceDropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: theme.spacing[1],
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.md,
    borderWidth: theme.borders.width.thin,
    borderColor: theme.colors.border.light,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
      default: {
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
    }),
  },
  cadenceDropdownItem: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: theme.borders.width.thin,
    borderBottomColor: theme.colors.border.light,
  },
  cadenceDropdownItemActive: {
    backgroundColor: theme.colors.primary[50],
  },
  cadenceDropdownItemText: {
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
  },
  cadenceDropdownItemTextActive: {
    color: theme.colors.interactive.primary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  scheduleSubmitAction: {},
  scheduleInProgressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginTop: theme.spacing[2],
  },
});
