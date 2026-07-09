import React from 'react';
import { Modal, View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RequestStatus, StoryRequestProgressData } from '@wondertales/shared';
import { AppButton } from '@/components/AppButton';
import { theme } from '@/theme';

interface Props {
  visible: boolean;
  requestId?: string;
  status: RequestStatus;
  progress: number;
  progressData?: StoryRequestProgressData;
  errorMessage?: string;
  onClose?: () => void;
  onRetry?: () => void;
  onReport?: () => void;
  allowManualClose?: boolean;
}

export function GenerationProgressModal({
  visible,
  requestId,
  status,
  progress,
  progressData,
  onClose,
  onRetry,
  onReport,
  allowManualClose = false,
}: Props) {
  const { t } = useTranslation();
  const maxSeenProgressRef = React.useRef(0);
  const requestIdRef = React.useRef<string | undefined>(requestId);

  React.useEffect(() => {
    if (requestIdRef.current !== requestId) {
      requestIdRef.current = requestId;
      maxSeenProgressRef.current = 0;
    }
  }, [requestId]);

  const getFallbackTask = () => {
    if (!progressData?.plannedTasks?.length) {
      return null;
    }

    const currentProgress = progressData.overallProgress ?? progress ?? 0;
    const incompletePlannedTask = progressData.plannedTasks.find((task) => {
      if (progressData.completedTasks.includes(task.task)) {
        return false;
      }

      return currentProgress <= task.rangeEnd;
    });

    return incompletePlannedTask?.task ?? null;
  };

  const getTaskLabel = (task: string, details?: Record<string, any>) => {
    const labels: Record<string, string> = {
      analyzing_photos: 'Аналізуємо фотографії...',
      generating_text: 'Пишемо текст...',
      producing_visuals: 'Готуємо сцени для ілюстрацій...',
      validating: 'Перевіряємо безпечність контенту...',
      generating_images: 'Створюємо ілюстрації...',
      generating_audio: 'Озвучуємо історію...',
    };

    const countBasedTasks = new Set([
      'generating_portraits',
      'generating_images',
      'generating_audio',
    ]);
    const hasCounters =
      typeof details?.current === 'number' &&
      Number.isFinite(details.current) &&
      typeof details?.total === 'number' &&
      Number.isFinite(details.total);

    if (task === 'generating_images') {
      return t(`story.${task}`, {
        defaultValue: labels[task] || 'Обробляємо запит...',
      });
    }

    if (countBasedTasks.has(task) && !hasCounters) {
      return t(`story.${task}`, {
        defaultValue: labels[task] || 'Обробляємо запит...',
      });
    }

    return t(`story.tasks.${task}`, {
      ...(details ?? {}),
      defaultValue: labels[task] || 'Обробляємо запит...',
    });
  };

  const getStatusText = () => {
    if (status === 'pending') {
      return 'Додаємо історію до черги...';
    }
    if (status === 'processing' && progressData?.activeTasks?.[0]) {
      return getTaskLabel(progressData.activeTasks[0].task, progressData.activeTasks[0].details);
    }
    if (status === 'processing') {
      const fallbackTask = getFallbackTask();
      if (fallbackTask) {
        return getTaskLabel(fallbackTask);
      }
    }
    if (status === 'completed') {
      return 'Готово! 🎉';
    }
    if (status === 'failed') {
      return t('wizard.create_error', {
        defaultValue: 'Виникла помилка при створенні історії. Спробуйте ще раз.',
      });
    }
    return 'Обробляємо запит...';
  };

  const getProgressPercentage = () => {
    if (status === 'completed') return 100;
    if (status === 'failed') return 0;

    const maxVisibleProgress = status === 'pending' || status === 'processing' ? 99 : 100;
    const incomingProgress = progressData?.overallProgress ?? progress ?? 0;
    const cappedIncomingProgress = Math.min(maxVisibleProgress, Math.max(0, incomingProgress));
    const cappedMaxSeenProgress = Math.min(maxVisibleProgress, maxSeenProgressRef.current);
    const clampedProgress = Math.max(cappedMaxSeenProgress, cappedIncomingProgress);
    maxSeenProgressRef.current = clampedProgress;
    return clampedProgress;
  };

  const isTakingLongerThanExpected = () => {
    if (status !== 'processing') {
      return false;
    }

    const activeTask = progressData?.activeTasks?.[0];
    if (!activeTask) {
      return false;
    }

    if (activeTask.details?.takingLongerThanExpected === true) {
      return true;
    }

    const timelineEntry = progressData?.taskTimeline?.[activeTask.task];
    const startedAt = Number(timelineEntry?.startedAt ?? activeTask.details?.startedAt);
    const estimatedMs = Number(timelineEntry?.estimatedMs ?? activeTask.details?.estimatedMs);
    if (!Number.isFinite(startedAt) || !Number.isFinite(estimatedMs) || estimatedMs <= 0) {
      return false;
    }

    return Date.now() - startedAt > estimatedMs * 1.15;
  };

  const progressPercentage = getProgressPercentage();
  const progressHint = isTakingLongerThanExpected()
    ? t('wizard.taking_longer_than_expected', {
        defaultValue: 'Це зайняло трохи більше часу, ніж очікувалося.',
      })
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {allowManualClose && onClose && status === 'completed' && (
            <TouchableOpacity style={styles.closeIcon} onPress={onClose}>
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>
          )}

          {status !== 'completed' && status !== 'failed' && (
            <ActivityIndicator
              size="large"
              color={theme.colors.interactive.primary}
              style={styles.spinner}
            />
          )}

          {status === 'completed' && <Text style={styles.successIcon}>✅</Text>}

          {status === 'failed' && <Text style={styles.errorIcon}>❌</Text>}

          <Text style={[styles.statusText, status === 'failed' && styles.errorText]}>
            {getStatusText()}
          </Text>

          {status !== 'completed' && status !== 'failed' && (
            <>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${progressPercentage}%` }]} />
              </View>
              <Text style={[styles.progressText, progressHint && styles.progressTextWithHint]}>
                {Math.round(progressPercentage)}%
              </Text>
              {progressHint && <Text style={styles.progressHint}>{progressHint}</Text>}
            </>
          )}

          {status === 'failed' && (
            <View style={styles.failedActions}>
              {onRetry && (
                <AppButton label={t('wizard.retry')} onPress={onRetry} style={styles.failedAction} />
              )}
              {onReport && (
                <AppButton
                  label={t('feedback.report_this_issue')}
                  onPress={onReport}
                  variant="secondary"
                  style={styles.failedAction}
                />
              )}
            </View>
          )}

          {status === 'completed' && onClose && (
            <AppButton
              label="Переглянути історію"
              onPress={onClose}
              style={styles.completedAction}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing[6],
  },
  modal: {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borders.radius.lg,
    padding: theme.spacing[8],
    alignItems: 'center',
    minWidth: 300,
    maxWidth: 400,
    position: 'relative',
  },
  closeIcon: {
    position: 'absolute',
    top: theme.spacing[4],
    right: theme.spacing[4],
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.full,
    zIndex: 10,
  },
  closeIconText: {
    fontSize: 20,
    color: theme.colors.text.tertiary,
    fontWeight: theme.typography.fontWeight.bold,
  },
  spinner: {
    marginBottom: theme.spacing[6],
  },
  successIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: theme.spacing[4],
  },
  statusText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
  },
  errorText: {
    color: theme.colors.status.error,
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.full,
    overflow: 'hidden',
    marginBottom: theme.spacing[3],
    // iOS-specific fixes
    minHeight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.light,
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.full,
    // iOS-specific fixes
    minHeight: 8,
    minWidth: 4, // Ensure bar is visible even at 0%
  },
  progressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  progressTextWithHint: {
    marginBottom: theme.spacing[1],
  },
  progressHint: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    textAlign: 'center',
    marginBottom: theme.spacing[4],
  },
  failedActions: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  failedAction: {
    minWidth: 160,
  },
  completedAction: {
    marginTop: theme.spacing[4],
  },
});
