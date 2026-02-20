import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '@/theme';

// Phase weights for overall progress calculation
const PHASE_WEIGHTS: Record<string, number> = {
  'generating_text': 0.30,
  'validating': 0.20,
  'generating_images': 0.50,
};

interface Props {
  visible: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  progressData?: {
    activeTasks: Array<{ task: string; progress: number; details?: Record<string, any> }>;
    completedTasks: string[];
    overallProgress: number;
  };
  errorMessage?: string;
  onClose?: () => void;
  onRetry?: () => void;
  allowManualClose?: boolean;
}

export function GenerationProgressModal({
  visible,
  status,
  progress,
  progressData,
  errorMessage,
  onClose,
  onRetry,
  allowManualClose = false,
}: Props) {
  const [smoothProgress, setSmoothProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageTimerRef = useRef<number>(Date.now());
  const prevImageCountRef = useRef<number>(0);

  useEffect(() => {
    if (visible) {
      setSmoothProgress(0);
      prevImageCountRef.current = 0;
      imageTimerRef.current = Date.now();
    }
  }, [visible]);

  // Smooth time-based progress animation
  useEffect(() => {
    if (status !== 'processing' || !progressData) {
      if (status === 'completed') {
        setSmoothProgress(100);
      }
      return;
    }

    // Detect when a new image completes and reset the sub-image timer
    const activeDetails = progressData?.activeTasks?.[0]?.details;
    const currentImages = activeDetails?.current ?? 0;
    if (currentImages !== prevImageCountRef.current) {
      prevImageCountRef.current = currentImages;
      imageTimerRef.current = Date.now();
    }

    // Start interval for smooth progress updates
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const compute = () => {
      const computed = computeTimeBasedProgress(progressData, imageTimerRef.current);
      setSmoothProgress(computed);
    };

    compute(); // Initial compute
    intervalRef.current = setInterval(compute, 200); // Update every 200ms

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, progressData]);

  const getTaskLabel = (task: string) => {
    const labels: Record<string, string> = {
      'generating_text': 'Пишемо текст...',
      'validating': 'Перевіряємо безпечність контенту...',
      'generating_images': 'Створюємо ілюстрації...',
      'generating_audio': 'Озвучуємо історію...',
    };
    return labels[task] || 'Обробляємо запит...';
  };
  
  const getStatusText = () => {
    if (status === 'pending') {
      return 'Додаємо історію до черги...';
    }
    if (status === 'processing' && progressData?.activeTasks?.[0]) {
      return getTaskLabel(progressData.activeTasks[0].task);
    }
    if (status === 'completed') {
      return 'Готово! 🎉';
    }
    if (status === 'failed') {
      return errorMessage || 'Виникла помилка';
    }
    return 'Обробляємо запит...';
  };

  const getProgressPercentage = () => {
    if (status === 'completed') return 100;
    if (status === 'failed') return 0;
    // Use smooth time-based progress if available, fallback to server progress
    return smoothProgress || progressData?.overallProgress || progress;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {allowManualClose && onClose && status === 'completed' && (
            <TouchableOpacity 
              style={styles.closeIcon}
              onPress={onClose}
            >
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
          
          {status === 'completed' && (
            <Text style={styles.successIcon}>✅</Text>
          )}
          
          {status === 'failed' && (
            <Text style={styles.errorIcon}>❌</Text>
          )}
          
          <Text style={[
            styles.statusText,
            status === 'failed' && styles.errorText
          ]}>
            {getStatusText()}
          </Text>
          
          {status !== 'completed' && status !== 'failed' && (
            <>
              <View style={styles.progressBarContainer}>
                <View 
                  style={[
                    styles.progressBar, 
                    { width: `${getProgressPercentage()}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round(getProgressPercentage())}%
              </Text>
            </>
          )}
          
          {status === 'failed' && errorMessage && (
            <Text style={styles.errorMessage}>{errorMessage}</Text>
          )}
          
          {status === 'failed' && onRetry && (
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={onRetry}
            >
              <Text style={styles.retryButtonText}>Спробувати ще раз</Text>
            </TouchableOpacity>
          )}
          
          {status === 'completed' && onClose && (
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Переглянути історію</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Asymptotic easing: linear to 90% at ratio=1, then slowly approaches 99%.
 * Never truly reaches 100% — that only happens when completeTask fires.
 */
function asymptoticEase(ratio: number): number {
  if (ratio <= 1) {
    return 0.9 * ratio;
  }
  return 0.9 + 0.09 * (1 - 1 / (1 + (ratio - 1) * 3));
}

/**
 * Compute smooth time-based progress across 3 phases.
 * Uses elapsed time vs estimatedMs per phase for smooth animation.
 * Falls back to server-reported progress if timing data is unavailable.
 */
function computeTimeBasedProgress(progressData: {
  activeTasks: Array<{ task: string; progress: number; details?: Record<string, any> }>;
  completedTasks: string[];
  overallProgress: number;
}, imageStartTime: number): number {
  const { activeTasks, completedTasks } = progressData;

  let progress = 0;

  // Add completed phases' weights
  for (const task of completedTasks) {
    progress += PHASE_WEIGHTS[task] ?? 0;
  }

  // Add time-based progress for the active phase
  const active = activeTasks[0];
  if (active) {
    const weight = PHASE_WEIGHTS[active.task] ?? 0;
    const details = active.details;

    if (details?.estimatedMs && details?.startedAt) {
      const elapsed = Date.now() - details.startedAt;

      // For images: smooth per-image interpolation using tracked image timer
      if (active.task === 'generating_images' && details.total) {
        const current = details.current ?? 0;
        // Use observed average rate when images have completed, else use estimate
        const perImageMs = current > 0
          ? elapsed / current
          : details.estimatedMs / details.total;
        const timeSinceLastImage = Date.now() - imageStartTime;
        const subRatio = timeSinceLastImage / perImageMs;
        const subFraction = asymptoticEase(subRatio);
        const smoothPhaseProgress = (current + subFraction) / details.total;
        progress += smoothPhaseProgress * weight;
      } else {
        // Text / validation: asymptotic curve instead of hard 0.95 cap
        const ratio = elapsed / details.estimatedMs;
        progress += asymptoticEase(ratio) * weight;
      }
    } else {
      // Fallback: use server-reported task progress
      progress += (active.progress / 100) * weight;
    }
  }

  return Math.round(progress * 100);
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
    height: 8,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borders.radius.full,
    overflow: 'hidden',
    marginBottom: theme.spacing[3],
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.full,
  },
  progressText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.tertiary,
    marginBottom: theme.spacing[4],
  },
  errorMessage: {
    fontSize: theme.typography.fontSize.sm,
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
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
  closeButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    backgroundColor: theme.colors.interactive.primary,
    borderRadius: theme.borders.radius.md,
    marginTop: theme.spacing[4],
  },
  closeButtonText: {
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.inverse,
  },
});
